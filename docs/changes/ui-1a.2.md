# ui-1a.2 browse: category chips and sort

Source: Auction Mockups 1a (category chip bar, sort, top bar search).

| File | Change |
|---|---|
| be/src/routes/auctions.ts | `GET /api/auctions` accepts `category=<id>`, `endingSoon=1` (started and ending within 60 min; just-completed list empty) and `sort=bids\|price_asc\|price_desc\|ending`, zod-validated (400 on bad values), ANDed with `q`/`field`. Without `sort` the old order stays. `GET /api/categories` (active only) already existed. |
| fe/src/browseQuery.ts (+ test) | Browse state <-> URL (`q`, `field`, `category` = id or `ending`, `sort`) and the API query. `FIELD_LABELS` moved here. |
| fe/src/components/TopSearch.tsx | The keyword search (Keywords + Search in + Search) in the top bar. On the home page it keeps the chip and sort; elsewhere it opens the home page. |
| fe/src/components/SearchTools.tsx | Removed (replaced by TopSearch). |
| fe/src/components/Layout.tsx | Renders TopSearch for guests and customers only (staff/admin top bars are out of scope and land on staff pages). The select uses `aria-label="Search in"`: a wrapping label folded its option texts ('Seller name') into the accessible name and collided with form labels like 'Name'. |
| fe/src/pages/Home.tsx | Chip bar (`category-chips`, role=tablist: All, Ending soon, every active category), Sort by select (`sort`; default 'Ending soon' = old order), every change pushes history, search summary with Clear, 'No lots match.' + Clear filters (`no-match`). |
| fe/src/styles.css | Top search, chip bar (scrolls inside itself), sort control, empty state. |
| be/tests/auctions.filter-sort.test.ts, e2e/ui-1a-2-browse-filters.spec.ts | New. |
| e2e/guest-003-search.spec.ts | The search box is always visible in the top bar (the toggle step now checks that); Clear is matched exactly because 'Clear filters' can show too. |

Notes: 'Trending' (most bids) is offered as the 'Most bids' sort; the default stays soonest ending so older specs and behaviour are unchanged. The mockup's Live / Ending soon / Results header links map to the sections and the Ending soon chip.
