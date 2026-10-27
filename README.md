# datatransform.dev

Privacy-first browser tools for working with data. Compare text and tables, clean up values, convert files, and prepare data for import.

[Use the tools at datatransform.dev](https://datatransform.dev/).

This repository makes the source code available for transparency. You can inspect how the tools process data and what runs in your browser.

## Tools

| Tool | What it does |
| --- | --- |
| [Text diff](https://datatransform.dev/text-diff/) | Compare two versions of text and see additions, deletions, and changed words. |
| [Base64 encoder and decoder](https://datatransform.dev/base64-decoder-encoder/) | Encode text or files as Base64, or decode Base64 into text and files. |
| [Bitwise flag decoder](https://datatransform.dev/bitwise-flag-decoder/) | Decode bitmasks, name flags, and save reusable configurations. |
| [CSV search, filter and transform](https://datatransform.dev/csv-search-filter-transform/) | Filter rows, edit values, remove duplicates, split or combine columns, and split output into files. |
| [List comparison](https://datatransform.dev/list-comparison/) | Find shared and exclusive items, merge lists, and compare frequencies. |
| [CSV merge and join](https://datatransform.dev/csv-merge-join/) | Stack CSV files or match records using identifying columns. |
| [Compare tables](https://datatransform.dev/compare-tables/) | Find added records, removed records, and changed cells between two tables. |
| [JSON explorer](https://datatransform.dev/json-explorer/) | Find JSON records, choose fields, and export tables. |
| [JSON workbench](https://datatransform.dev/json-workbench/) | Inspect, query, edit, validate, and compare JSON. |
| [CSV to JSON converter](https://datatransform.dev/csv-to-json/) | Convert CSV to JSON or a JavaScript constant, with optional splitting of a column into an array. |
| [Data file converter](https://datatransform.dev/data-file-converter/) | Convert CSV, TSV, Excel, Parquet, JSON, and JSON Lines, with Markdown table export. |
| [Data quality checker](https://datatransform.dev/data-quality-checker/) | Check missing values, duplicates, dates, numbers, and allowed categories. |
| [Clean and standardise values](https://datatransform.dev/data-cleaner/) | Clean text, review similar spellings, and convert dates, time zones, and number formats. |
| [Summarise and reshape tables](https://datatransform.dev/summarise-reshape/) | Group and total records, pivot tables, turn columns into rows, and expand multi-value cells. |
| [Prepare an import file](https://datatransform.dev/prepare-import/) | Map source columns to a destination template, fill defaults, convert values, and check required fields. |
| [Mask sensitive data](https://datatransform.dev/mask-sensitive-data/) | Remove columns or replace values with consistent placeholders before sharing. |
| [Extract from text](https://datatransform.dev/extract-from-text/) | Extract emails, URLs, labelled values and patterns into a list or table. |

Each tool includes fictional example data so you can try it before using your own files.

## Privacy

Tool inputs and results are processed in your browser. The application does not upload them, save them in browser storage, or include them in URLs. Your theme preference is saved locally.

Cloudflare hosts the website and provides Web Analytics for page visits and loading performance. Tool inputs, files, clipboard contents, and results are not sent to analytics. See the [privacy page](https://datatransform.dev/privacy/) for details.

## Feedback

Report bugs or suggest improvements through [GitHub Issues](https://github.com/casacapybara/datatransform.dev/issues). Issues are public, so use a small fictional example when describing a problem.

## Licence

The project code, documentation, and Flow logo use the [MIT licence](LICENSE).

Bundled third-party libraries retain their own licences:

- [Diff Match Patch](text-diff/vendor/README.md): [Apache 2.0](text-diff/vendor/LICENSE.txt).
- [SheetJS Community Edition](data-file-converter/vendor/README.md): [Apache 2.0](data-file-converter/vendor/LICENSE.txt).

JSON and Parquet browser library licences are collected in [library notices](shared/vendor/NOTICE.txt).
