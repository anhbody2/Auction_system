# sell-004 - Start date plus duration; the server works out the end date

SRS: Customer - Create auction (duration), Req-1, Req-2, Req-3.

## Behaviour

- The create-auction form has **Start time** and **Duration**, made of two boxes: a number ("Duration
  amount") and a unit ("Duration unit": Hours or Days). There is no end date input.
- Allowed: whole hours or days from 1 hour to 30 days (720 hours). Anything else shows "Duration must be
  between 1 hour and 30 days" and the form is not sent.
- Under the boxes the form shows "Ends <date time>", worked out as the inputs change. A start time in the
  past counts from now, as the server does.
- The server stores `end_time = start_time + duration` and `duration_minutes`. A start time up to 5 minutes
  in the past is moved to now first, and the end follows from that.

## API

`POST /api/auctions` takes `startTime` and `duration: { value, unit: 'hours' | 'days' }`.

| Case | Response |
|---|---|
| 1 hour - 30 days | 201; `endTime` and `durationMinutes` worked out by the server |
| 0, under 1 hour, over 30 days, fractions, not a number | 400 `fields.duration` "Duration must be between 1 hour and 30 days" |
| Other unit | 400 `fields.duration` "Choose hours or days" |
| No duration | 400 `fields.duration` "Choose a duration" |
| `endTime` sent | 400 `fields.endTime` "The end time is worked out from the duration" |

The old minimum of 1 minute is now 1 hour. Specs that need an auction to end still use
`POST /api/dev/auctions/:id/expire`, so tests are not slower.

## Changed files

| File | Change |
|---|---|
| be/src/lib/duration.ts | New: `durationToMinutes`, `durationField` (zod), limits and messages. |
| be/src/routes/auctions.ts | Create takes `duration` instead of `endTime`; end time worked out on the server; duration errors reported on `duration`. |
| be/src/routes/dev.ts | `/api/dev/auctions/:id/raw` also returns `durationMinutes`. |
| fe/src/pages/CreateAuction.tsx | Duration amount + unit boxes, live "Ends ..." text, client-side check; End time field removed. |
| fe/src/pages/AuctionDetail.tsx | `data-testid="end-time"` on the Ends value. |
| fe/src/styles.css | `.label` caption style. |
| be/tests/auction.duration.test.ts | New: unit tests for the helper, API tests for the stored end time, start-now case and rejections. |
| be/tests/helpers.ts, auction.create, bid.place, homepage, job.start, my-auctions tests | Send `duration: { value: 1, unit: 'hours' }` instead of `endTime` (job.start's upcoming auction was 55 minutes long, now 1 hour). The create-validation case now checks a 31-day duration in place of "end before start". |
| e2e/helpers.ts, cust-006, guest-002, sys-001 specs | Same change for their auctions. |
| e2e/sell-001-create-auction.spec.ts | Uses the duration boxes; the invalid step checks a 0-hour duration in place of "end before start". |
| e2e/sell-004-duration.spec.ts | New spec. |
