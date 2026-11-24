# DataFlow MVP

## First user and goal

The first user is the product owner. They use Apple Numbers for personal finances, hobbies, and other projects. They need a familiar way to work with tables and the ability to write and reuse SQL or code when a spreadsheet becomes limiting.

## Workspace and canvas

A workspace is the unit users open and work in. Each workspace has one canvas in the MVP. Tables, SQL queries, and charts are blocks on that canvas. Groups and search help users navigate the canvas in place of workbook tabs.

Workspace is the working term. The final name in the app is open. Tabs within a block, such as **SQL** and **Data**, are still part of the design.

## Proposed first workflow

Start with a personal spending analysis. Paste a range from an existing Numbers table into an editable DataFlow table. Create a SQL block that uses the table as input and groups spending by month and category. Inspect the result as a table and connect it to a chart. When transactions change, run the same query again to update the chart.

Use a small anonymized copy of a real Numbers table to check the workflow. Include dates, currency amounts, blank cells, and amounts with the user's decimal format.

## Proposed MVP scope

- **Editable tables.** Copy a range in Apple Numbers or Microsoft Excel and paste it into a DataFlow table using the same workflow. Preserve rows, columns, and empty cells. Let users correct values or column types after pasting. Start with cell values and basic column formatting. Paste formula results as values.
- **Canvas.** Name and connect table, SQL, and chart blocks. Use groups to organize them. Find a block by name and show which blocks supply or use its data.
- **SQL.** Write and run a query on connected tables. View the SQL and its result in separate tabs. Show errors where the user can fix them.
- **History.** Autosave edits, support undo and redo during a session, and list automatic snapshots by date and time. Add comments and SemVer tags, compare and restore versions, and merge simple variants with a way to resolve conflicts. See [version history and collaboration](VERSIONING.md).
- **AI-assisted SQL.** Offer a draft from a plain-language request. Show the SQL diff and a data preview before the user accepts the change. Manual SQL follows the same version and preview workflow.
- **Appearance.** Use the slate themes and table presets in [the design notes](DESIGN.md).
- **Workspace files.** Open and autosave a local workspace document, or use import and export. Store it in a Git working tree or in iCloud Drive. Keep a browser draft when file access or autosave is paused.

The first workflow is complete when the user can paste, edit, query, and chart their own data, reopen the workspace, and restore a prior calculation with its saved inputs. A query should be reusable when the source table changes.

Verify the paste workflow with ranges copied from both Numbers and Excel. Use the owner's Numbers workbook for the first hands-on test and a separate Excel sample for compatibility testing.

## Open decisions

- Pick the first real Numbers workbook to use for testing.
- Decide whether a later release needs a direct Git integration. Local workspace files already support an external Git workflow.
- Choose how the first AI provider is configured. Writing and running SQL remains available independently of the AI provider.
- Decide when to introduce [simultaneous editing of the same workspace](VERSIONING.md#edit-the-same-workspace-together). The first validation workflow is personal, and simultaneous editing is a product requirement.

## Later scope

Organization sharing, publishing across workspaces, embeds, component catalogs, and additional programming languages remain part of the broader product. They can follow once the personal workflow works end to end. See also [future features](FUTURE-FEATURES.md).
