import { Router } from 'express';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { LOCKED_ADMIN_PERMISSIONS, isRole, type PermissionCode } from '../lib/permissions';
import { ROLES, requirePermission } from '../middleware/auth';
import { z } from 'zod';

export const adminRouter = Router();

/** sec-002: the permission matrix, roles x permissions. */
adminRouter.get(
  '/permissions',
  requirePermission('permission.manage'),
  asyncHandler(async (_req, res) => {
    const permissions = await prisma.permission.findMany({ orderBy: { id: 'asc' }, include: { roles: true } });
    const grants = Object.fromEntries(
      ROLES.map((role) => [role, permissions.filter((p) => p.roles.some((r) => r.role === role)).map((p) => p.code)]),
    );
    res.json({
      roles: ROLES,
      permissions: permissions.map((p) => ({ code: p.code, description: p.description })),
      grants,
      locked: { admin: LOCKED_ADMIN_PERMISSIONS },
    });
  }),
);

adminRouter.put(
  '/roles/:role/permissions/:code',
  requirePermission('permission.manage'),
  asyncHandler(async (req, res) => {
    const { granted } = z.object({ granted: z.boolean({ required_error: 'granted is required' }) }).parse(req.body);
    const { role, code } = req.params;
    if (!isRole(role)) throw new HttpError(400, 'Unknown role');
    const permission = await prisma.permission.findUnique({ where: { code } });
    if (!permission) throw new HttpError(400, 'Unknown permission');
    if (!granted && role === 'admin' && LOCKED_ADMIN_PERMISSIONS.includes(code as PermissionCode)) {
      throw new HttpError(400, `The admin role must keep '${code}' so administration is not locked out`);
    }
    const key = { role_permissionId: { role, permissionId: permission.id } };
    if (granted) {
      await prisma.rolePermission.upsert({ where: key, update: {}, create: { role, permissionId: permission.id } });
    } else {
      await prisma.rolePermission.deleteMany({ where: { role, permissionId: permission.id } });
    }
    res.json({ role, code, granted });
  }),
);
