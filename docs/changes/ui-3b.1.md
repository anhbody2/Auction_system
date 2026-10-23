# ui-3b.1 credit: balance card and segmented Top up / Withdraw request form with quick amounts

Source: Auction Mockups 3b (available-credit card, Top up / Withdraw form).

| File | Change |
|---|---|
| fe/src/creditForm.ts (+ test) | Mode from `?mode=`, amount parsing (separators allowed), inline checks ('Enter an amount.', 'Exceeds available credit of $X.' for withdrawals), submit label, quick amounts ($500 / $1,000 / $5,000 / $10,000). |
| fe/src/pages/Credit.tsx | Two columns (420px \| transactions at >= 1100px, stacked below). Left: navy card with available credit (`credit-available`), 'Total' (`credit-balance`) and 'Locked in bids' (`credit-held`); one request form with a segmented Top up / Withdraw switch (`credit-mode`, kept in `?mode=` with replace), '$' amount labelled 'Top up amount' / 'Withdraw amount', quick buttons, 'Request top up $X' (navy) / 'Request withdrawal $X' (crimson), inline error (`credit-error`; cleared when the amount changes; server 400 text as-is), note 'Requests are approved by staff · top-ups are simulated, no real payment is taken.'; 'Waiting for approval' card with `pending-requests` / `pending-<id>` / `no-pending`. Right: the existing transaction search and table (ui-3b.2 redesigns them). Existing request endpoints and rules unchanged. |
| fe/src/styles.css | Credit layout, form, quick amounts. |
| e2e/ui-3b-1-credit-form.spec.ts | New. |
| e2e/cust-005-credit.spec.ts | Switches to the Withdraw tab before withdrawing; the over-credit refusal is now the inline message. |
| e2e/crd-002-credit-ui.spec.ts | /credit now shows available credit; the check became `credit-available` = credit - locked. |

Decision (reading in the notes): no instant credit and no card row ('Pay with Visa'); every top-up / withdrawal stays a staff-approved request (stf-007), so the buttons say 'Request'.
