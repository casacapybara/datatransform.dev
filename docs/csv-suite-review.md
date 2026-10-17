# CSV suite review

Reviewed 17 October 2026. The public entry point is `csv-search-filter-transform/index.html`. The original standalone HTML files are excluded from the build.

## Data handling and dependencies

The suite reads selected files with `File.text()` and pasted text from a textarea. Parsing, filters, value changes, column projection and export run in browser memory. There are no uploads, network calls, cookies, data storage or third-party libraries in the tool code. Shared theme code stores the theme preference. Cloudflare analytics on the deployed site remains separate from tool processing.

User data enters the document through `textContent` and form values. It is never evaluated or inserted as HTML. Copy writes to the clipboard only after a click. Downloads use Blob URLs, which are revoked after use. Reset clears the loaded data, pasted text, filters, changes, column settings and output. Loading invalid replacement data preserves the current dataset and reports the error.

The implementation uses repository-owned code and platform APIs under the repository MIT licence. No package or external asset was added. Scripts and styles are separate files compatible with the site's Content Security Policy.

## Data integrity

The parser supports UTF-8 BOMs, comma delimiters, quoted cells, doubled quotes, embedded CRLF, and LF or CR record separators. Blank physical lines are skipped. Quoted empty cells and comma-only rows are preserved. Invalid quoting and unequal row widths fail before loading. Blank, duplicate and padded headers receive unique, trimmed names with a visible warning.

Searches inspect the original data. Positive constraints match any term in any chosen column. Negative searches retain rows only when no term occurs in any chosen column. Repeated output emits one row per matching term, regardless of how many columns match that term. Blank search keeps all rows for text constraints. Empty and non-empty constraints ignore search terms and compare any or every chosen column. Whitespace-only cells count as empty when matching trims values.

Column value changes run in order without mutating the source. A new change is inactive until a column is chosen. An empty replacement clears cells in set mode or removes matching text in find-and-replace mode. Find-and-replace escapes regular-expression metacharacters, replaces every literal occurrence and treats replacement text literally. Case-sensitive matching can be disabled. Active replacement rules require non-empty find text, even when no rows match. Output selection, order and renamed headers apply to all formats. Duplicate and empty output names block export. Search helper names avoid collisions with output names.

CSV formula protection is enabled by default and can be disabled for an exact text export. Protection prefixes potentially executable spreadsheet cells with an apostrophe. JSON and JavaScript values remain strings unless the selected comma-list column is split into an array. No date or numeric inference occurs. JavaScript identifiers are sanitized, including reserved words. JavaScript exports preserve `__proto__` as an own property through a computed key.

Any filter or output-validation error clears the current export and disables copy and download. Reset and newer loads cancel pending file reads. The row preview uses the chosen output columns and JSON transformations. Formatted text is limited to 30,000 preview characters; copy and download use the complete result.

## Manual rows, duplicate removal and sorting

Manual rows are appended after filtering and value changes. They contain text values for every original column, including columns later excluded from output. Empty and multiline values are allowed. Added rows can be removed individually and are cleared by reset or a successful replacement load. Source-record helpers label them `Manual`.

Duplicate removal runs after manual rows are appended and before sorting. It compares all original columns or selected key columns using changed values. It keeps the first occurrence, ignores helpers and uses exact, case-sensitive values by default. Optional controls ignore surrounding whitespace or letter case. Empty keys can be duplicates. Tuple encoding avoids ambiguous concatenated keys. Enabling key comparison without selecting keys blocks export.

Sort rules run in listed priority order. Text uses case-sensitive character order. Numeric rules accept finite decimal numbers, including exponent notation, and use JavaScript number comparison. They reject mixed values and magnitudes above the safe integer range. Numeric sorting is approximate for fractional values at floating-point precision. Use text mode for exact IDs and long numeric strings. Empty and whitespace-only cells sort last in either direction. Equal keys retain their prior order. Sorting never modifies loaded values.

## Limits and compatibility

Limits are 5 MiB UTF-8 input, 20,000 data or output rows, 100 columns, 500,000 cells, 100 distinct criteria, 5 million comparisons and 20 million output characters. There are at most 100 value changes, with up to 10,000 characters per find or replacement value. Each manual cell allows up to 10,000 characters. Sort rules are limited to the number of loaded columns. The table preview displays at most 100 rows. Processing runs on the main thread and may briefly pause the page near those limits.

Modern browsers with `File.text()`, `TextEncoder`, Blob URLs and standard JavaScript support are required. Clipboard access may require a secure context or browser permission. A failed copy reports an error and leaves download available. Local file use has relative script and stylesheet paths; hosted use follows the shared site headers.

Desktop and 390-pixel layouts were inspected in the local browser. Full cross-browser and deployed Cloudflare-header checks remain release checks.

## Validation

`npm test` covers CSV quoting and round trips, malformed input, duplicate and special headers, search semantics, repeats, ordered edits, output selection and names, array splitting, indentation, numeric header order, spreadsheet protection, empty output, limits, stale results and file-read races. Build checks verify that only public assets are copied and that local dependencies resolve.

Browser checks cover paste disclosure, loading, filtering, multiple value changes, column exclusion, reorder and rename, JSON array splitting, formatted output, empty-cell constraints, literal replacement, manual rows, key-based duplicate removal, multiple sort columns, and narrow-screen layout.
