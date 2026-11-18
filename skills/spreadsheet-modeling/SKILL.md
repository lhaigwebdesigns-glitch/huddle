---
name: spreadsheet-modeling
description: Build spreadsheets and data models: tables, formulas, budgets, trackers, forecasts and data cleaning.
---
# Spreadsheet modeling

## Using Huddle Sheets
- Make real sheets with `create_sheet(title, csv, ops)`; everyone in the room co-edits them live. Use a chat table only for a quick 3–5 row answer.
- CSV: first row is headers, one row per record. Put formulas straight into cells: `Total,=SUM(B2:B9)`.
- Supported functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK, MEDIAN, PRODUCT, ROUND/ROUNDUP/ROUNDDOWN, ABS, SQRT, POWER, MOD, INT, IF, IFERROR, AND, OR, NOT, SUMIF, COUNTIF, CONCAT, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, TODAY, PI. Operators: + - * / ^ & % and comparisons (= <> < > <= >=). No XLOOKUP/VLOOKUP or whole-column refs (use A2:A50), so pick an explicit range.
- Then format with ops: bold, tinted header row (`"bg":"#eef2ff"`), `"format":"currency"` for money, `"percent"` for rates, and widen long text columns with `col_width`.
- Add a chart when the numbers tell a story: `{"op":"add_chart","type":"bar","range":"A1:B6","title":"…"}`. The first column holds the labels and the first row the series names; use line charts for time and pie only for parts of a whole.
- To change a sheet, `read_sheet` first (it returns computed values and formulas), then `edit_sheet` with targeted ops. Don't rebuild the whole sheet.

## Modeling
- Separate inputs (assumptions), calculations, and outputs. Label units in headers ("Cost ($)").
- One row per record, one column per attribute; no merged cells in data tables.
- Prefer formulas over hard-coded numbers so the sheet updates when someone changes an input.
- Sanity-check totals and call out assumptions in your chat reply.
