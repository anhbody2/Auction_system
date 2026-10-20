import type request from 'supertest';
import { prisma } from '../src/db';
import { uploadTestImage } from './upload.fixtures';

/** Adds goods with one uploaded image as the agent and returns its id. Needs useTempUploadDir(). */
export async function addGoods(agent: request.Agent, name: string, overrides: Record<string, unknown> = {}) {
  const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } });
  const res = await agent.post('/api/goods').send({
    name,
    description: 'Goods created by the goods tests.',
    categoryId: Number(category.id),
    condition: 'new',
    images: [await uploadTestImage(agent)],
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`add goods failed: ${JSON.stringify(res.body)}`);
  return BigInt(res.body.goods.id);
}

/** Attaches an auction in the given state directly, so the goods' derived status can be set up on its own. */
export async function attachAuction(goodsId: bigint, status: string, winner?: string) {
  const goods = await prisma.goods.findUniqueOrThrow({ where: { id: goodsId } });
  const winnerId = winner ? (await prisma.user.findUniqueOrThrow({ where: { username: winner } })).id : null;
  return prisma.auction.create({
    data: {
      sellerId: goods.sellerId,
      goodsId,
      winnerId,
      name: goods.name,
      initialPrice: 10,
      durationMinutes: 60,
      startTime: new Date(Date.now() - 3600_000),
      endTime: new Date(Date.now() + (status === 'ended' || status === 'cancelled' ? -60_000 : 3600_000)),
      status,
    },
  });
}
