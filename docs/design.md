# DataTransform design

Approved initial direction: Clear, 11 October 2026.

## Appearance

Use a muted mint page background, pale teal panels, defined teal borders, dark text, and restrained shadows. Keep tool controls prominent and provide enough room for editors and results.

| Colour role | Light | Dark |
| --- | --- | --- |
| Page background | `#d6e6e0` | `#11191c` |
| Panel background | `#edf5f0` | `#192429` |
| Soft highlight and footer | `#bad6cc` | `#203b35` |
| Primary text | `#183335` | `#e9f3f3` |
| Secondary text | `#405b55` | `#a8bdc0` |
| Accent | `#0e6056` | `#5dd4bd` |
| Standard border | `#91aea3` | `#405956` |
| Panel edge | `#518c80` | `#5e9d90` |
| Input background | `#f3f8f5` | `#11191c` |
| Text on accent | `#ffffff` | `#0e2620` |

Use system sans-serif fonts and monospace fonts where useful for data. Start with 14px panel corners and smaller corners on form controls. Stack columns on narrow screens.

## Header and footer

- Link the site name and logo to the homepage.
- Place a labelled dark-mode switch at the top right. Keep other navigation out of that corner.
- Start in light mode for a new visitor. Save explicit theme choices locally and apply them across pages.
- Use “Made with 💚 in London” at the bottom left.
- Keep About, Privacy, Contact, Terms, and Source links in the footer.

## Page content

Use descriptive page titles, concise tool descriptions, instructions, examples, limitations, and accurate data-handling information. Omit decorative subtitles and marketing slogans. Explain analytics separately from tool processing.

## Logo

Flow was approved on 11 October 2026. Three data rows form a forward arrow, alongside the full `datatransform.dev` wordmark.

Use `assets/brand/logo-light.svg` on light surfaces and `assets/brand/logo-dark.svg` on dark surfaces. The shared theme styles select the visible version. Preserve the aspect ratio; the desktop header size is 266 × 44 pixels. On narrow screens, the theme switch can wrap beneath the logo.

Use `assets/brand/favicon.svg` with the 32-pixel PNG fallback for browser icons. The icon has an opaque teal background so it remains legible independently of the website theme. Keep the home link labelled “DataTransform home”. Do not add a slogan to the logo.

## Implementation checks

Check keyboard focus, switch state announcements, text contrast, narrow-screen layouts, and theme preference persistence. Verify tool behaviour after applying shared styles.
