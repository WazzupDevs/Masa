// Pauses every pg_cron job while the integration tests run, so no job fires between two steps of
// a test (a closed reveal window, a refreshed Keşfet bucket, an expired request). Tests that cover
// a job call its function directly. Every job is scheduled active by the migrations, so teardown
// turns all of them back on; a run killed before teardown is healed by the next run's teardown or
// by `pnpm db:reset`.
import { sql } from './local.ts';

async function setActive(active: boolean): Promise<void> {
  await sql`select cron.alter_job(jobid, active => ${active}) from cron.job`;
}

export async function setup(): Promise<void> {
  await setActive(false);
  // A job that started just before the pause may still be running; wait for it to finish.
  for (let i = 0; i < 50; i++) {
    const [running] = await sql`
      select count(*)::int as n from cron.job_run_details
      where status in ('starting', 'running') and start_time > now() - interval '1 minute'
    `;
    if (running?.n === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('a pg_cron job is still running after 10 s');
}

export async function teardown(): Promise<void> {
  await setActive(true);
  await sql.end();
}
