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
2. Copy cells in Numbers or Excel. Choose **Paste data** and paste the range. Select the number format if automatic detection does not match the source. Press **Enter** to create the table or **Shift+Enter** to add a line break while entering the range.
3. Add a **SQL** block and connect the table in the SQL editor. Use the displayed input name in your query. Choose **Save and run** to see the result in **Data**.
4. Add a **Chart** block. In the chart dialog, choose the source, the chart type, and the axes.
5. Type in **Find a block** at the top and choose a match to see its inputs and outputs. **Cmd+K** or **Ctrl+K** focuses the search. Drag from an output port to an input port to connect blocks. Use the inspector to assign a block to a group.

Tables and charts start expanded on the canvas. Drag any edge or corner to resize one, or use the collapse button for a smaller preview. Edit expanded tables directly on the canvas. Choose **Lock** for a read-only view and **Unlock** to edit again. Drag a **+** output onto an empty part of the canvas to configure a connected query or chart. When the source is a table, you can also create a connected table and reference the source in formulas.

Scroll over the canvas to zoom. Over an expanded table or SQL result, the wheel scrolls the rows while there is room to scroll in that direction. It pans the canvas up or down when the table fits or reaches its edge.

Click a block name to rename it directly on the canvas. Press **Enter** to save or **Esc** to cancel. In a SQL block, choose **SQL** or **Results** to switch between the code preview and the scrollable result table. The workspace saves this choice for each SQL block. Use **Run** to execute the query and **Open query** to edit it. **Open chart** opens the chart preview and settings in a dialog. To remove a selected block, press **Delete** or choose **Delete block** at the bottom of the inspector.

Click a connection line and press **Delete** to disconnect two blocks. You can also disconnect inputs in the inspector. Table formulas that depend on a removed connection show a validation error. **Undo** restores the connection.

Drag a block type from the canvas toolbar to place it. A dropped table is ready to edit on the canvas. A dropped query or chart opens its dialog.

Drag a block by its header into an open group. Drag it outside the group to move it out. Drag the background of a group to move the entire group. Groups can contain other groups. Resize a group at its edges or corners, or collapse it to hide its contents while keeping connections to other blocks visible. Focusing a group reveals all of its blocks and nested groups. Connections from its members lead to upstream blocks on the left and downstream blocks on the right.

Use **Undo** and **Redo** in the top bar to step through workspace changes during the current browser session. DataFlow saves the workspace after each step.

Open **Settings** from the gear in the top right to choose Light, Dark, or Auto, change keyboard shortcuts, and choose whether a shortcut asks before deleting a block.

SQL queries and charts refresh automatically when input data changes. Turn off **Automatically refresh computed blocks when inputs change** to keep the previous result until you choose **Run query** or **Refresh chart**. Charts based on SQL show the query's latest result. Table cell formulas update as you edit.

### Config blocks

Add a **Config** block for values you want to reuse. Give it a name and add fields with sliders, multiple-choice checkboxes, toggles, or text inputs. In **Data type**, choose Auto, Text, Number, Date, or Boolean for input and multiple-choice fields. Sliders use Number and toggles use Boolean. Invalid values are marked on the field. Once the config is created, change its values and save, load, or delete presets in the canvas block.

Connect a config to a table from its output port or through **Connect input**. Enable **Global config** to use it across the workspace without a connection. A formula such as `=A1*MeineConfig.SoliFactor` reads the current field value. Use brackets around names with spaces, as in `=[Tax settings].[Soli factor]`.

In SQL, use the config's input alias as a one-row table. The SQL editor lists aliases for connected and global configs. For example, `SELECT SoliFactor FROM meineconfig` reads the current factor. Multiple-choice selections are JSON arrays stored as text. Changing a value or loading a preset updates dependent formulas and follows the automatic refresh setting for SQL.

### Switch blocks

Add a **Switch** to alternate between two sets of config presets. Name options A and B, then choose the presets for each option. Global configs are available automatically. Connect any local configs the switch should control. If a config has no preset for an option, the switch leaves its values as they are.

Click the button on the switch to apply an option and click again to apply the other. One Undo reverses the entire change. Connect the switch to a table or SQL block to make its local configs available to that block.

### Table editing

Select a table on the canvas to show its add-row and add-column handles outside the card. Click a handle to add one row or column, or drag it outward to add several and grow the table. Locking a table keeps its layout and disables editing. Paste clipboard data by selecting the starting cell and pressing **Cmd+V**.

Click a cell once to select it. Drag from one cell to another to select the rectangle between them. You can also select a cell and Shift-click the other corner. Click a selected cell again or press **Enter** to edit. Press **Shift+Enter** while editing to insert a line break and **Enter** to confirm. Long text wraps within the width of the cell. This visual wrapping leaves the stored text as entered.

Click a row number or a column header to select the entire row or column. This includes cells beyond the visible rows. Double-click a column header or press **F2** while it has focus to open its settings.

Drag the divider at the right edge of a column header or the bottom edge of a row number to resize it. Double-click a divider to fit its contents. The canvas card grows if the resized grid needs more room. Double-click an outer card edge to fit the table along that edge.

In the table editor, select a cell and press **Option+↑** or **Option+↓** to insert a row above or below. Press **Option+←** or **Option+→** to insert a column to the left or right. Use **Alt** on a non-Mac keyboard.

In **Table options** in the inspector, set **Title columns** to highlight columns on the left and **Footer rows** to keep summary rows at the bottom. Footer cells can contain text or formulas in any column. DataFlow still checks for formula errors. SQL queries and charts include title columns and skip footer rows.

New tables use the **Grid** style by default. Blank tables start with two rows and two columns, **A** and **B**. New columns use the **Auto** type. Auto uses the data rows to infer a column type for SQL and charts. Use **First row** in the inspector to choose whether row numbering starts at 1 or 0. In **Column settings**, edit the name, set the data type, or delete the column.

Enter `=SUM()` in a footer cell to total its own column. Enter `=SUM(Amount)` in another column to total `Amount`. You can use a column letter such as `=SUM(A)` as well. A matching column name takes precedence over a letter. Sums include data rows and skip footer rows. Click a calculated cell to see its formula. Renaming a column updates formulas that refer to its name.

Type `=` to see formula suggestions. Use the arrow keys and **Return** to choose one. While editing a formula, click another cell in the same table to insert its address at the cursor. Press **Return** to confirm the cell once you have finished typing. Start a value with an apostrophe to treat it as text. For example, `'=` displays `=`.

Select a cell to see its formula and the functions it uses in **Cell options**. Expand a function for its syntax and an example. **Search functions** filters the full catalog below the functions used in the cell. Cell options are also available in the table dialog.

Use **Formatting** in **Cell options** to set the font, size, text styles, alignment, font color, and background color. Choose a color from the palette or the custom picker, then choose **Apply**. Formatting applies to every selected cell.

Press **Cmd+B**, **Cmd+I**, or **Cmd+U** to toggle bold, italic, or underline for the selected cells. Use **Ctrl** on other platforms. You can change these shortcuts in **Settings**.

With a selection, use **Cmd+C** and **Cmd+V** to copy and paste complete cells within DataFlow. Use **Ctrl+C** and **Ctrl+V** on other platforms. While editing, those shortcuts act on the text in the editor.

Press **Delete** or **Backspace** on selected cells to clear their values and formulas while keeping their formatting. One **Undo** restores the whole selection's contents.

On a Mac, press **Option+Cmd+C** to copy a cell's style, then select a cell or range and press **Option+Cmd+V** to paste it. Use **Ctrl+Alt+C** and **Ctrl+Alt+V** on other platforms. You can also use the copy and paste buttons in the inspector. Style paste keeps the target cells' values and formulas.

Select a whole row or column to copy each cell's style in order. Select another row or column and paste to apply those styles in the same order. Paste applies as many styles as fit.

| Formula | Example |
| --- | --- |
| `AVERAGE` or `AVG` | `=AVG(Amount)` averages the numbers in a column. |
| `SUMIF` | `=SUMIF(Category, "Groceries", Amount)` adds the amounts for matching categories. |
| `COUNTIF` | `=COUNTIF(Status, "Open")` counts matching rows. Numeric criteria such as `">100"` work too. |
| `COUNT` and `DISTINCT` | `=COUNT(DISTINCT(Category))` counts unique nonempty categories. Text comparisons ignore case. |
| `MIN`, `MAX`, and `MEDIAN` | `=MAX(Date)` finds the latest date. These functions also work with numbers. If a date median falls between days, it returns the earlier day. |
| `CONCAT` | `=CONCAT("Order #", OrderID, " / ", Status)` joins literal text and values from the same row. Use two double quotes for a quotation mark inside a literal. |
| `AND`, `OR`, and `NOT` | `=AND(Paid, NOT(Archived))` checks that a row is paid and active. |
| `XOR`, `XNOR`, and `XAND` | `=XOR(Paid, Refunded)` checks that exactly one of these two values is true. With more arguments, XOR checks for an odd number of true values. XNOR and its alias XAND check for an even number. |
| `NAND` and `NOR` | `=NOR(Paid, Refunded)` checks that neither value is true. NAND reverses the result of AND. |

Column totals, averages, counts, and date aggregates use data rows and skip footer rows. Direct column references in `CONCAT` use the row that contains the formula. You can also pass a function result to `CONCAT`. For example, `=CONCAT("DISTINCT:", COUNT(DISTINCT(Category)))` displays `DISTINCT:3` when there are three unique nonempty categories.

Boolean functions accept `TRUE`, `FALSE`, Boolean values in the current row, and other Boolean formulas. Use an **Auto** or **Boolean** column for their results if you want SQL to read them as Booleans.

To aggregate a column in another table, connect that table to the one containing the formula. Drag its output port or **+** onto the destination table, or choose it under **Connect input** in the inspector. Then enter a formula such as `=MEDIAN(Transactions::Amount)`. A formula can use the source table’s name or the input alias shown in the inspector. The result updates as the source data changes. For `SUMIF`, the condition and sum columns must come from the same table.

Date, number, and Boolean columns validate their data rows as you edit or paste. Empty cells are allowed. DataFlow shows invalid values so you can correct them before running a query or plotting the table.

## Save a workspace as a file

DataFlow saves workspaces and their canvas positions in the browser by default. A different browser profile or address has its own storage. Clearing the site's data removes those browser copies. DuckDB runs in a local browser worker.

1. In Chrome or Edge on desktop, open **Workspaces** and choose **Save as file…**. Pick a folder in your Git working tree, in iCloud Drive, or on your computer. DataFlow names the new `.dataflow.json` file after the workspace and adds a number if the name is already taken.
2. DataFlow saves edits to that file automatically and keeps a recovery draft in the browser. **Open file…** links an existing document. Use **Enable file autosave** if the browser needs permission to write.
3. DataFlow checks for external changes before saving, when you return to the tab, and when you choose **Check file**. If it reports **File changed**, choose **Open file version** to load the file and keep any unsaved edits as a separate browser workspace. Choose **Save as new file…** to keep editing your draft in a different file.

**Import a copy…** and **Export a copy** work without direct file access. You can use them in browsers such as Safari and Firefox. Imported copies save in the browser. The file contains the canvas, tables, formulas, SQL, charts, and links in readable JSON. Git can track it with your usual workflow.

iCloud Drive handles file transfers between devices. Use one editor at a time and let the file sync before switching devices. The future DataFlow cloud is intended for simultaneous editing, with a workspace file available as the starting point for a future import.

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
- [Data connectors](DATA-CONNECTORS.md)
- [TODO](TODO.md)
- [AI suggestions](AI-SUGGESTIONS.md)
