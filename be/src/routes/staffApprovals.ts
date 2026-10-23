import { Router } from 'express';
import { creditPendingCount, goodsPendingCount } from '../lib/approvalEvents';
import { streamStaff, type StaffChannel } from '../lib/events';
import { HttpError, asyncHandler } from '../lib/http';
import { permissionsForRole } from '../lib/permissions';
import { requireAuth } from '../middleware/auth';

/**
 * stf-009: the staff side of "Turn all request Approve to realtime". Mounted at /api/staff.
 * Each channel needs its own permission (goods.manage, credit.manage), read when the stream connects.
 */
export const staffApprovalsRouter = Router();

const CHANNEL_PERMISSION: Record<StaffChannel, string> = { goods: 'goods.manage', credit: 'credit.manage' };

async function allowedChannels(role: string) {
  const perms = await permissionsForRole(role);
  const channels = (Object.keys(CHANNEL_PERMISSION) as StaffChannel[]).filter((c) => perms.includes(CHANNEL_PERMISSION[c]));
  if (!channels.length) throw new HttpError(403, 'You do not have permission to do this');
  return channels;
}

staffApprovalsRouter.get(
  '/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    streamStaff(req, res, await allowedChannels(req.user!.role));
  }),
);

/** Initial values for the nav badges; each count only with its permission. */
staffApprovalsRouter.get(
  '/pending-counts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const channels = await allowedChannels(req.user!.role);
    const counts: { goods?: number; credit?: number } = {};
    if (channels.includes('goods')) counts.goods = await goodsPendingCount();
    if (channels.includes('credit')) counts.credit = await creditPendingCount();
    res.json(counts);
  }),
);
