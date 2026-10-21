import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { startDueAuctions } from '../src/lib/jobs';
import { createAuction, inMinutes, loginAs, resetDb } from './helpers';

const stored = async (id: number) => (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(id) } })).status;

describe("sell-007 every new auction is 'upcoming' with a 'New' tag until it starts", () => {
  beforeEach(resetDb);

  it('POST /api/auctions ignores a status in the body and stores upcoming; isNew while the start is in the future', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { name: 'Future Lamp', startTime: inMinutes(10), status: 'active' });
    expect(await stored(a.id)).toBe('upcoming');
    expect(a).toMatchObject({ status: 'upcoming', isNew: true });
    const got = (await alice.get(`/api/auctions/${a.id}`)).body.auction;
    expect(got).toMatchObject({ status: 'upcoming', isNew: true });
    // The public listing carries the tag too.
    const home = (await alice.get('/api/auctions')).body.auctions as { id: number; isNew: boolean }[];
    expect(home.find((x) => x.id === a.id)).toMatchObject({ isNew: true });
    // ...and so does My auctions.
    const mine = (await alice.get('/api/me/auctions')).body.auctions as { id: number; isNew: boolean }[];
    expect(mine.find((x) => x.id === a.id)).toMatchObject({ isNew: true });
  });

  it('an auction starting now is also stored upcoming, but is not new: it has already started', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { name: 'Now Lamp', status: 'ended' });
    expect(await stored(a.id)).toBe('upcoming');
    expect(a).toMatchObject({ status: 'active', isNew: false });
  });

  it('once the start time passes isNew is false, before and after the start job runs', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { name: 'Soon Lamp', startTime: inMinutes(10) });
    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { startTime: new Date(Date.now() - 1000) } });

    // Stored status is still upcoming: the tag is already gone.
    expect(await stored(a.id)).toBe('upcoming');
    expect((await alice.get(`/api/auctions/${a.id}`)).body.auction).toMatchObject({ status: 'active', isNew: false });

    expect(await startDueAuctions()).toBeGreaterThanOrEqual(1);
    expect(await stored(a.id)).toBe('active');
    expect((await alice.get(`/api/auctions/${a.id}`)).body.auction).toMatchObject({ status: 'active', isNew: false });
  });

  it('cancelled upcoming auctions are not new', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { name: 'Gone Lamp', startTime: inMinutes(10) });
    expect((await alice.post(`/api/auctions/${a.id}/cancel`)).status).toBe(200);
    expect((await alice.get(`/api/auctions/${a.id}`)).body.auction).toMatchObject({ status: 'cancelled', isNew: false });
  });
});
