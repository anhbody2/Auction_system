-- gds-003: goods remember who bought them; the buyer can re-auction them.
ALTER TABLE "goods" ADD COLUMN "buyer_id" BIGINT;

ALTER TABLE "goods" ADD CONSTRAINT "goods_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the last auction of each goods that ended with a winner hands it over (seller = that auction's seller, buyer = its winner).
UPDATE "goods" AS g
SET "buyer_id" = s."winner_id", "seller_id" = s."seller_id"
FROM (
  SELECT DISTINCT ON ("goods_id") "goods_id", "winner_id", "seller_id"
  FROM "auctions"
  WHERE "status" = 'ended' AND "winner_id" IS NOT NULL
  ORDER BY "goods_id", "end_time" DESC, "id" DESC
) AS s
WHERE g."id" = s."goods_id";
