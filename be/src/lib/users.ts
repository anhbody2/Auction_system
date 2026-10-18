import { prisma } from '../db';
import { permissionsForRole } from './permissions';

export async function getPublicUser(id: bigint) {
  const user = await prisma.user.findUnique({ where: { id }, include: { info: true } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    creditBalance: user.creditBalance,
    heldBalance: user.heldBalance,
    fullName: user.info?.fullName ?? null,
    phone: user.info?.phone ?? null,
    address: user.info?.address ?? null,
    permissions: await permissionsForRole(user.role),
  };
}
