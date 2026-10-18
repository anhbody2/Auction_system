-- CreateTable
CREATE TABLE "permissions" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" VARCHAR(20) NOT NULL,
    "permission_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default permissions and grants (sec-002). Admins can change grants at runtime.
INSERT INTO "permissions" ("code", "description") VALUES
  ('report.view', 'View auction statistics'),
  ('report.export', 'Export statistics to Excel'),
  ('user.manage', 'Add, edit, delete users and reset passwords'),
  ('permission.manage', 'Grant and revoke role permissions');

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p.id FROM "permissions" p
JOIN (VALUES
  ('staff', 'report.view'), ('staff', 'report.export'),
  ('admin', 'user.manage'), ('admin', 'permission.manage')
) AS r(role, code) ON r.code = p.code;
