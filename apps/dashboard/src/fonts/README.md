# Self-hosted fonts

Committed so `next build` never fetches from fonts.googleapis.com or
fonts.gstatic.com. The `.woff2` files are byte-for-byte the files
`next/font/google` downloaded and shipped for this app's previous config
(Next 15.5.19, built at main cbebafe), so rendering is unchanged.

| Family | Files | Axes / weights used |
| --- | --- | --- |
| Fraunces | `Fraunces-{latin,latin-ext,vietnamese}.woff2` | variable: wght 100–900, opsz 9–144, SOFT 0–100, WONK 0–1 |
| Manrope | `Manrope-{latin,latin-ext,vietnamese,cyrillic,cyrillic-ext,greek}.woff2` | variable: wght 200–800 |
| JetBrains Mono | `JetBrainsMono-{latin,latin-ext,vietnamese,cyrillic,cyrillic-ext,greek}.woff2` | 400 and 500 (one file serves both) |

- `../app/layout.tsx` loads the latin files with `next/font/local` (preloaded,
  same CSS variables `--font-fraunces`, `--font-manrope`, `--font-jetbrains`,
  `display: "swap"`), exactly as `subsets: ["latin"]` did before.
- `fonts.css` declares the other subsets (not preloaded, same unicode-ranges
  as Google served) and the metric-adjusted fallback faces with the values
  `next/font/google` generated.

## Licences

All three families are under the SIL Open Font License 1.1, which allows
redistribution and bundling with software provided the licence travels with
the fonts. The licence text for each is alongside: `OFL-Fraunces.txt`,
`OFL-Manrope.txt`, `OFL-JetBrainsMono.txt` (from github.com/google/fonts,
`ofl/<family>/OFL.txt`).

## Updating

To refresh from Google Fonts, temporarily switch layout.tsx back to
`next/font/google` with the same options, build, and copy the files from
`.next/static/media` (match them via the built CSS's unicode-ranges).
