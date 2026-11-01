# hdr-1.1 Customer top bar: three links, centred search, three links

User request (2026-10-28): "modify the header for customer: search bar at center, left first 3 navlinks, right 3 last".

## Layout

| Width | Customer bar |
| --- | --- |
| 1151px and up | brand · Browse Dashboard Bids · **search** · Credit My goods My Auctions · bid limit, avatar (one row) |
| 901–1150px | same links on row 1; the search takes its own centred row below (max 560px), because six links plus a usable search do not fit one row |
| 900px and below | unchanged: links fold behind the menu button, search on its own row |

Guest, staff and admin bars are unchanged.

## How

- `fe/src/components/Layout.tsx`: the header gets `topbar-customer` for customers; inside the single `<nav id="main-nav">` the customer links are split into `.nav-group.nav-left` (Browse, Dashboard, Bids) and `.nav-group.nav-right` (Credit, My goods, My Auctions). One `<nav>` is kept so the folding menu and the existing `header nav` locators work as before.
- `fe/src/styles.css`: `.nav-group` is `display: contents` by default (the folding menu column sees plain links). From 901px the customer nav itself becomes `display: contents`, the groups become flex rows with equal `flex: 1 1 0`, and `order` places left group → search → right group → user box.
- Keyboard order is unchanged (all six links, then the search), since the search stays outside the nav in the DOM.

## Tests

- New `e2e/hdr-1-1-customer-header.spec.ts`: at 1440 / 1200 / 1000px checks left links before the search, right links after it and before the avatar, link order, search centre in the middle third, search text box wider than 120px, one row (≥1151px) or search on its own row (1000px), no sideways scroll; guest bar has no link groups.
- Existing `e2e/ui-0-1-design-system.spec.ts` (incl. the 375px folding menu) passes unchanged.
