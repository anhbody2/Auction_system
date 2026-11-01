# hdr-1.2 Staff and admin top bar: Browse | centred search | role dashboard links

User request (2026-10-28): "modify header to all role required, keep them same as customer, but with admin and staff the navlink on right side change to role based dashboard".

## Layout

| Role | Left of search | Right of search |
| --- | --- | --- |
| customer (hdr-1.1) | Browse, Dashboard, Bids | Credit, My goods, My Auctions |
| staff (default grants) | Browse | Statistics, Manage auctions, Goods, Credit management |
| admin (default grants) | Browse | Manage auctions, Goods, Credit management, Users, Permissions |
| guest | unchanged: Browse, search, Log in / Register | |

Right-hand links stay permission-driven (`can(user, ...)`), so a changed grant still adds or removes a link. The role pill and avatar stay at the far right.

| Width | Staff / admin bar |
| --- | --- |
| 1151px and up | links on row 1, search on its own centred row (hdr-1.3: the bar is capped to the body width) |
| 901–1150px | same |
| 900px and below | unchanged folding menu; search on its own row |

Staff and admin now also get the top search (it opens Browse, which they could already view).

## How

- `fe/src/components/Layout.tsx`: every signed-in user gets the `.nav-left` / `.nav-right` groups inside the single `<nav id="main-nav">`; header class `topbar-split` (was `topbar-customer`), plus `topbar-staff` for staff/admin. `<TopSearch />` renders for all roles.
- `fe/src/styles.css`: `.topbar-customer` rules renamed `.topbar-split`; new `.topbar-staff` block (1151px and up, revised by hdr-1.3) keeps the staff/admin search on its own row.

## Tests

- New `e2e/hdr-1-2-staff-admin-header.spec.ts`: staff and admin at 1440 / 1200 / 1000px (link groups, order, search in the middle third, one or two rows, no sideways scroll), 375px admin folding menu, staff has no Users / Permissions / Bids links.
- `e2e/hdr-1-1-customer-header.spec.ts` and `e2e/ui-0-1-design-system.spec.ts` pass unchanged.

## Known, out of scope

- At 375px the admin User management page scrolls sideways because of its table; the header itself fits.
