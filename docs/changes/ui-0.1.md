# ui-0.1 design tokens, Mulish font and the new top bar

Source: Auction Mockups, shared top bar and tokens. Design: docs/design-system.md.

| File | Change |
|---|---|
| fe/src/styles.css | Mockup palette as `:root` tokens; old variable names mapped onto it; top bar, user menu, `ui-*` component styles; inputs/buttons use the new radii. |
| fe/index.html | Loads Mulish from Google Fonts. |
| fe/src/components/Layout.tsx | Brand mark, Browse/Dashboard/Bids/Credit/My goods/My Auctions nav, Bid limit, avatar + menu (credit breakdown, Profile, Log out), narrow-screen menu button. Profile left the nav for the menu. |
| fe/src/components/ui/* | Pill, Card, SegmentedTabs, SearchInput, MoneyText, initials (+ test). |
| e2e/ui-0-1-design-system.spec.ts | New. |
| e2e/helpers.ts | `logout` opens the avatar menu first. |
| e2e/cust-002-profile.spec.ts | Opens the avatar menu before clicking Profile. |
| e2e/cust-007-my-biddings.spec.ts, e2e/sec-001-role-login.spec.ts | Nav label 'My Biddings' is now 'Bids'. |

Decisions (readings in the feature notes, not yet confirmed by the user):
- Brand name stays 'BidHouse'; only the mark is new.
- Nav keeps My goods and My Auctions (no other entry point); no Watchlist.
- The username stays next to the avatar on wide screens (`current-user`; specs and screen readers rely on it).
- `--muted` darkened from #5b7a8c to #4f6e80 for WCAG AA.
