// Plan morning-digest § 1: the contract section 2 (page, JSON, board link, route tests) builds on.
// The reader itself is `readNight` in `src/digest/read.ts`, typed by `ReadNight` below.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night. Every line of the job counts, in time order.
export type DigestRow = {
  job: string;
  // Latest non-null owner logged for the job; null when none was. Views render null as `—`.
  owner: string | null;
  // Lines for this job, any status. Each line is one attempt.
  runs: number;
  // Lines with status `retry`.
  retries: number;
  // Lines with status `fail`.
  fails: number;
  // Status of the job's latest line.
  lastStatus: RunStatus;
  // Latest `error` logged for the job, even if a later line succeeded; null when none was.
  lastError: string | null;
  // `at` of the job's earliest and latest lines, exactly as logged (offset kept, never UTC).
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  // The night, `YYYY-MM-DD`, as asked for.
  night: string;
  // Sorted by job (plain string order), so the page and the JSON share one order.
  rows: DigestRow[];
  // Lines that didn't parse. Counted, never thrown; blank lines are skipped, not counted.
  badLines: number;
  // Good lines by status, for the board's ok / retry / fail counts.
  counts: Record<RunStatus, number>;
};

// null: no such night (no `<runsDir>/<night>.jsonl`, or `night` isn't `YYYY-MM-DD`) → 404.
// An empty file is a night where nothing ran: `rows: []`, `badLines: 0`, not null.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
