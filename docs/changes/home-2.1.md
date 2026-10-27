# home-2.1 - Auctions API: just completed = the 8 most recently closed lots

SRS: 'system - Ui change' Req-2 (just completed shows 8 closed auctions, API returns 8).

## Behaviour

- The completed part of `GET /api/auctions` is now the 8 newest closed lots (`take: 8`, `endTime desc, id
  desc`), whatever their age. The 7-day window (`JUST_COMPLETED_DAYS`) is removed; a lot closed 10 days ago
  is listed when it is among the 8 newest. Fewer than 8 only when fewer exist or match the filters.
- Closed = stored `ended`, or end time passed before the close job ran. Cancelled and soft-deleted lots are
  never counted.
- `q`/`field` and `category` filter before the limit. `endingSoon=1` returns no completed lots (unchanged).
  A `sort` never reorders the completed lots (since home-1.1).
- Response: `justCompletedDays: 7` replaced by `justCompletedLimit: 8`.

## Changed files

| File | Change |
|---|---|
| be/src/routes/auctions.ts | `JUST_COMPLETED_LIMIT = 8`; no end-time window; tie broken by id; `justCompletedLimit` in the response. |
| fe/src/pages/Home.tsx | Reads `justCompletedLimit` (type) instead of `justCompletedDays`; heading 'Just completed' without the day window (home-2.2 finishes the section). |
| be/tests/auctions.just-completed.test.ts | New: 10 closed -> the 8 newest, newest first; close job not run yet still counts; cancelled / deleted never counted; sort leaves the order; filter before limit (10-day-old lot listed); guest == customer; `justCompletedLimit` 8. |
| be/tests/homepage.test.ts | 'Old lamp' (closed 10 days ago) is now listed. |
| e2e/home-2-1-just-completed-api.spec.ts | New: 9 lots expired via `/api/dev/auctions/:id/expire` -> 8 ended lots, newest first, the first expired absent. |
