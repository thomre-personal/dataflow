# DataFlow

DataFlow is a canvas for working with tables, SQL queries, and charts. This first build runs as a local web app. It includes a sample finance workspace.

## Run locally

Use Node.js 24 or newer, then run:

```sh
npm ci
npm run dev
```

Open [DataFlow on your computer](http://127.0.0.1:5173/). Use that same address on later visits to reopen the workspaces saved in that browser profile.

## Turn a table into a chart

1. Open a new workspace from the workspace menu.
2. Copy cells in Numbers or Excel. Choose **Paste data** and paste the range. Select the number format if automatic detection does not match the source.
3. Add a **SQL** block and connect the table in the SQL editor. Use the displayed input name in your query. Choose **Save and run** to see the result in **Data**.
4. Add a **Chart** block. In the chart dialog, choose the source, the chart type, and the axes.
5. Type in **Find a block** at the top and choose a match to see its inputs and outputs. **Cmd+K** or **Ctrl+K** focuses the search. Drag from an output port to an input port to connect blocks. Use the inspector to assign a block to a group.

Tables and charts start expanded on the canvas. Drag any edge or corner to resize one, or use the collapse button for a smaller preview. Edit expanded tables directly on the canvas. Choose **Lock** for a read-only view and **Unlock** to edit again. When you hover over a table or SQL query, drag its **+** output onto an empty part of the canvas to configure a connected query or chart.

Click a block name to rename it directly on the canvas. Press **Enter** to save or **Esc** to cancel. **Open query** opens the SQL editor in a dialog. **Open chart** opens the chart preview and settings in a dialog. To remove a selected block, press **Delete** or choose **Delete block** at the bottom of the inspector.

Drag a block type from the canvas toolbar to place it. A dropped table is ready to edit on the canvas. A dropped query or chart opens its dialog.

Drag a block by its header into an open group. Drag it outside the group to move it out. Groups can contain other groups. Resize a group at its edges or corners, or collapse it to hide its contents while keeping connections to other blocks visible.

Use **Undo** and **Redo** in the top bar to step through workspace changes during the current browser session. DataFlow saves the workspace after each step.

Open **Settings** from the gear in the top right to choose Light, Dark, or Auto, change keyboard shortcuts, and choose whether a shortcut asks before deleting a block.

In the table editor, select a cell and press **Option+↑** or **Option+↓** to insert a row above or below. Press **Option+←** or **Option+→** to insert a column to the left or right. Use **Alt** on a non-Mac keyboard.

Set **Title columns** to highlight columns on the left. Set **Footer rows** to keep summary rows at the bottom. SQL queries and charts include title columns and skip footer rows.

New columns start with letter names and the **Auto** type. Auto uses the data rows to infer a column type for SQL and charts. Use **First row** to switch between starting at 1 and starting at 0. Use the trash button in a column header to delete that column.

Enter `=SUM()` in a footer cell to total its own column. Enter `=SUM(Amount)` in another column to total `Amount`. You can use a column letter such as `=SUM(A)` as well. A matching column name takes precedence over a letter. Sums include data rows and skip footer rows. Click a calculated cell to see its formula. Renaming a column updates formulas that refer to its name.

Type `=` to see formula suggestions. Use the arrow keys and **Return** to choose one. Press **Return** again to confirm the cell once you have finished typing. Start a value with an apostrophe to treat it as text. For example, `'=` displays `=`.

| Formula | Example |
| --- | --- |
| `AVERAGE` or `AVG` | `=AVG(Amount)` averages the numbers in a column. |
| `SUMIF` | `=SUMIF(Category, "Groceries", Amount)` adds the amounts for matching categories. |
| `COUNTIF` | `=COUNTIF(Status, "Open")` counts matching rows. Numeric criteria such as `">100"` work too. |
| `COUNT` and `DISTINCT` | `=COUNT(DISTINCT(Category))` counts unique nonempty categories. Text comparisons ignore case. |
| `MIN`, `MAX`, and `MEDIAN` | `=MAX(Date)` finds the latest date. These functions also work with numbers. If a date median falls between days, it returns the earlier day. |
| `CONCAT` | `=CONCAT("Order #", OrderID, " / ", Status)` joins literal text and values from the same row. Use two double quotes for a quotation mark inside a literal. |

Column totals, averages, counts, and date aggregates use data rows and skip footer rows. Direct column references in `CONCAT` use the row that contains the formula. You can also pass a function result to `CONCAT`. For example, `=CONCAT("DISTINCT:", COUNT(DISTINCT(Category)))` displays `DISTINCT:3` when there are three unique nonempty categories.

Date, number, and Boolean columns validate their cells as you edit or paste. Empty cells are allowed. DataFlow shows invalid values so you can correct them before running a query or plotting the table.

The app saves drafts and canvas positions in IndexedDB. DuckDB runs in a local browser worker. A separate browser profile or address has separate storage. Clearing that storage deletes its local workspaces.

The first build accepts up to 10,000 rows and 80 columns per pasted range. Query results can contain up to 10,000 rows. A chart displays up to 100 result rows.

## Check the app

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

To use an installed Chrome instead, run `DATAFLOW_BROWSER=chrome npm run test:browser` after building.

## Product notes

- [MVP scope](MVP.md)
- [Design](DESIGN.md)
- [Version history and collaboration](VERSIONING.md)
- [Data protection](DATA-PROTECTION.md)
- [Future features](FUTURE-FEATURES.md)
- [AI suggestions](AI-SUGGESTIONS.md)
