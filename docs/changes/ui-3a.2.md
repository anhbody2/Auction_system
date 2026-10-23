# ui-3a.2 bid history: result tabs and lot search

Source: Auction Mockups 3a (All / Active / Won / Lost tabs, 'Search lots').

| File | Change |
|---|---|
| fe/src/bidHistoryFilter.ts (+ test) | Client-side filter over the loaded list: tabs All / Active (Leading + Outbid) / Won / Lost; search = case-insensitive part of the name or the exact lot id with or without '#'; per-tab counts after the search. |
| fe/src/pages/MyBiddings.tsx | Pill tabs (SegmentedTabs, counts in labels, `history-tabs`) and SearchInput (`history-search`) replace the six old status tabs; `?tab=` and `?q=` in the URL (a tab change is a history step, typing replaces the entry, so Back returns to the previous tab); 'No bids match.' (`no-match`) when the filters leave nothing. |
| fe/src/styles.css | Tools row. |
| e2e/ui-3a-2-bid-filters.spec.ts | New. |

Decision: the mockup's 4 tabs replace the old 6. Outbid lots are under Active; cancelled lots appear under All only (no separate Cancelled tab unless the user asks). cust-007 still clicks 'Won', which exists in the new tabs, so it needed no change.
