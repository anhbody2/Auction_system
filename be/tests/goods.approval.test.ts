import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { getOutbox } from '../src/lib/mailer';
import { inMinutes, loginAs, resetDb } from './helpers';
import { addGoods } from './goods.fixtures';
import { useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

const terms = (goodsId: bigint) => ({
  goodsId: Number(goodsId),
  name: 'Approval Lamp',
  description: 'A lamp waiting for approval.',
  initialPrice: 10,
  startTime: inMinutes(0),
  duration: { value: 1, unit: 'hours' },
});
const aliceMail = async () => getOutbox((await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).email).at(-1);

describe('stf-005 goods need staff approval before auction', () => {
  beforeEach(resetDb);

  it('customer goods start pending; pending cannot be auctioned; approval lets the seller auction and mails them', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Approval Lamp', {}, { approve: false });
    expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).status).toBe('pending');
    expect((await alice.get('/api/me/goods')).body.goods[0]).toMatchObject({ status: 'pending', lockedReason: null });
    expect((await alice.get('/api/me/goods?status=available')).body.goods).toEqual([]);

    const early = await alice.post('/api/auctions').send(terms(id));
    expect(early.status).toBe(400);
    expect(early.body.error).toBe('Goods must be approved before auction');

    const staff = await loginAs('staff');
    const approved = await staff.post(`/api/staff/goods/${id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.goods).toMatchObject({ status: 'active', reviewedBy: { username: 'staff' } });
    expect((await aliceMail())?.subject).toBe('Your goods "Approval Lamp" were approved');

    expect((await alice.get('/api/me/goods')).body.goods[0].status).toBe('available');
    expect((await alice.post('/api/auctions').send(terms(id))).status).toBe(201);
    // Only pending goods can be reviewed.
    expect((await staff.post(`/api/staff/goods/${id}/approve`)).status).toBe(400);
  });

  it('reject stores the reason and mails the seller; rejected goods cannot be auctioned; editing sends them back to pending', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Blurry Lamp', {}, { approve: false });
    const staff = await loginAs('staff');
    expect((await staff.post(`/api/staff/goods/${id}/reject`).send({ reason: 'Photos are too blurry' })).status).toBe(200);
    expect(await prisma.goods.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'rejected', rejectionReason: 'Photos are too blurry' });
    const mail = (await aliceMail())!;
    expect(mail.subject).toBe('Your goods "Blurry Lamp" were not approved');
    expect(mail.text).toContain('Reason: Photos are too blurry');

    expect((await alice.get('/api/me/goods')).body.goods[0]).toMatchObject({ status: 'rejected', rejectionReason: 'Photos are too blurry' });
    const blocked = await alice.post('/api/auctions').send(terms(id));
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('Goods must be approved before auction');

    // The seller fixes the goods: back to pending, reason cleared.
    expect((await alice.patch(`/api/goods/${id}`).send({ name: 'Sharp Lamp' })).status).toBe(200);
    expect(await prisma.goods.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'pending', rejectionReason: null });
    // A reason is optional.
    expect((await staff.post(`/api/staff/goods/${id}/reject`).send({})).status).toBe(200);
    expect((await aliceMail())!.text).not.toContain('Reason:');
  });

  it('goods bought through an auction stay approved for the buyer (gds-003)', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Bought Lamp');
    const bob = await loginAs('bob');
    await prisma.goods.update({ where: { id }, data: { buyerId: (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id } });
    expect((await bob.get('/api/me/goods')).body.goods[0]).toMatchObject({ status: 'available', bought: true });
  });
});
