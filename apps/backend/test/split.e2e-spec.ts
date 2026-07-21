import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { getRandomApiary } from './fixtures/apiary';
import { createTestUser, loginAndGetCookie } from './helpers/auth';

/**
 * Colony split (Volksteilung / Ableger) — Phase 2 endpoint.
 * Covers frame accounting, queen disposition, the SPLIT action pair, the
 * follow-up todo, and undo (restore + guardrail).
 */
describe('Colony split (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authCookie: string[];
  let userId: string;
  let apiaryId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get(PrismaService);

    const testUser = await createTestUser(prisma, {
      email: 'split-test-user@example.com',
      password: 'password123',
    });
    userId = testUser.id;
    authCookie = await loginAndGetCookie(
      app,
      'split-test-user@example.com',
      'password123',
    );

    const apiary = await prisma.apiary.create({
      data: getRandomApiary({ userId, name: 'Split Test Apiary' }),
    });
    apiaryId = apiary.id;
  });

  afterAll(async () => {
    await prisma.splitAction.deleteMany({
      where: { action: { hive: { apiary: { userId } } } },
    });
    await prisma.action.deleteMany({ where: { hive: { apiary: { userId } } } });
    await prisma.todo.deleteMany({ where: { apiaryId } });
    await prisma.queenMovement.deleteMany({
      where: { queen: { hive: { apiary: { userId } } } },
    });
    await prisma.queen.deleteMany({ where: { hive: { apiary: { userId } } } });
    await prisma.box.deleteMany({ where: { hive: { apiary: { userId } } } });
    await prisma.hive.deleteMany({ where: { apiary: { userId } } });
    await prisma.apiary.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  // Creates a source hive with a single brood box of `frameCount` frames.
  async function makeSourceHive(name: string, frameCount = 10) {
    const hive = await prisma.hive.create({
      data: { name, apiaryId, status: 'ACTIVE' },
    });
    const box = await prisma.box.create({
      data: {
        hiveId: hive.id,
        position: 0,
        frameCount,
        maxFrameCount: 12,
        hasExcluder: false,
        type: 'BROOD',
      },
    });
    return { hive, box };
  }

  it('splits a colony: creates the daughter, debits the mother, writes a SPLIT pair and a follow-up todo', async () => {
    const { hive, box } = await makeSourceHive('Mother A', 10);

    const res = await request(app.getHttpServer())
      .post(`/hives/${hive.id}/split`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .send({
        date: new Date().toISOString(),
        newHiveName: 'Ableger A',
        framesMoved: [{ boxId: box.id, count: 3 }],
        queenDisposition: 'STAYED_WITH_SOURCE',
        followUpDays: 24,
      })
      .expect(201);

    expect(res.body).toHaveProperty('splitId');
    expect(res.body.sourceHiveId).toBe(hive.id);
    const newHiveId: string = res.body.newHiveId;

    // Mother debited 10 -> 7
    const motherBox = await prisma.box.findUnique({ where: { id: box.id } });
    expect(motherBox?.frameCount).toBe(7);

    // Daughter exists with one brood box of 3 frames + provenance link
    const daughter = await prisma.hive.findUnique({
      where: { id: newHiveId },
      include: { boxes: true },
    });
    expect(daughter?.parentHiveId).toBe(hive.id);
    expect(daughter?.boxes).toHaveLength(1);
    expect(daughter?.boxes[0].frameCount).toBe(3);
    expect(daughter?.boxes[0].type).toBe('BROOD');

    // SPLIT action pair (one per hive), sharing the splitId
    const splitActions = await prisma.splitAction.findMany({
      where: { splitId: res.body.splitId },
    });
    expect(splitActions).toHaveLength(2);
    expect(splitActions.map((s) => s.role).sort()).toEqual(['NEW', 'SOURCE']);
    expect(splitActions.every((s) => s.framesMoved === 3)).toBe(true);

    // Follow-up todo for the queenless side (the daughter here)
    const todos = await prisma.todo.findMany({ where: { hiveId: newHiveId } });
    expect(todos.length).toBeGreaterThanOrEqual(1);

    // Provenance is exposed on the hive detail endpoint (Phase 4):
    // the daughter reports its mother, and the mother lists the daughter.
    const daughterDetail = await request(app.getHttpServer())
      .get(`/hives/${newHiveId}`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .expect(200);
    expect(daughterDetail.body.parentHiveId).toBe(hive.id);
    expect(daughterDetail.body.parentHive?.id).toBe(hive.id);
    expect(daughterDetail.body.parentHive?.name).toBe('Mother A');

    const motherDetail = await request(app.getHttpServer())
      .get(`/hives/${hive.id}`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .expect(200);
    expect(
      motherDetail.body.offspring.map((o: { id: string }) => o.id),
    ).toContain(newHiveId);
  });

  it('moves the queen to the daughter when queenDisposition = MOVED_TO_NEW', async () => {
    const { hive, box } = await makeSourceHive('Mother B', 10);
    const queen = await prisma.queen.create({
      data: { hiveId: hive.id, status: 'ACTIVE' },
    });

    const res = await request(app.getHttpServer())
      .post(`/hives/${hive.id}/split`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .send({
        date: new Date().toISOString(),
        newHiveName: 'Ableger B',
        framesMoved: [{ boxId: box.id, count: 4 }],
        queenDisposition: 'MOVED_TO_NEW',
      })
      .expect(201);

    const movedQueen = await prisma.queen.findUnique({
      where: { id: queen.id },
    });
    expect(movedQueen?.hiveId).toBe(res.body.newHiveId);
    // The follow-up reminder is now on the (queenless) mother
    const motherTodos = await prisma.todo.findMany({
      where: { hiveId: hive.id },
    });
    expect(motherTodos.length).toBeGreaterThanOrEqual(1);
  });

  it('undoes a split: restores the mother frames and deletes the daughter', async () => {
    const { hive, box } = await makeSourceHive('Mother C', 10);

    const split = await request(app.getHttpServer())
      .post(`/hives/${hive.id}/split`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .send({
        date: new Date().toISOString(),
        newHiveName: 'Ableger C',
        framesMoved: [{ boxId: box.id, count: 5 }],
        queenDisposition: 'STAYED_WITH_SOURCE',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/hives/${hive.id}/splits/${split.body.splitId}`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .expect(200);

    // Mother restored 5 -> back to 10
    const motherBox = await prisma.box.findUnique({ where: { id: box.id } });
    expect(motherBox?.frameCount).toBe(10);

    // Daughter deleted
    const daughter = await prisma.hive.findUnique({
      where: { id: split.body.newHiveId },
    });
    expect(daughter).toBeNull();

    // Split actions gone
    const splitActions = await prisma.splitAction.findMany({
      where: { splitId: split.body.splitId },
    });
    expect(splitActions).toHaveLength(0);
  });

  it('rejects moving more frames than a box holds', async () => {
    const { hive, box } = await makeSourceHive('Mother D', 6);
    await request(app.getHttpServer())
      .post(`/hives/${hive.id}/split`)
      .set('Cookie', authCookie)
      .set('x-apiary-id', apiaryId)
      .send({
        date: new Date().toISOString(),
        newHiveName: 'Ableger D',
        framesMoved: [{ boxId: box.id, count: 99 }],
        queenDisposition: 'STAYED_WITH_SOURCE',
      })
      .expect(400);
  });
});
