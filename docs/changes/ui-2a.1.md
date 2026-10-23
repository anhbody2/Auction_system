# ui-2a.1 dashboard: available credit, locked credit and pending requests cards

Source: Auction Mockups 2a (credit summary cards).

| File | Change |
|---|---|
| be/src/routes/me.ts | New `GET /api/me/summary` -> `{ leadingBids, pendingTopup, pendingWithdraw }`: active (leading) bid tickets on non-deleted auctions, and pending top-up / withdrawal request sums. Chosen over reading `/api/me/bids` so the dashboard needs one small query. |
| fe/src/pages/Dashboard.tsx | 'Welcome back, <first name>'; navy card: available credit (`dashboard-available`), 'Total' (`dashboard-credit`), available / locked bar (`credit-bar`), 'Add credit' -> `/credit?mode=topup`, 'Withdraw' -> `/credit?mode=withdraw`; 'Locked credit' card (`dashboard-locked`, `dashboard-leading` 'Held against N leading bids...'); 'Pending requests' card (`dashboard-pending`, breakdown, link to /credit). Credit values come from the live credit store; the summary reloads whenever credit/locked change and on the credit-request window event (stf-010). |
| fe/src/creditBar.ts (+ test) | Bar widths. |
| fe/src/styles.css | Dashboard cards, bar, light buttons. |
| be/tests/me.summary.test.ts, e2e/ui-2a-1-dashboard-credit.spec.ts | New. |
| e2e/cust-001-login.spec.ts, e2e/sec-001-role-login.spec.ts | Greeting is now 'Welcome back, <first name>'. |
| e2e/crd-002-credit-ui.spec.ts | The dashboard shows available credit now (round 8 design); the old 'never Available credit' check on the dashboard became a check that `dashboard-available` = credit - locked. The /credit check is unchanged here (ui-3b.1 changes that page). |
| e2e/crd-003-credit-stable.spec.ts | `/api/me/summary` excluded from the 'no credit refetch' filter: it carries no credit figures. |
| e2e/cust-005-credit.spec.ts | Clicks the header nav 'Credit' link exactly (the dashboard now has 'Add credit' too). |

Decision (reading in the notes, not confirmed by the user): the mockup's third card 'Pending payout' does not exist in this system (sellers are paid at settlement), so it shows pending credit requests.
