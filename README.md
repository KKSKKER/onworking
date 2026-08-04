# OnWorking

> A transparent, rule-driven ETL desktop app that turns scattered Excel/CSV files into clean, queryable tables.

OnWorking is a desktop application for turning scattered, similarly-formatted Excel/CSV files into clean, queryable SQLite tables. Instead of hand-editing spreadsheets, you describe how each file should be processed in a plain-YAML rule, and OnWorking merges everything into one table — with every row traceable back to the file, sheet, and row it came from.

> **Note:** The app UI is currently in Chinese (中文界面).

---

## Why OnWorking?

Financial and business data often arrives as dozens of similarly-structured Excel files scattered across folders. Manually cleaning, merging, and reconciling them is slow and error-prone — and once the numbers are combined, nobody can trace a figure back to the file it came from.

OnWorking addresses both problems:

- **Rules, not scripts.** Each file/sheet is processed by a declarative YAML rule: which sheet to read, which row is the header, where the data ends, how each column maps to a table field, and which transforms to apply. Rules are plain text — reviewable by humans and readable/auditable by AI tools.
- **Lineage on every row.** Every merged row keeps its origin: `__source_file`, `__source_sheet`, `__source_row`, `__extracted_at`. No more "where did this number come from?"

## Features

- **Rule-driven cleaning** — map source columns to table fields with typed coercion (string / number / date / enum / boolean) and row filtering.
- **Money as integer cents** — amounts are stored as integers (×100) to avoid floating-point precision errors.
- **Row-level lineage** — `__source_file`, `__source_sheet`, `__source_row`, `__extracted_at` on every merged row.
- **Folders as tables** — drop same-format files into a folder, one click merges them into a single table.
- **Master tables** — aggregate every BigTable folder into one master table for the whole workspace.
- **SQL workbench** — built-in table browser, SQL editor, and one-click CSV export (with UTF-8 BOM so Excel opens Chinese correctly).
- **Auto-generated rules** — detect column types from a sample and generate a starter rule.
- **Excel & CSV** — reads `.xlsx`, `.xls` and `.csv`.

## How it works

### Core concepts

| Concept | Meaning |
|---|---|
| **Workspace** | A root directory for your data: `source/` for raw files, `.onworking/` for rules, settings, and the SQLite database. |
| **BigTable** | A folder that defines one output table (`settings.json` = table name, columns, primary key) with its own `source/` folder and rule state. |
| **Source file** | An Excel or CSV file placed in a BigTable's `source/` directory. |
| **Rule** | A YAML file describing how one file/sheet maps into the table: sheet, header row, cutoff row, field mapping, transforms, merge strategy. |

### Data flow

```
    Excel/CSV files (source/)          Rules (YAML)
    ┌────────────────────────┐        ┌──────────────────────────────┐
    │ *.xlsx  *.xls  *.csv   │        │ rule_*.yaml                   │
    └───────────┬────────────┘        │ · sheet / header row          │
                │                     │ · end row (cutoff)            │
                └──────────┬──────────┤ · field mapping               │
                           │          │ · transforms                  │
                           ▼          │ · merge strategy              │
               ┌────────────────────┐ └──────────────────────────────┘
               │     ETL pipeline   │
               │ scan → parse →     │
               │ transform →        │
               │ validate → insert  │
               └─────────┬──────────┘
                         ▼
              SQLite big table (per folder)
              + lineage: __source_file,
                __source_sheet, __source_row,
                __extracted_at
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
 buildMasterTable                SQL workbench
 (aggregate all folders)         · query · export CSV
        │
        ▼
   Master table
```

### The four views

The app is a single window with four views:

- **Config** — the main workbench: a folder tree of BigTables on the left, a rule editor / table settings panel on the right.
- **Preview** — a paginated preview of a source file before merging, with the header row and cutoff row highlighted.
- **Results** — merge a folder, generate the master table, browse the result, and export CSV.
- **SQL** — a table browser and SQL editor: run queries, export CSV, or copy the table structure as an AI-friendly text prompt.

## Screenshots

<!-- TODO: add your own screenshots to docs/screenshots/ and update the paths -->

![Config workbench](docs/screenshots/config.png)

![Preview](docs/screenshots/preview.png)

![Results & export](docs/screenshots/results.png)

![SQL workbench](docs/screenshots/sql.png)

## Getting started

### Requirements

- Node.js 18 or newer

### Run in development

```bash
npm install
npm start
```

This builds the main process, starts the Vite dev server, and launches Electron.

### Package installers

```bash
npm run dist
```

Output goes to `release/` (NSIS installer on Windows, DMG on macOS, AppImage on Linux).

### Tests & typecheck

```bash
npm test
npm run typecheck
```

## Usage

A typical workflow:

1. **Open a workspace** — pick a folder that will hold all your data.
2. **Create a BigTable** — configure its name, columns (text / amount-cents / number / date), and optional primary key.
3. **Add source files** — drop `.xlsx` / `.xls` / `.csv` files into the BigTable's `source/` folder.
4. **Write a rule** — for each file, pick the sheet, the header row and the cutoff row, map each column to a table field, and choose transforms. Or click **auto-detect** to generate a starter rule from a sample.
5. **Merge the folder** — all source files flow through their rules into one table, keeping row-level lineage.
6. **Generate the master table & query** — aggregate all BigTable folders, then explore the data in the SQL workbench or export CSV.

## Rule format

Rules are stored as YAML in each BigTable's `.onworking/rules/` folder. A minimal example:

```yaml
name: rule_voucher_1
display: "Voucher book"
version: 1
sources:
  - pattern: "**/voucher.xls"   # glob matched against the folder's source/
    sheetIndex: 0
    headerRow: 1                # 1-based row that holds the header
    endRow: 10374               # 1-based cutoff row (omit = read to the end)
fields:
  - sourceHeader: 日期          # column in the source file
    outputName: date
    included: true
    order: 1
    transforms:
      - kind: coerce_date
        formats: ["YYYY/M/D", "YYYY-MM-DD"]
        excelSerial: true
        fallbackStrategy: "null"
        aiRationale: "Date column"
  - sourceHeader: 金额          # amount column
    outputName: amount_cents
    included: true
    order: 2
    transforms:
      - kind: coerce_number
        outputType: cents       # stored as integer cents (×100)
        negativePattern: leading_dash
        aiRationale: "Money in cents to avoid float errors"
mergeStrategy:
  mode: append
```

### Transforms

Implemented transforms (applied in a fixed order):

| Kind | Purpose |
|---|---|
| `coerce_string` | Trim, lowercase/uppercase, max length, null-value list. |
| `coerce_number` | Parse numbers/amounts; handles thousands & decimal separators and negative patterns; `cents` output stores integer ×100. |
| `coerce_date` | Parse dates from declared formats, including Excel serial numbers. |
| `coerce_enum` | Map source values to canonical values. |
| `coerce_boolean` | Map true/false value sets. |
| `filter_rows` | Drop rows by operator (`eq`, `contains`, `regex`, `in`, …). |

Every transform carries a required `aiRationale` field, so AI-generated rules must explain why each step was applied — keeping the pipeline transparent and auditable.

## Project structure

```
onworking/
├── src/
│   ├── common/                  # types & utils shared by main + renderer
│   │   └── types/               # rule / transform / parse-config types
│   ├── main/                    # Electron main process
│   │   ├── api/                 # single unified IPC router
│   │   ├── db/                  # SQLite (better-sqlite3 in a worker thread, WAL)
│   │   ├── etl/                 # ETL pipeline: scanner, parser, transform, validator, inserter
│   │   ├── rules/               # YAML rule store & compiler
│   │   ├── workspace/           # workspace lifecycle & manager
│   │   └── plugins/onw-excel/   # Excel/CSV parser plugin
│   └── renderer/                # React UI
│       ├── components/          # the four views, rule editor, tables, SQL workbench
│       └── state/               # client-side state stores
└── tests/                       # integration tests (vitest)
```

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 31 |
| UI | React 18 · TypeScript 5.6 |
| Bundler / dev server | Vite 6 |
| Spreadsheet engine | Univer (`@univerjs`) |
| Database | SQLite via better-sqlite3 (worker thread + WAL) |
| Excel/CSV parsing | SheetJS (`xlsx`) |
| Rule storage | YAML (`js-yaml`) |
| Packaging | electron-builder (NSIS / DMG / AppImage) |
| Testing | Vitest |

## License

Licensed under the [Apache License 2.0](LICENSE).
