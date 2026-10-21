-- stf-006: staff soft-delete auctions; deleted auctions are hidden from customers.
ALTER TABLE "auctions" ADD COLUMN "deleted_at" TIMESTAMP(3);

INSERT INTO "permissions" ("code", "description") VALUES ('auction.manage', 'Manage auctions (add, edit, delete)');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES ('staff', 'auction.manage'), ('admin', 'auction.manage')) AS r(role, code) ON r.code = p.code;
