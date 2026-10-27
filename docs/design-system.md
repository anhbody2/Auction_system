# Design system (round 8, from the 'Auction Mockups' design file)

Introduced by ui-0.1. Later ui-* features add the components they introduce.

## Tokens (`fe/src/styles.css` `:root`) - dark theme since theme-1.1 (round 10)

`color-scheme: dark` is set, so native selects, date pickers and scrollbars are dark too. Text roles and fill
roles are separate tokens: never use a fill token (`--navy`, `--primary`, `--dark-red`) as a text colour.

| Token | Value | Use |
|---|---|---|
| `--bg` / `--surface` / `--input-bg` | #0b141a / #13212a / #0e1a22 | Page, cards and menus, form fields |
| `--border` | #263b48 | Hairlines, dashed empty states |
| `--ink` (= `--text`) | #e6eef4 | Body text, headings, text on tinted fills |
| `--muted` | #9ab0bf | Secondary text (7:1 on surface) |
| `--link` | #8ec5e8 | Links, 'Leading' state |
| `--navy` / `--navy-hover` (= `--primary`) | #1e5578 / #276a93 | Fills with white text: primary buttons, active chips, brand mark, navy credit card |
| `--steel` | #669bbc | Focus rings, active underline, chart line, selected thumb |
| `--steel-light` / `--steel-lighter` | #1f3d50 / #1a2c37 | Tinted fills (leading strip, pills, Bid $X) / subtle fills (search, inputs, Custom bid) |
| `--steel-ink` | #a7cde4 | Text on steel fills, positive amounts |
| `--crimson` | #ff7a7a | Outbid / error accent as text, brand dot, locked credit bar |
| `--dark-red` | #8f1d1d | Fills with white text: ending-soon pill, danger button, error toast |
| `--cream` | #3b2216 | Warm tint behind outbid / bid errors |
| `--danger` / `--success` / `--warn` | #ff8080 / #5fd08f / #e8b04f | Status text |
| `--tint-green/red/amber/gray/teal/pink` | dark tints | Badge, notice and banner backgrounds |
| `--shadow` | rgba(0,0,0,.45) | Hover and menu shadows |
| `--radius` / `--radius-input` | 14px / 10px | Cards / inputs and buttons; pills are 999px |

Contrast: every visible text element on the main customer, staff, admin and auth pages meets WCAG AA
against its background; `e2e/theme-1-1-dark.spec.ts` audits this in the browser.

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

## Homepage (`fe/src/pages/Home.tsx`, round 9)

Follows mockup 1a. Same page for guests and customers; only the card's bid strip differs.

- Category chip bar (`.chip-bar`), then the search summary / 'No lots match.' box when a filter is set.
- `section-live`: head row `.browse-head` with the title 'Trending lots' (`h1#live.browse-title`, 28px / 900)
  and `.browse-sub` '<n> live auctions' (real count of trending cards; 'bids update in real time' is left
  out because cards refresh on a 30 s poll). Sort on the right: 'Sort:' + select (Most bids default,
  Price low/high, Ending soon), kept in the URL.
- `.lot-grid`: 4 columns from 1200px, 2 from 640px, 1 below. Cards are `AuctionCard` (1a layout).
- No 'Starting soon' section: upcoming lots are not listed (home-1.1).
- `section-completed` below (home-2.2): `h2` 'Just completed (<n>)', up to 8 closed lots (API order, newest
  first) in the same `.lot-grid`. Ended card: muted 'Ended <date>' pill, 'Winning bid' / 'Final price'
  label, bid count, `card-winner` line 'Won by <user>' / 'No winner'; no bid strip and no Bid / Custom bid
  buttons. Empty: 'No recently completed auctions.' / 'No completed auctions match.'
