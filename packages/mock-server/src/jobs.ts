import type { DemoClock } from './clock';
import type { Database } from './db/database';
import { runKycExpiryJob } from './services/kyc';
import { runTravelledJob } from './services/booking/lifecycle';
import { runInstallmentJob } from './services/finance';
import { runSubscriptionJob } from './services/subscriptions';
import { runReminderJob } from './services/notifications';

/**
 * Clock-driven jobs (MOCK_DATA_ARCHITECTURE §1 `jobs/`): the prototype's stand-in for BullMQ repeatable jobs.
 * Run before each request so moving the demo clock immediately takes effect. Each job is idempotent.
 * Later milestones register: instalment overdue marking, quote expiry, auto-travelled, subscription renewals.
 */
const JOBS: ((db: Database, clock: DemoClock) => boolean)[] = [runKycExpiryJob, runTravelledJob, runInstallmentJob, runSubscriptionJob, runReminderJob];

export function registerClockJob(job: (db: Database, clock: DemoClock) => boolean): void {
  JOBS.push(job);
}

export function runClockJobs(db: Database, clock: DemoClock): boolean {
  let changed = false;
  for (const job of JOBS) changed = job(db, clock) || changed;
  return changed;
}
