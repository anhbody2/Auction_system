-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'customer',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "credit_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "held_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_info" (
    "user_id" BIGINT NOT NULL,
    "full_name" VARCHAR(255),
    "phone" VARCHAR(30),
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_info_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods" (
    "id" BIGSERIAL NOT NULL,
    "seller_id" BIGINT NOT NULL,
    "category_id" BIGINT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "condition" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_images" (
    "id" BIGSERIAL NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "image_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" BIGSERIAL NOT NULL,
    "seller_id" BIGINT NOT NULL,
    "goods_id" BIGINT NOT NULL,
    "winner_id" BIGINT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "initial_price" DECIMAL(14,2) NOT NULL,
    "reserve_price" DECIMAL(14,2),
    "min_increment" DECIMAL(14,2),
    "current_price" DECIMAL(14,2),
    "duration_minutes" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_tickets" (
    "id" BIGSERIAL NOT NULL,
    "auction_id" BIGINT NOT NULL,
    "bidder_id" BIGINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "won_at" TIMESTAMP(3),

    CONSTRAINT "bid_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "auction_id" BIGINT,
    "bid_ticket_id" BIGINT,
    "transaction_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_before" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_settlements" (
    "id" BIGSERIAL NOT NULL,
    "auction_id" BIGINT NOT NULL,
    "winning_bid_id" BIGINT,
    "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settlement_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_increment_rules" (
    "id" BIGSERIAL NOT NULL,
    "min_bid_amount" DECIMAL(14,2) NOT NULL,
    "max_bid_amount" DECIMAL(14,2),
    "increment_amount" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bid_increment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_messages" (
    "id" BIGSERIAL NOT NULL,
    "auction_id" BIGINT NOT NULL,
    "author_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "auctions_status_end_time_idx" ON "auctions"("status", "end_time");

-- CreateIndex
CREATE INDEX "bid_tickets_auction_id_amount_idx" ON "bid_tickets"("auction_id", "amount");

-- CreateIndex
CREATE UNIQUE INDEX "auction_settlements_auction_id_key" ON "auction_settlements"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_settlements_winning_bid_id_key" ON "auction_settlements"("winning_bid_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "user_info" ADD CONSTRAINT "user_info_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods" ADD CONSTRAINT "goods_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods" ADD CONSTRAINT "goods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_images" ADD CONSTRAINT "goods_images_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_goods_id_fkey" FOREIGN KEY ("goods_id") REFERENCES "goods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_tickets" ADD CONSTRAINT "bid_tickets_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_tickets" ADD CONSTRAINT "bid_tickets_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_bid_ticket_id_fkey" FOREIGN KEY ("bid_ticket_id") REFERENCES "bid_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_settlements" ADD CONSTRAINT "auction_settlements_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_settlements" ADD CONSTRAINT "auction_settlements_winning_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "bid_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_messages" ADD CONSTRAINT "auction_messages_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_messages" ADD CONSTRAINT "auction_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
