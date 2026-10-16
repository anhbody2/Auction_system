//This file contain ERD diagram, can use it to create new db
//Do not change any of these ERD until i point to do it.


erDiagram

    USERS {
        bigint id PK
        varchar email UK
        varchar password_hash
        varchar role
        varchar status
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
        bigint category_id FK
        varchar name
        text description
        varchar condition
        varchar status
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
        varchar name
        text description
        decimal initial_price
        decimal reserve_price
        int duration_minutes
        varchar status
        timestamp created_at
        timestamp updated_at
        timestamp cancelled_at
        timestamp closed_at
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

    USERS ||--|| USER_INFO : has
    USERS ||--o{ GOODS : sells
    USERS ||--o{ AUCTIONS : creates
    USERS ||--o{ BID_TICKETS : places
    USERS ||--o{ CREDIT_TRANSACTIONS : has

    CATEGORIES ||--o{ GOODS : categorizes

    GOODS ||--o{ GOODS_IMAGES : has
    GOODS ||--o{ AUCTIONS : auctioned_in

    AUCTIONS ||--o{ BID_TICKETS : receives
    AUCTIONS ||--o{ CREDIT_TRANSACTIONS : generates
    AUCTIONS ||--o| AUCTION_SETTLEMENTS : has

    BID_TICKETS ||--o{ CREDIT_TRANSACTIONS : referenced_by
    BID_TICKETS ||--o| AUCTION_SETTLEMENTS : wins