-- stf-007: top-up and withdrawal requests wait for staff approval. Existing rows are posted (already applied).
ALTER TABLE "credit_transactions" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by" BIGINT;

ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "credit_transactions_status_idx" ON "credit_transactions"("status");

INSERT INTO "permissions" ("code", "description") VALUES ('credit.manage', 'Approve credit requests and manage transactions');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES ('staff', 'credit.manage'), ('admin', 'credit.manage')) AS r(role, code) ON r.code = p.code;
