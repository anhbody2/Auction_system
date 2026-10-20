-- bid-004: BID_INCREMENT_RULES follow the SRS ranges ($10 from $100 to $1000, $100 over $1000).
-- Kept in step with INCREMENT_LADDER in be/src/lib/increments.ts (the seed writes the same rows).
DELETE FROM "bid_increment_rules";
INSERT INTO "bid_increment_rules" ("min_bid_amount", "max_bid_amount", "increment_amount", "status", "updated_at") VALUES
  (0, 1, 0.05, 'active', CURRENT_TIMESTAMP),
  (1, 10, 0.50, 'active', CURRENT_TIMESTAMP),
  (10, 50, 1.00, 'active', CURRENT_TIMESTAMP),
  (50, 100, 2.50, 'active', CURRENT_TIMESTAMP),
  (100, 1000, 10.00, 'active', CURRENT_TIMESTAMP),
  (1000, NULL, 100.00, 'active', CURRENT_TIMESTAMP);
