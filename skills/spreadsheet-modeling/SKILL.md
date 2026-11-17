---
name: spreadsheet-modeling
description: Build spreadsheets and data models: tables, formulas, budgets, trackers, forecasts and data cleaning.
---
# Spreadsheet modeling

- Separate inputs (assumptions), calculations, and outputs. Label units in headers ("Cost ($)").
- One row per record, one column per attribute; no merged cells in data tables.
- Prefer formulas over hard-coded numbers: SUM, AVERAGE, SUMIFS, COUNTIFS, XLOOKUP/INDEX-MATCH, IF, ROUND.
- Show formulas explicitly (e.g. `=SUMIFS(C:C, A:A, "Food")`) so users can paste them into Sheets/Excel.
- Present tables as Markdown tables in chat or docs; include totals rows.
- Sanity-check totals and call out assumptions.
