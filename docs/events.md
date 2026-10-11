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

Each event also has a fixed tool identifier, `text-diff`. Other metadata is discarded. Inputs, outputs, clipboard contents, filenames, free-text errors, and identifiers are excluded.

Cloudflare Web Analytics records page visits and performance. Custom tool events need a separately reviewed destination; no custom Cloudflare event API is assumed. Connecting any collection service must preserve static hosting, update privacy information, and leave tool behaviour independent of analytics failures.
