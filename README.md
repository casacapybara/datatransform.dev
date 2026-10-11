# datatransform.dev

Privacy-first browser tools for working with data.

This project is being prepared for its first launch. No tools are published yet.

The site will use one GitHub repository and one Cloudflare Worker. Each tool will have its own path under `https://datatransform.dev/`.

## Review tools before publishing

Each tool must pass a public-sharing review before its source is added here. Check data handling, external requests, dependencies, licences, and browser compatibility. Document any limitations alongside the tool.

Verify browser-only processing for each tool before claiming that user input stays on the visitor's device. Cloudflare Web Analytics will be documented separately from tool processing.

## Development and deployment

Use Node.js 22 or later and Python 3 for the basic local preview. Cloudflare Builds uses the version in `.node-version`. Install the pinned deployment tool before using Wrangler:

```sh
npm ci
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:8765/`. Text diff is at `/text-diff/`; the Base64 tool is at `/base64-decoder-encoder/`. Stop the preview with Ctrl+C.

The build copies an explicit list of public files into `dist/`. Only that directory should be deployed. Private plans and original tool copies are excluded from Git and the build. The local preview does not apply Cloudflare's `_headers`; verify those headers on a Cloudflare preview before launch.

Shared styling lives in `assets/site.css`; the light theme is the default. Theme preference is the only application data saved in browser storage. Hosted text comparison runs in a browser worker using a locally bundled, pinned copy of Google's Diff Match Patch library. Opening `text-diff/index.html` directly also works: file URLs use the same comparison on the page's main thread, with the existing input and algorithm time limits. Large local-file comparisons can briefly pause the interface. Use the local HTTP preview for the complete site and background processing. See `text-diff/vendor/README.md` for provenance.

Cloudflare hosts the site and automatically installs Web Analytics on `datatransform.dev` for page visits and loading performance. Custom tool-event hooks dispatch allowlisted events within the page and have no collection destination. See `docs/events.md`.

## Cloudflare deployment

The Worker configuration in `wrangler.jsonc` serves only `dist/`, with canonical directory URLs and a custom 404 page. No server-side tool processing is configured. Use `npm run build` followed by `npm run preview:worker` to test Cloudflare routing and security headers locally.

Builds default to a preview: pages receive a `noindex` header and `robots.txt` disallows crawling. Set the non-secret build variable `SITE_PREVIEW=0` only when the domain is ready for launch. The canonical URLs continue to point to `https://datatransform.dev/`.

See [Cloudflare publishing instructions](docs/publishing.md) for the GitHub connection, exact dashboard settings and deployment checks.

## Licence

Our code, documentation, and Flow logo are provided under the [MIT licence](LICENSE). Copyright notices use the public GitHub account name `casacapybara`.

Google's bundled Diff Match Patch library retains its [Apache 2.0 licence](text-diff/vendor/LICENSE.txt), copyright header, and [source provenance](text-diff/vendor/README.md). The MIT licence does not replace third-party licences.
