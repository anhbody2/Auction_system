-- stf-005: goods added by customers wait for staff approval. Existing goods stay 'active' (approved).
ALTER TABLE "goods" ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by" BIGINT;

ALTER TABLE "goods" ADD CONSTRAINT "goods_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "goods_status_idx" ON "goods"("status");

INSERT INTO "permissions" ("code", "description") VALUES ('goods.manage', 'Manage and approve goods');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES ('staff', 'goods.manage'), ('admin', 'goods.manage')) AS r(role, code) ON r.code = p.code;
