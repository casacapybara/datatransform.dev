# Publish with Cloudflare Workers

The project serves static files from `dist/`. Browser code handles text comparisons; there is no server-side application script. Keep private plans, review findings and original tools outside Git and the build.

## Connect GitHub

In the [Cloudflare dashboard](https://dash.cloudflare.com/), open Workers & Pages, select Create application, then Import a repository. Select GitHub and authorise the Cloudflare Workers & Pages app for only `casacapybara/datatransform.dev`.

Select the repository and use these settings:

| Setting | Value |
| --- | --- |
| Worker/project name | `datatransform-dev` |
| Production branch | `main` |
| Root directory | Repository root; leave blank if optional, otherwise `/` |
| Build command | `npm test && npm run build` |
| Deploy command | `npm run deploy` |
| Static assets directory | `dist`; supplied by `wrangler.jsonc` |

The Worker name must match `wrangler.jsonc`. The pinned Wrangler dependency and lockfile make installation reproducible. `.node-version` selects the Cloudflare build runtime. Let Cloudflare manage the build credentials; no credential belongs in the repository.

Select Save and Deploy. The first deployment should be available at the Workers address shown by Cloudflare. The custom domain is a later step. Future pushes to `main` trigger a build and deployment through this connection.

This follows [Workers Builds setup](https://developers.cloudflare.com/workers/ci-cd/builds/) and [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Verify the first deployment

- Open the homepage, `/text-diff/`, and the shared information pages.
- Check that `/text-diff` redirects to `/text-diff/` and a refresh still works.
- Check that an unknown path returns the custom page with HTTP status 404.
- Run a comparison, navigate changes, clear inputs, and test both themes in Safari and Chrome.
- Confirm security headers are applied and do not prevent the comparison worker from loading.
- Confirm pages have `X-Robots-Tag: noindex` and `robots.txt` blocks crawling during the preview phase.
- Confirm the build includes only the intended public assets and neither analytics nor advertising has been injected unexpectedly.

Find logs under the Worker's Builds or Deployments view. Record the verified commit and deployment version privately. Test a subsequent push and the rollback process before connecting the domain.

## Launch and analytics

After verifying the preview, configure Cloudflare Web Analytics, update the privacy page for the actual services enabled, and attach `datatransform.dev` as the Worker's custom domain. Review existing DNS records before making changes.

When ready for production indexing, set `SITE_PREVIEW=0` in build variables and trigger a new build. Verify the canonical URLs, sitemap, robots file, security headers, HTTPS and analytics on the real domain. Other preview builds should retain the default indexing block.

## Develop locally

```sh
npm ci
npm test
npm run build
npm run preview:worker
```

The basic `npm run preview` is useful for layout checks but does not reproduce Cloudflare routing or headers. Installing Wrangler does not add a browser runtime dependency.
