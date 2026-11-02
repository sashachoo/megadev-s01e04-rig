import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

// Plan morning-digest § 1. Reads runs/<night>.jsonl; never writes there (runs/ is read-only).

// One line that parsed. `t` orders lines; `at` is what gets shown.
type RunLine = { at: string; t: number; job: string; status: RunStatus; owner: string | null; error: string | null };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 with an offset. Without one a time can't be ordered or shown as logged.
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function isOptionalText(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === 'string';
}

// Missing and blank are the same thing to a reader: null, rendered as `—`.
function textOrNull(v: string | null | undefined): string | null {
  return v?.trim() ? v : null;
}

// The edge: a line is either a well-formed RunLine or null (counted as bad by the caller).
function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || !AT.test(o.at)) return null;
  const t = Date.parse(o.at);
  if (Number.isNaN(t)) return null;
  if (typeof o.job !== 'string' || o.job.trim() === '') return null;
  if (!isStatus(o.status)) return null;
  if (!isOptionalText(o.owner) || !isOptionalText(o.error)) return null;
  return { at: o.at, t, job: o.job, status: o.status, owner: textOrNull(o.owner), error: textOrNull(o.error) };
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  // By instant, not by string: offsets differ across a clock change. Stable, so ties keep file order.
  const ordered = [...lines].sort((a, b) => a.t - b.t);
  let owner: string | null = null;
  let lastError: string | null = null;
  for (const l of ordered) {
    owner = l.owner ?? owner;
    lastError = l.error ?? lastError;
  }
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    job,
    owner,
    runs: ordered.length,
    retries: ordered.filter((l) => l.status === 'retry').length,
    fails: ordered.filter((l) => l.status === 'fail').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

function digest(night: string, text: string): NightDigest {
  const byJob = new Map<string, RunLine[]>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }
  const rows = [...byJob].map(([job, lines]) => toRow(job, lines)).sort((a, b) => (a.job < b.job ? -1 : 1));
  return { night, rows, badLines, counts };
}

export const readNight: ReadNight = (runsDir, night) => {
  // `night` comes from a URL: anything but YYYY-MM-DD is no such night, never a path.
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
  return digest(night, text);
};
