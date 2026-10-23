# Design system (round 8, from the 'Auction Mockups' design file)

Introduced by ui-0.1. Later ui-* features add the components they introduce.

## Tokens (`fe/src/styles.css` `:root`)

| Token | Value | Use |
|---|---|---|
| `--navy` | #003049 | Text, primary buttons, active tabs/pills, navy summary cards |
| `--crimson` | #c1121f | Outbid, withdraw, errors, brand dot |
| `--dark-red` | #780000 | Ending-soon pill, crimson hover |
| `--cream` | #fdf0d5 | Warning / outbid backgrounds |
| `--steel` | #669bbc | Accents, chart line (not for text: 2.9:1 on white) |
| `--steel-ink` | #335a6e | Text on steel-light, avatar background, positive amounts |
| `--steel-light` / `--steel-lighter` | #e6f0f6 / #eef3f6 | Leading pill, inputs, quick buttons |
| `--muted` | #4f6e80 | Secondary text. The mockup's #5b7a8c is 4.3:1 on the page background, so it was darkened to pass WCAG AA |
| `--bg` / `--border` | #f5f8fa / #e1e8ee | Page background, hairlines |
| `--radius` / `--radius-input` | 14px / 10px | Cards / inputs and buttons; pills are 999px |

The older names (`--text`, `--primary`, `--danger`, ...) now point at the palette, so staff, admin and auth
pages that are not redesigned this round still render with the new colours.

Font: Mulish 400-900 from Google Fonts (`fe/index.html`), `system-ui` fallback.

## Top bar (`fe/src/components/Layout.tsx`)

Brand mark (navy square, crimson dot) + name, nav links (active one underlined in navy), then for customers the
'Bid limit' (`data-testid="bid-limit"`, credit - locked from the credit store, live) and the avatar
(`data-testid="avatar"`, initials). The avatar opens a menu with the credit breakdown (`header-credit`,
`header-locked`), Profile and Log out. Staff/admin see their role pill instead of the bid limit. Under 900px
the nav folds behind a menu button (`data-testid="nav-toggle"`).

## Components (`fe/src/components/ui/`)

| Component | Notes |
|---|---|
| `Pill` | `tone`: navy, steel, cream, muted, dark-red; optional `dot`. Always carries text. |
| `Card` | Optional `title` and `actions` header; `tone="navy"` for the dark summary card. |
| `SegmentedTabs` | role=tablist/tab with aria-selected, arrow keys; `variant`: `pills` (default) or `segment`; optional counts. |
| `SearchInput` | Rounded search box with icon; visually hidden label. |
| `MoneyText` | Tabular figures; `signed` adds +/- with steel/crimson; `size` lg/xl. |
| `ConfirmDialog` | (ui-1a.3) role=dialog, aria-modal; focus on confirm, Escape / Cancel / backdrop close. |
| `Gallery` (components/Gallery.tsx) | (ui-1b.1) hero + thumbnails + '+N' lightbox. |
| `initials()` | First letters of the first two words of fullName, else first two letters of username. |

Buttons: `.btn-primary` (navy), `.btn-danger` (crimson, dark red hover), `.btn-steel` (steel-light quick buttons), `.btn-ghost`.
