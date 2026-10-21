//Edited copy of docs/ERD.md. docs/ERD.md is kept unchanged as the original.
//This file is the one used to build the database (be/prisma/schema.prisma).
//Every entity/column from the original is preserved. Additions are listed in
//"Changes vs ERD.md" below and marked with "-- added" comments in the diagram.

## Changes vs ERD.md

| Change | Why (feature) |
|---|---|
| USERS: added `username` (UK) | cust-001 login by "username/email" |
| USERS: added `credit_balance`, `held_balance` | cust-005 credit account; bid-001 check bids against available credit; sell-002 release held credit |
| AUCTIONS: added `start_time`, `end_time` | sell-001 start/end time, guest-002 countdown (`duration_minutes` kept, = end - start) |
| ~~AUCTIONS: added `min_increment`~~ | Removed 2026-10-20 (migration `20261020040000_drop_min_increment`): bids step by BID_INCREMENT_RULES only. See docs/changes/drop-min-increment.md |
| AUCTIONS: added `current_price`, `winner_id` | cust-006/cust-007 current highest bid and outcome without re-aggregation |
| new AUCTION_MESSAGES | bid-002 post a message on an auction (public thread) |
| new PASSWORD_RESET_TOKENS | cust-004 forget password (single-use token) |
| new EMAIL_VERIFICATION_TOKENS | guest-002 register: confirmation email |
| GOODS: added `buyer_id` (FK USERS, nullable) | gds-003 goods remember who bought them so the buyer can re-auction them (migration `20261021090000_goods_buyer`, backfilled from the last auction that ended with a winner) |

| GOODS: added `rejection_reason`, `reviewed_at`, `reviewed_by` (FK USERS); status `pending`/`rejected` | stf-005 staff approval of new goods (see docs/goods-approval.md) |

| AUCTIONS: added `deleted_at` | stf-006 staff soft delete (hidden from customers; see docs/auction-cancel.md) |

Goods ownership (gds-003): the current owner is `buyer_id` when set, otherwise `seller_id`. When an auction ends
with a winner, settlement sets `goods.seller_id` = that auction's seller and `goods.buyer_id` = the winner, in the
same transaction. On a first sale the seller is unchanged; on a resale the previous buyer (the reseller) becomes the
seller. No winner (no bids, reserve not met) or a cancel leaves both columns unchanged. Only the owner can auction,
edit or delete the goods; the former seller sees them as sold.

Status values used:
- USERS.status: `active`, `pending`, `disabled`
- AUCTIONS.status: `upcoming`, `active`, `ended`, `cancelled` (upcoming/active/ended derived from time when not cancelled)
- BID_TICKETS.status: `active`, `outbid`, `won`, `lost`, `cancelled`
- CREDIT_TRANSACTIONS.transaction_type: `topup`, `withdraw`, `hold`, `release`, `payment`, `payout`

```mermaid
erDiagram

    USERS {
        bigint id PK
        varchar email UK
        varchar username UK "added"
        varchar password_hash
        varchar role
        varchar status
        decimal credit_balance "added"
        decimal held_balance "added"
        timestamp email_verified_at
        timestamp created_at
        timestamp updated_at
    }

    USER_INFO {
        bigint user_id PK, FK
        varchar full_name
        varchar phone
        text address
        timestamp created_at
        timestamp updated_at
    }

    CATEGORIES {
        bigint id PK
        varchar name UK
        text description
        varchar status
        timestamp created_at
        timestamp updated_at
    }

    GOODS {
        bigint id PK
        bigint seller_id FK
        bigint buyer_id FK "added, nullable"
        bigint category_id FK
        varchar name
        text description
        varchar condition
        varchar status
        text rejection_reason "added"
        timestamp reviewed_at "added"
        bigint reviewed_by FK "added"
        timestamp created_at
        timestamp updated_at
    }

    GOODS_IMAGES {
        bigint id PK
        bigint goods_id FK
        text image_url
        int sort_order
        timestamp created_at
    }

    AUCTIONS {
        bigint id PK
        bigint seller_id FK
        bigint goods_id FK
        bigint winner_id FK "added"
        varchar name
        text description
        decimal initial_price
        decimal reserve_price
        decimal current_price "added"
        int duration_minutes
        timestamp start_time "added"
        timestamp end_time "added"
        varchar status
        timestamp created_at
        timestamp updated_at
        timestamp cancelled_at
        timestamp closed_at
        timestamp deleted_at "added"
    }

    BID_TICKETS {
        bigint id PK
        bigint auction_id FK
        bigint bidder_id FK
        decimal amount
        varchar status
        timestamp created_at
        timestamp won_at
    }

    CREDIT_TRANSACTIONS {
        bigint id PK
        bigint user_id FK
        bigint auction_id FK
        bigint bid_ticket_id FK
        varchar transaction_type
        decimal amount
        decimal balance_before
        decimal balance_after
        text description
        timestamp created_at
    }

    AUCTION_SETTLEMENTS {
        bigint id PK
        bigint auction_id FK
        bigint winning_bid_id FK
        decimal commission_amount
        varchar settlement_status
        timestamp settled_at
        timestamp created_at
    }

    BID_INCREMENT_RULES {
        bigint id PK
        decimal min_bid_amount
        decimal max_bid_amount
        decimal increment_amount
        varchar status
        timestamp created_at
        timestamp updated_at
    }

    AUCTION_MESSAGES {
        bigint id PK
        bigint auction_id FK
        bigint author_id FK
        text content
        timestamp created_at
    }

    PASSWORD_RESET_TOKENS {
        bigint id PK
        bigint user_id FK
        varchar token_hash UK
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }

    EMAIL_VERIFICATION_TOKENS {
        bigint id PK
        bigint user_id FK
        varchar token_hash UK
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }

    USERS ||--|| USER_INFO : has
    USERS ||--o{ GOODS : sells
    USERS ||--o{ GOODS : buys
    USERS ||--o{ GOODS : reviews
    USERS ||--o{ AUCTIONS : creates
    USERS ||--o{ AUCTIONS : wins
    USERS ||--o{ BID_TICKETS : places
    USERS ||--o{ CREDIT_TRANSACTIONS : has
    USERS ||--o{ AUCTION_MESSAGES : writes
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests
    USERS ||--o{ EMAIL_VERIFICATION_TOKENS : receives

    CATEGORIES ||--o{ GOODS : categorizes

    GOODS ||--o{ GOODS_IMAGES : has
    GOODS ||--o{ AUCTIONS : auctioned_in

    AUCTIONS ||--o{ BID_TICKETS : receives
    AUCTIONS ||--o{ CREDIT_TRANSACTIONS : generates
    AUCTIONS ||--o| AUCTION_SETTLEMENTS : has
    AUCTIONS ||--o{ AUCTION_MESSAGES : has

    BID_TICKETS ||--o{ CREDIT_TRANSACTIONS : referenced_by
    BID_TICKETS ||--o| AUCTION_SETTLEMENTS : wins
```
