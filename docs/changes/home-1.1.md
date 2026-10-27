# home-1.1 - Auctions API: the open list is trending (live) lots, most bids first

SRS: 'system - Ui change' (show trending auctions only, for guests and logged-in users).

## Behaviour

- `GET /api/auctions` no longer returns upcoming lots. The open part holds lots that have started (stored
  `active`, or stored `upcoming` with the start time passed before the start job ran), end in the future,
  are not cancelled and have `deleted_at` null.
- Default order (no `sort`): bid count desc, then end time asc, then id asc (done in the query, so the
  200-row cap keeps the most-bid lots).
- `sort=bids|price_asc|price_desc|ending` reorders only the trending lots (stable sort, ties keep the
  trending order). The just-completed lots always stay newest first; before, a sort reordered them too.
- Filters (`q`/`field`, `category`, `endingSoon`) unchanged. Guests and customers get the same lots; only
  `myBid` differs. Upcoming lots stay reachable by `/api/auctions/:id`, My auctions and staff pages.

## Changed files

| File | Change |
|---|---|
| be/src/routes/auctions.ts | Open query adds `startTime <= now`, orders by `bids._count desc, endTime, id`; sort applies to the trending part only. |
| fe/src/browseQuery.ts | Sort options: `''` (server default) is now 'Most bids'; `bids` dropped (an old `?sort=bids` URL falls back to the default); `ending` = 'Ending soon' added. |
| fe/src/browseQuery.test.ts | Round trip uses `ending`; new case for the `sort=bids` fallback. |
| be/tests/auctions.trending.test.ts | New: upcoming / cancelled / soft-deleted excluded, started-before-job included, default and explicit orders, guest == customer. |
| be/tests/auctions.filter-sort.test.ts | 'Future vase' (upcoming) no longer listed; default order is most bids. |
| be/tests/homepage.test.ts | 'Soon lamp' no longer listed; still opens by id. |
| be/tests/auction.new-tag.test.ts | Upcoming lot is absent from the public list (the tag is still checked on the lot and My auctions). |
| e2e/home-1-1-trending-api.spec.ts | New: guest and customer, upcoming absent, the lot with a bid first. |
| e2e/guest-002-homepage.spec.ts | Upcoming lot not on the homepage; its 'Starts in' countdown is checked on the lot page. |
| e2e/sell-007-new-tag.spec.ts | The lot is not on the homepage before its start (New tag still checked on My auctions and the lot page; the homepage card after start unchanged). |
| e2e/ui-1a-3-quick-bid.spec.ts | Upcoming case: not on the homepage; lot page shows 'Starts in' and no bid form. |
| e2e/guest-003-search.spec.ts, e2e/ui-1a-2-browse-filters.spec.ts | Submit the top bar search with Enter: the user's uncommitted top bar restyle removed the Search button (baseline failures before this change). |
