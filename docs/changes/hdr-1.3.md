# hdr-1.3 Header content aligned to the body column

User request (2026-10-28): "reside header to fit with height of body", read as: the header's content should fit the body's width.

## Change

- `fe/src/styles.css`: `.topbar` side padding is `max(1rem, calc((100% - 1240px) / 2 + 1rem))`, the same edges as `main.container` (max 1240px, 1rem padding, border-box). The background and bottom border still span the window. At 900px and below the existing `padding: 0.6rem 1rem` applies, which already matches the body.
- Because the bar is now at most 1208px of content, the staff/admin bar (5 wide role links) has no room for a usable search on the same row: its search now takes its own centred row at every desktop width (hdr-1.2 had it one-row from 1301px). The customer bar is unchanged: one row from 1151px.

## Tests

- New `e2e/hdr-1-3-header-body-width.spec.ts`: guest, customer, staff, admin at 1920 / 1440 / 1100px: brand on the body's left content edge, avatar (or Register) on its right edge, full-width background, no sideways scroll.
- `e2e/hdr-1-2-staff-admin-header.spec.ts` updated for the always-two-row staff/admin bar (same feature round, not yet passing before this change).
