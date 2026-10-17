# Tool event hooks

Event hooks are prepared but have no collection destination. They dispatch `datatransform:event` within the browser page. Nothing is transmitted, logged, queued, or stored.

| Event | Allowed metadata |
| --- | --- |
| `tool_opened` | None |
| `comparison_completed` | `result`: `identical` or `different` |
| `comparison_failed` | `reason`: `input_limit`, `unavailable`, or `processing` |
| `input_cleared` | `side`: `original` or `updated` |
| `clipboard_pasted` | `side`: `original` or `updated` |
| `clipboard_failed` | `side`: `original` or `updated` |
| `difference_navigated` | `direction`: `previous` or `next` |

Each Text diff event also has the fixed tool identifier `text-diff`. Other metadata is discarded. Inputs, outputs, clipboard contents, filenames, free-text errors, and identifiers are excluded.

Cloudflare Web Analytics records page visits and performance. Custom tool events need a separately reviewed destination; no custom Cloudflare event API is assumed. Connecting any collection service must preserve static hosting, update privacy information, and leave tool behaviour independent of analytics failures.

## Base64 encoder and decoder

Hooks use the fixed tool identifier `base64-decoder-encoder` and remain within the page, without a collection destination.

| Event | Allowed metadata |
| --- | --- |
| `tool_opened` | None |
| `base64_encoded` | `source`: `file` or `text` |
| `base64_decoded` | `result`: `text`, `image`, `pdf`, or `binary` |
| `base64_failed` | `operation`: `decode` or `encode` |
| `base64_copied` | `operation`: `decode` or `encode` |
| `base64_downloaded` | `operation`: `decode` or `encode` |
| `input_cleared` | `side`: `decode` or `encode` |
| `clipboard_pasted` | `side`: `decode` |

Files, filenames, input text, decoded bytes and clipboard contents are excluded. Cloudflare's automatic page analytics is separate from these hooks.

## Bitwise flag decoder

Hooks use the fixed tool identifier `bitwise-flag-decoder`. Events remain within the page and have no collection destination.

The events `tool_opened`, `bitwise_failed`, `bitwise_cleared`, `bitwise_names_applied`, `bitwise_configuration_saved`, `bitwise_configuration_loaded`, and `bitwise_copied` have no allowed metadata. Values, names, widths, pasted rows, configuration contents, filenames and error text are excluded.

## List comparison

Hooks use the fixed tool identifier `list-comparison`. The events `tool_opened`, `list_compared`, `list_failed`, `list_cleared`, `list_copied` and `list_downloaded` have no metadata. List contents, names, options, counts, filenames and error text are excluded. Events stay within the page and have no collection destination.
