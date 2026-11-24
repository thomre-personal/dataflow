import * as duckdb from '@duckdb/duckdb-wasm';
import wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import workerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import wasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import workerEhUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { MAX_ROWS } from './clipboard';
import { tableResult } from './format';
import type { Block, Result, TableBlock, ValueType, Workspace } from './workspace';

const bundles: duckdb.DuckDBBundles = {
  mvp: { mainModule: wasm, mainWorker: workerUrl },
  eh: { mainModule: wasmEh, mainWorker: workerEhUrl },
};
let engine: Promise<duckdb.AsyncDuckDB> | undefined;
let worker: Worker | undefined;
let queue = Promise.resolve();

function database(): Promise<duckdb.AsyncDuckDB> {
  engine ??= (async () => {
    const bundle = await duckdb.selectBundle(bundles);
    if (!bundle.mainWorker) throw new Error('This browser could not start the SQL engine.');
    const instance = new Worker(bundle.mainWorker);
    worker = instance;
    try {
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), instance);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      await db.open({ allowUnsignedExtensions: false });
      const connection = await db.connect();
      try {
        await connection.query("SET enable_external_access = false; SET memory_limit = '192MB'; SET max_temp_directory_size = '0B'; SET lock_configuration = true;");
      } finally {
        await connection.close();
      }
      return db;
    } catch (error) {
      instance.terminate();
      if (worker === instance) worker = undefined;
      throw error;
    }
  })();
  return engine;
}

const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";

function selectSql(sql: string): string {
  // Mask literals and comments when checking for statement boundaries.
  const masked = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\$([A-Za-z_]\w*|)\$[\s\S]*?\$\1\$/g, (token) =>
    (token.startsWith('--') || token.startsWith('/*') ? ' ' : 'x').repeat(token.length));
  const significant = masked.trimEnd();
  const end = significant.endsWith(';') ? significant.length - 1 : significant.length;
  const statement = significant.slice(0, end).trim();
  if (!/^(SELECT|WITH|VALUES)\b/i.test(statement) || statement.includes(';')) {
    throw new Error('Enter one read-only SQL query starting with SELECT, WITH, or VALUES.');
  }
  return sql.slice(0, end).trim();
}

function columnType(sqlType: string): ValueType {
  if (/^DATE$/i.test(sqlType)) return 'date';
  if (/^BOOLEAN$/i.test(sqlType)) return 'boolean';
  if (/^(U?(?:TINY|SMALL|BIG|HUGE)?INT(?:EGER)?|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL)\b/i.test(sqlType)) return 'decimal';
  return 'text';
}

async function createSource(connection: duckdb.AsyncDuckDBConnection, name: string, table: TableBlock) {
  const names = new Set<string>();
  const result = tableResult(table);
  const columns = result.columns.map((column) => {
    const name = column.name.trim();
    const key = name.toLowerCase();
    if (!name || names.has(key)) throw new Error(table.title + ' has empty or duplicate column names.');
    names.add(key);
    return { ...column, name };
  });
  const scales = columns.map(() => 0);
  const integralWidths = columns.map(() => 0);
  const values = result.rows.map((row) => '(' + columns.map((column, index) => {
    const value = row[index];
    if (value === null) return 'NULL';
    if (column.type === 'decimal') {
      const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
      scales[index] = Math.max(scales[index], fraction.length);
      integralWidths[index] = Math.max(integralWidths[index], integer.replace(/^0+/, '').length);
    }
    return literal(value);
  }).join(', ') + ')');
  const fields = columns.map((column, index) => {
    const scale = scales[index];
    if (scale + integralWidths[index] > 38) throw new Error('Numbers in ' + column.name + ' exceed DuckDB’s 38-digit decimal precision.');
    const type = column.type === 'decimal' ? 'DECIMAL(38,' + scale + ')'
      : column.type === 'date' ? 'DATE' : column.type === 'boolean' ? 'BOOLEAN' : 'VARCHAR';
    return identifier(column.name) + ' ' + type;
  });
  await connection.query('CREATE TEMP TABLE ' + identifier(name) + ' (' + fields.join(', ') + ')');
  for (let offset = 0; offset < values.length; offset += 250) {
    await connection.query('INSERT INTO ' + identifier(name) + ' VALUES ' + values.slice(offset, offset + 250).join(', '));
  }
}

async function displayResult(connection: duckdb.AsyncDuckDBConnection, name: string): Promise<Result> {
  const description = await connection.query('DESCRIBE ' + identifier(name));
  const names = description.toArray().map((row) => String(row.column_name));
  const columns = description.toArray().map((row, index) => ({
    name: names[index], type: columnType(String(row.column_type)),
  }));
  // Casting on the SQL side preserves exact decimals, dates and large integers.
  const select = names.map((name, index) => 'CAST(' + identifier(name) + ' AS VARCHAR) AS c' + index).join(', ');
  const values = await connection.query('SELECT ' + select + ' FROM ' + identifier(name) + ' LIMIT ' + (MAX_ROWS + 1));
  if (values.numRows > MAX_ROWS) throw new Error('The result exceeds ' + MAX_ROWS.toLocaleString() + ' rows. Aggregate it or add a LIMIT.');
  return { columns, rows: values.toArray().map((row) => names.map((_, index) => row['c' + index] ?? null)) };
}

async function execute(db: duckdb.AsyncDuckDB, workspace: Workspace, blockId: string): Promise<Result> {
  const connection = await db.connect();
  const tables = new Map<string, string>();
  try {
    async function materialize(block: Block): Promise<string> {
      const existing = tables.get(block.id);
      if (existing) return existing;
      const name = '_dataflow_' + block.id.replace(/[^a-z0-9]/gi, '_');
      if (block.kind === 'table') {
        await createSource(connection, name, block);
      } else if (block.kind === 'sql') {
        const links = workspace.links.filter((link) => link.target === block.id);
        const inputs = [];
        for (const link of links) {
          const input = workspace.blocks.find((candidate) => candidate.id === link.source);
          if (input) inputs.push({ name: await materialize(input), alias: link.alias });
        }
        const created: string[] = [];
        try {
          for (const input of inputs) {
            await connection.query('CREATE TEMP VIEW ' + identifier(input.alias) + ' AS SELECT * FROM ' + identifier(input.name));
            created.push(input.alias);
          }
          const sql = selectSql(block.sql);
          await connection.query('CREATE TEMP TABLE ' + identifier(name) + ' AS SELECT * FROM (\n' + sql + '\n) AS query_result LIMIT ' + (MAX_ROWS + 1));
          const count = await connection.query('SELECT count(*) AS total FROM ' + identifier(name));
          if (Number(count.get(0)?.total ?? 0) > MAX_ROWS) {
            throw new Error(block.title + ' produced more than ' + MAX_ROWS.toLocaleString() + ' rows. Aggregate it or add a LIMIT.');
          }
        } finally {
          for (const alias of created) await connection.query('DROP VIEW ' + identifier(alias));
        }
      } else {
        throw new Error('Connect a table or SQL query.');
      }
      tables.set(block.id, name);
      return name;
    }
    const block = workspace.blocks.find((candidate) => candidate.id === blockId);
    if (!block) throw new Error('This block is no longer available.');
    return await displayResult(connection, await materialize(block));
  } finally {
    await connection.close();
  }
}

export function runQuery(workspace: Workspace, blockId: string): Promise<Result> {
  const task = queue.then(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          worker?.terminate();
          worker = undefined;
          engine = undefined;
          reject(new Error('The SQL engine took too long. Try a smaller query and run it again.'));
        }, 15_000);
      });
      return await Promise.race([database().then((db) => execute(db, workspace, blockId)), timeout]);
    } catch (error) {
      // A rejected initialization should be retryable.
      if (!worker) engine = undefined;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
  queue = task.then(() => {}, () => {});
  return task;
}
