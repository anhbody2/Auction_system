# theme-1.1 - Dark colour theme across the app

Request: 'update the theme to dark color' (2026-10-27).

## Behaviour

- Every page is dark: page #0b141a, cards #13212a, light text #e6eef4. Brand hues stay as accents (navy
  fills, steel focus / lines, crimson and cream for outbid and errors).
- `color-scheme: dark`, so native controls, date pickers and scrollbars follow.
- No layout, text or behaviour change. No light/dark toggle (recorded as a reading in the feature list).

## How

The round 8 palette used `--navy` both as the text colour and as the button fill, so swapping values alone
would have left dark text on dark fills. The tokens now split by role (see docs/design-system.md):
text (`--ink`, `--muted`, `--link`), fills (`--navy`, `--dark-red`), tints (`--steel-light`, `--cream`,
`--tint-*`). Every `color: var(--navy)` became `--ink`, focus outlines and active underlines use `--steel`,
the hard-coded light badge / notice / banner / input backgrounds became tint tokens, and chart grid / axis /
tick colours were darkened for the dark surface.

## Changed files

| File | Change |
|---|---|
| fe/src/styles.css | Dark `:root` tokens and role split as above (CSS only; no TSX has colours). |
| e2e/theme-1-1-dark.spec.ts | New: dark body background + `color-scheme: dark`; in-page WCAG AA contrast audit of every visible text element on guest/customer homepage, live and ended lot pages, dashboard, credit, bid history, profile, staff statistics / auctions / goods / credit, admin users / permissions, login, register; dark form fields; the audit catches a planted low-contrast paragraph. |
| docs/design-system.md | Token table rewritten for the dark theme. |
