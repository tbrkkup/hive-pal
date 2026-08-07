import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiaryUserFilter } from '../interface/request-with.apiary';
import { CustomLoggerService } from '../logger/logger.service';
import {
  ActionType,
  RelocateHive,
  RelocationBulkResult,
  RelocationResult,
} from 'shared-schemas';

/**
 * Moving colonies between apiaries.
 *
 * An apiary is a location, so relocating a colony is the app's notion of
 * migratory beekeeping: the colony moves, the site does not. Every move is
 * written to the hive timeline as a `RELOCATION` action, and may be dated
 * freely — a past date records a move that already happened, a future date
 * schedules one (see `applyDueRelocations`).
 */
@Injectable()
export class RelocationService {
  constructor(
    private prisma: PrismaService,
    private logger: CustomLoggerService,
  ) {
    this.logger.setContext('RelocationService');
  }

  async relocateOne(
    hiveId: string,
    dto: RelocateHive,
    filter: ApiaryUserFilter,
  ): Promise<RelocationResult> {
    const result = await this.relocateMany([hiveId], dto, filter);
    const moved = result.moved[0];
    if (!moved) {
      // The only way a single hive gets skipped is it already standing at the
      // destination. Report the no-op instead of inventing an action.
      throw new ForbiddenException(
        'This colony already stands at the destination apiary',
      );
    }
    return moved;
  }

  /**
   * Moves one or more colonies in a single transaction, so a partially
   * completed migration cannot happen.
   */
  async relocateMany(
    hiveIds: string[],
    dto: RelocateHive,
    filter: ApiaryUserFilter,
  ): Promise<RelocationBulkResult> {
    const date = dto.date ? new Date(dto.date) : new Date();
    const ids = [...new Set(hiveIds)];

    // The destination must belong to the caller. Without this check any apiary
    // id could be written into Hive.apiaryId, moving a colony into a stranger's
    // apiary — the request context only proves access to the *source*.
    const destination = await this.prisma.apiary.findFirst({
      where: {
        id: dto.toApiaryId,
        OR: [
          { userId: filter.userId },
          { members: { some: { userId: filter.userId, status: 'ACTIVE' } } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!destination) {
      throw new ForbiddenException(
        'Destination apiary not found or not accessible',
      );
    }

    const hives = await this.prisma.hive.findMany({
      where: { id: { in: ids }, apiaryId: filter.apiaryId },
      select: { id: true, apiaryId: true, apiary: { select: { name: true } } },
    });
    if (hives.length !== ids.length) {
      const found = new Set(hives.map((h) => h.id));
      throw new NotFoundException(
        `Hive(s) not found in this apiary: ${ids
          .filter((id) => !found.has(id))
          .join(', ')}`,
      );
    }

    const toMove = hives.filter((h) => h.apiaryId !== destination.id);
    const skipped = hives
      .filter((h) => h.apiaryId === destination.id)
      .map((h) => h.id);

    // A move dated in the future is recorded but must not change where the
    // colony stands today: Hive.apiaryId is the authorization axis across the
    // backend and has to keep meaning "current location".
    const isDue = date.getTime() <= Date.now();

    const moved = await this.prisma.$transaction(async (tx) => {
      const results: RelocationResult[] = [];
      for (const hive of toMove) {
        const action = await tx.action.create({
          data: {
            hiveId: hive.id,
            type: ActionType.RELOCATION,
            date,
            notes: dto.notes,
          },
        });
        await tx.relocationAction.create({
          data: {
            actionId: action.id,
            fromApiaryId: hive.apiaryId,
            toApiaryId: destination.id,
            fromApiaryName: hive.apiary?.name ?? null,
            toApiaryName: destination.name,
            reason: dto.reason,
            appliedAt: isDue ? new Date() : null,
          },
        });
        if (isDue) {
          await tx.hive.update({
            where: { id: hive.id },
            // Positions address a slot in the old apiary's layout grid and are
            // meaningless — and possibly already taken — at the new site.
            data: {
              apiaryId: destination.id,
              positionRow: null,
              positionCol: null,
            },
          });
        }
        results.push({
          hiveId: hive.id,
          actionId: action.id,
          fromApiaryId: hive.apiaryId,
          toApiaryId: destination.id,
          date: date.toISOString(),
          applied: isDue,
        });
      }
      return results;
    });

    this.logger.log(
      `Relocated ${moved.length} hive(s) to apiary ${destination.id}` +
        `${isDue ? '' : ' (scheduled)'}${skipped.length ? `, ${skipped.length} skipped` : ''}`,
    );
    return { moved, skipped };
  }

  /**
   * Applies relocations whose date has arrived. Called by the scheduler; kept
   * public so it can be driven directly in tests.
   */
  async applyDueRelocations(now = new Date()): Promise<number> {
    const due = await this.prisma.relocationAction.findMany({
      where: { appliedAt: null, action: { date: { lte: now } } },
      select: {
        id: true,
        toApiaryId: true,
        action: { select: { hiveId: true } },
      },
      orderBy: { action: { date: 'asc' } },
    });

    let applied = 0;
    for (const row of due) {
      const hiveId = row.action.hiveId;
      // The destination is a plain id, so it may name an apiary that has been
      // deleted since the move was scheduled. Applying it would fail on
      // Hive.apiaryId's foreign key, so check before touching the hive.
      const destinationExists = row.toApiaryId
        ? (await this.prisma.apiary.count({ where: { id: row.toApiaryId } })) >
          0
        : false;
      if (!hiveId || !row.toApiaryId || !destinationExists) {
        // Nothing left to apply; the row stays as history but must not be
        // retried on every sweep.
        await this.prisma.relocationAction.update({
          where: { id: row.id },
          data: { appliedAt: now },
        });
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.hive.update({
          where: { id: hiveId },
          data: {
            apiaryId: row.toApiaryId,
            positionRow: null,
            positionCol: null,
          },
        }),
        this.prisma.relocationAction.update({
          where: { id: row.id },
          data: { appliedAt: now },
        }),
      ]);
      applied++;
    }
    if (applied > 0) {
      this.logger.log(`Applied ${applied} scheduled relocation(s)`);
    }
    return applied;
  }
}
