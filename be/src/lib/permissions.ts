import { prisma } from '../db';
import { ROLES, type Role } from '../middleware/auth';

export const PERMISSIONS = [
  { code: 'report.view', description: 'View auction statistics' },
  { code: 'report.export', description: 'Export statistics to Excel' },
  { code: 'user.manage', description: 'Add, edit, delete users and reset passwords' },
  { code: 'permission.manage', description: 'Grant and revoke role permissions' },
  { code: 'goods.manage', description: 'Manage and approve goods' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

/** Grants the migration installs; the seed restores any that are missing. */
export const DEFAULT_GRANTS: Record<Role, PermissionCode[]> = {
  customer: [],
  staff: ['report.view', 'report.export', 'goods.manage'],
  admin: ['user.manage', 'permission.manage', 'goods.manage'],
};

/** Admin keeps these so nobody can lock themselves out of administration. */
export const LOCKED_ADMIN_PERMISSIONS: PermissionCode[] = ['user.manage', 'permission.manage'];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export async function permissionsForRole(role: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({ where: { role }, include: { permission: true } });
  return rows.map((r) => r.permission.code).sort();
}
