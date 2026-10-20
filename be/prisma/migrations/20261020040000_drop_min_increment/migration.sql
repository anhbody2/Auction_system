-- Per-auction minimum increment removed: bids step by the increment ladder only.
ALTER TABLE "auctions" DROP COLUMN "min_increment";
