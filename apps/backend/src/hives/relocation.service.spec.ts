import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RelocationService } from './relocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CustomLoggerService } from '../logger/logger.service';

const HIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FIELD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const filter = { apiaryId: HOME, userId: 'user-1' };

type AnyCall = (arg: { data: Record<string, unknown> }) => Promise<unknown>;

function makePrisma() {
  const tx = {
    action: {
      create: vi.fn<AnyCall>(async () => ({ id: 'action-1' })),
    },
    relocationAction: { create: vi.fn<AnyCall>(async () => ({})) },
    hive: { update: vi.fn<AnyCall>(async () => ({})) },
  };
  return {
    tx,
    prisma: {
      apiary: { findFirst: vi.fn(), count: vi.fn(async () => 1) },
      hive: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      relocationAction: { findMany: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService,
  };
}

describe('RelocationService', () => {
  let service: RelocationService;
  let prisma: PrismaService;
  let tx: ReturnType<typeof makePrisma>['tx'];

  beforeEach(() => {
    const made = makePrisma();
    prisma = made.prisma;
    tx = made.tx;
    service = new RelocationService(prisma, {
      setContext: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as CustomLoggerService);
  });

  const destinationIsAccessible = () =>
    (prisma.apiary.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: FIELD,
      name: 'Rapeseed field',
    });
  const hiveIsHere = (apiaryId: string | null = HOME) =>
    (prisma.hive.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: HIVE, apiaryId, apiary: { name: 'Home' } },
    ]);

  describe('destination validation', () => {
    it('refuses an apiary the user cannot access', async () => {
      (prisma.apiary.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.relocateOne(HIVE, { toApiaryId: FIELD }, filter),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Nothing may be written before the destination is proven.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('scopes the lookup to owner or active member', async () => {
      destinationIsAccessible();
      hiveIsHere();

      await service.relocateOne(HIVE, { toApiaryId: FIELD }, filter);

      const where = (prisma.apiary.findFirst as ReturnType<typeof vi.fn>).mock
        .calls[0][0].where;
      expect(where.id).toBe(FIELD);
      expect(where.OR).toEqual([
        { userId: 'user-1' },
        { members: { some: { userId: 'user-1', status: 'ACTIVE' } } },
      ]);
    });
  });

  it('rejects a hive that is not in the source apiary', async () => {
    destinationIsAccessible();
    (prisma.hive.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.relocateOne(HIVE, { toApiaryId: FIELD }, filter),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('a move that is due', () => {
    beforeEach(() => {
      destinationIsAccessible();
      hiveIsHere();
    });

    it('records the action and applies it to the hive', async () => {
      const result = await service.relocateOne(
        HIVE,
        { toApiaryId: FIELD, reason: 'FORAGE', notes: 'to the rapeseed' },
        filter,
      );

      expect(result.applied).toBe(true);
      expect(tx.action.create).toHaveBeenCalledOnce();
      expect(tx.action.create.mock.calls[0][0].data).toMatchObject({
        hiveId: HIVE,
        type: 'RELOCATION',
        notes: 'to the rapeseed',
      });
      expect(tx.relocationAction.create.mock.calls[0][0].data).toMatchObject({
        fromApiaryId: HOME,
        toApiaryId: FIELD,
        reason: 'FORAGE',
      });
      expect(tx.hive.update.mock.calls[0][0].data.apiaryId).toBe(FIELD);
    });

    it('snapshots both apiary names so history survives deletion', async () => {
      await service.relocateOne(HIVE, { toApiaryId: FIELD }, filter);

      expect(tx.relocationAction.create.mock.calls[0][0].data).toMatchObject({
        fromApiaryName: 'Home',
        toApiaryName: 'Rapeseed field',
      });
    });

    it('clears the layout position, which belongs to the old site grid', async () => {
      await service.relocateOne(HIVE, { toApiaryId: FIELD }, filter);

      expect(tx.hive.update.mock.calls[0][0].data).toMatchObject({
        positionRow: null,
        positionCol: null,
      });
    });
  });

  describe('a move dated in the future', () => {
    it('is recorded but does not move the colony yet', async () => {
      destinationIsAccessible();
      hiveIsHere();
      const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString();

      const result = await service.relocateOne(
        HIVE,
        { toApiaryId: FIELD, date: nextWeek },
        filter,
      );

      expect(result.applied).toBe(false);
      expect(tx.action.create).toHaveBeenCalledOnce();
      // Hive.apiaryId answers "where is this colony now" — a planned move
      // must not change it.
      expect(tx.hive.update).not.toHaveBeenCalled();
      expect(tx.relocationAction.create.mock.calls[0][0].data.appliedAt).toBe(
        null,
      );
    });
  });

  it('treats a move to the current apiary as a no-op', async () => {
    destinationIsAccessible();
    hiveIsHere(FIELD); // already standing at the destination

    const result = await service.relocateMany(
      [HIVE],
      { toApiaryId: FIELD },
      filter,
    );

    expect(result.moved).toEqual([]);
    expect(result.skipped).toEqual([HIVE]);
    expect(tx.action.create).not.toHaveBeenCalled();
  });

  describe('applyDueRelocations', () => {
    it('moves the hive and marks the row applied', async () => {
      (
        prisma.relocationAction.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'rel-1', toApiaryId: FIELD, action: { hiveId: HIVE } },
      ]);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const applied = await service.applyDueRelocations();

      expect(applied).toBe(1);
      expect(prisma.hive.update).toHaveBeenCalledWith({
        where: { id: HIVE },
        data: { apiaryId: FIELD, positionRow: null, positionCol: null },
      });
    });

    it('retires a row whose destination apiary was deleted', async () => {
      (
        prisma.relocationAction.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'rel-1', toApiaryId: null, action: { hiveId: HIVE } },
      ]);

      const applied = await service.applyDueRelocations();

      expect(applied).toBe(0);
      // Nothing to apply, but it must not be retried forever.
      expect(prisma.relocationAction.update).toHaveBeenCalledOnce();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips a move whose destination apiary no longer exists', async () => {
      // Apiary ids are plain columns, so they can outlive the apiary.
      (
        prisma.relocationAction.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'rel-1', toApiaryId: FIELD, action: { hiveId: HIVE } },
      ]);
      (prisma.apiary.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const applied = await service.applyDueRelocations();

      expect(applied).toBe(0);
      expect(prisma.hive.update).not.toHaveBeenCalled();
      expect(prisma.relocationAction.update).toHaveBeenCalledOnce();
    });
  });
});
