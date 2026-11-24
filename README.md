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
3. Add a **SQL** block and connect the table. The inspector shows the table name to use in SQL. Run the query and inspect the result in **Data**.
4. Add a **Chart** block and connect it to the query. Choose bar or line and set the axes as needed.
5. Type in **Find a block** at the top and choose a match to see its inputs and outputs. **Cmd+K** or **Ctrl+K** focuses the search. Drag from an output port to an input port to connect blocks. Use the inspector to assign a block to a group.

Use the expand button on a table or chart to show it at a larger size on the canvas. Drag any edge or corner to resize it. Tables scroll to show all rows and columns. When you hover over a table or SQL query, drag its **+** output onto an empty part of the canvas to configure a connected query or chart.

Click a block name to rename it directly on the canvas. Press **Enter** to save or **Esc** to cancel. **Open query** takes you to the SQL editor in the inspector. To remove a selected block, press **Delete** or choose **Delete block** at the bottom of the inspector.

Drag a block type from the canvas toolbar to place it and start editing on the canvas. Use **Edit inline** to edit an existing table, query, or chart on its card.

Use **Undo** and **Redo** in the top bar to step through workspace changes during the current browser session. DataFlow saves the workspace after each step.

In the table editor, select a cell and press **Option+↑** or **Option+↓** to insert a row above or below. Press **Option+←** or **Option+→** to insert a column to the left or right. Use **Alt** on a non-Mac keyboard.

Set **Title columns** to highlight columns on the left. Set **Footer rows** to keep summary rows at the bottom. SQL queries and charts include title columns and skip footer rows.

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
