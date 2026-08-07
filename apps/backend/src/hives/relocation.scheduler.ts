import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RelocationService } from './relocation.service';
import { CustomLoggerService } from '../logger/logger.service';

/**
 * Puts scheduled relocations into effect once their date has arrived.
 *
 * A move dated in the future is recorded immediately but must not change
 * `Hive.apiaryId` yet, since that field answers "where does this colony stand
 * right now" throughout the backend.
 */
@Injectable()
export class RelocationScheduler {
  constructor(
    private readonly relocationService: RelocationService,
    private readonly logger: CustomLoggerService,
  ) {
    this.logger.setContext('RelocationScheduler');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async applyDueRelocations(): Promise<void> {
    try {
      await this.relocationService.applyDueRelocations();
    } catch (error) {
      // A failed sweep must not take the scheduler down; the next run retries
      // because the rows stay unapplied.
      this.logger.error(
        `Failed to apply scheduled relocations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
