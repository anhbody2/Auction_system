# ui-3b.2 credit: transactions panel with one search box, type chips, date range and running balance

Source: Auction Mockups 3b (Transactions panel).

| File | Change |
|---|---|
| be/src/lib/transactions.ts | `transactionFilterSchema` gains `q` (auction name or description; a bare number also matches the id or the amount, '$' and ',' allowed; '#123' matches the id only) and `type` (comma-separated list of the existing types, 400 'Unknown transaction type' otherwise). `name` / `id` / `min` / `max` / dates unchanged, so the staff list (stf-008) is unaffected; the 30-day window and the user scope still apply. |
| fe/src/transactionTypes.ts | One type-label map (Top up, Withdraw, Hold, Release, Purchase = payment, Sale = payout, Adjustment), used by the new list and by TransactionTable. |
| fe/src/transactionSearch.ts (+ TransactionSearch.test.ts) | `q` / `type` in the filter values (sent only when set); `datePresets` derived from SEARCH_WINDOW_DAYS (7, 14, 30 days, never longer than the window) and `presetFor`. Existing tests kept; new cases added. |
| fe/src/components/TransactionList.tsx | Customer list: date, description with '#id' under it (`tx-id`), type pill (`tx-type`), signed amount (+ steel / - crimson), balance after. Keeps `transactions`, `tx-<id>`, status text and rejection reason. |
| fe/src/components/TransactionTable.tsx | Type badge uses the shared labels (staff list). |
| fe/src/pages/Credit.tsx | Transactions panel: search box (`tx-q`, 300 ms debounce), date range select (`tx-range`: presets + 'Custom dates'), type chips (`tx-types`, single choice), 'More filters' disclosure holding the existing form (dates, name, id, amount range); pagination and `tx-empty` kept. |
| fe/src/styles.css | Panel styles. |
| be/tests/credit.transactions-q.test.ts, e2e/ui-3b-2-transactions.spec.ts | New. |
| e2e/trx-001-transaction-search.spec.ts | Opens 'More filters' before using the form; reads ids from `tx-id`; type text 'Hold'. |
| e2e/crd-002-credit-ui.spec.ts, e2e/cust-005-credit.spec.ts | Type text is now the label ('Hold', 'Purchase', 'Withdraw'). |

Notes: chips cover every real type (more than the mockup's five). The search box and chip stay as they are when the 'More filters' form is submitted; its Clear resets everything.
