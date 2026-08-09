import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ActionResponse,
  ActionType,
  FeedingActionDetails,
} from 'shared-schemas';
import { calculateFeedingTotals } from './feeding-calculations';

// Pinned inside the default autumn feeding window (Aug–Oct) so the autumn
// totals are exercised deterministically.
const NOW = new Date('2026-09-15T12:00:00.000Z');
const IN_AUTUMN = '2026-09-01T10:00:00.000Z';

const makeFeeding = (
  details: Omit<FeedingActionDetails, 'type'>,
  date: string = IN_AUTUMN,
): ActionResponse => ({
  id: '11111111-1111-1111-1111-111111111111',
  hiveId: '22222222-2222-2222-2222-222222222222',
  inspectionId: null,
  harvestId: null,
  date,
  type: ActionType.FEEDING,
  details: { type: ActionType.FEEDING, ...details } as FeedingActionDetails,
});

describe('calculateFeedingTotals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('v2 records (feed-type registry)', () => {
    it('counts the sugar mass stored on a commercial invert syrup feeding', () => {
      // 14 kg Apiinvert at 72.7 % sugar
      const totals = calculateFeedingTotals([
        makeFeeding({
          feedType: 'Apiinvert',
          amount: 14,
          unit: 'kg',
          feedTypeId: 'APIINVERT',
          enteredAmount: 14,
          enteredUnit: 'kg',
          amountG: 14000,
          density: 1.28,
          sugarContent: 72.7,
          sugarG: 10178,
        }),
      ]);

      expect(totals.autumnSugarKg).toBeCloseTo(10.178, 3);
      expect(totals.currentYearSugarKg).toBeCloseTo(10.178, 3);
      expect(totals.totalSugarKg).toBeCloseTo(10.178, 3);
    });

    it('counts user-defined feed types, which carry no built-in label', () => {
      const totals = calculateFeedingTotals([
        makeFeeding({
          feedType: 'Bio-Invert',
          amount: 2,
          unit: 'kg',
          feedTypeId: '33333333-3333-3333-3333-333333333333',
          enteredAmount: 2,
          enteredUnit: 'kg',
          amountG: 2000,
          sugarContent: 70,
          sugarG: 1400,
        }),
      ]);

      expect(totals.autumnSugarKg).toBeCloseTo(1.4, 3);
    });

    it('derives the liquid volume from mass and density, including dilution water', () => {
      // 500 g Apiinvert (≈ 391 ml at 1.28 g/ml) diluted with 500 ml water
      const totals = calculateFeedingTotals([
        makeFeeding({
          feedType: 'Apiinvert',
          amount: 500,
          unit: 'g',
          feedTypeId: 'APIINVERT',
          enteredAmount: 500,
          enteredUnit: 'g',
          amountG: 500,
          density: 1.28,
          sugarContent: 72.7,
          sugarG: 363.5,
          waterAddedMl: 500,
        }),
      ]);

      expect(totals.autumnSugarKg).toBeCloseTo(0.3635, 4);
      expect(totals.autumnSyrupLiters).toBeCloseTo(0.5 / 1.28 + 0.5, 3);
    });

    it('contributes no sugar for a feed with zero sugar content', () => {
      const totals = calculateFeedingTotals([
        makeFeeding({
          feedType: 'Pollen patty',
          amount: 1,
          unit: 'kg',
          feedTypeId: 'POLLEN_PATTY',
          enteredAmount: 1,
          enteredUnit: 'kg',
          amountG: 1000,
          sugarContent: 0,
          sugarG: 0,
        }),
      ]);

      expect(totals.autumnSugarKg).toBe(0);
      expect(totals.autumnSyrupLiters).toBe(0);
    });

    it('keeps feedings outside the autumn window out of the autumn total', () => {
      const totals = calculateFeedingTotals([
        makeFeeding(
          {
            feedType: 'Apiinvert',
            amount: 5,
            unit: 'kg',
            feedTypeId: 'APIINVERT',
            amountG: 5000,
            sugarContent: 72.7,
            sugarG: 3635,
          },
          '2026-05-01T10:00:00.000Z',
        ),
      ]);

      expect(totals.autumnSugarKg).toBe(0);
      expect(totals.currentYearSugarKg).toBeCloseTo(3.635, 3);
    });
  });

  describe('legacy records (no stored sugar mass)', () => {
    it('still derives sugar from syrup volume and concentration', () => {
      const totals = calculateFeedingTotals([
        makeFeeding({
          feedType: 'SYRUP',
          amount: 2000,
          unit: 'ml',
          concentration: '2:1',
        }),
      ]);

      // 2 L at 890 g sugar per litre
      expect(totals.autumnSugarKg).toBeCloseTo(1.78, 3);
      expect(totals.autumnSyrupLiters).toBeCloseTo(2, 3);
    });

    it('still treats candy as pure sugar', () => {
      const totals = calculateFeedingTotals([
        makeFeeding({ feedType: 'CANDY', amount: 2.5, unit: 'kg' }),
      ]);

      expect(totals.autumnSugarKg).toBeCloseTo(2.5, 3);
    });
  });
});
