import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe('readNight on runs/', () => {
  it('reads 2026-10-28 into 5 job rows, sorted by job, with 1 bad line', () => {
    const d = readNight('runs', '2026-10-28');
    expect(d).not.toBeNull();
    expect(d?.night).toBe('2026-10-28');
    expect(d?.badLines).toBe(1);
    expect(d?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(d?.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, fails: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, fails: 0, lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, fails: 1, lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, fails: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('reads 2026-10-27 clean', () => {
    const d = readNight('runs', '2026-10-27');
    expect(d?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(d?.badLines).toBe(0);
    expect(d?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  let runsDir: string;
  const night = (name: string, text: string) => writeFileSync(join(runsDir, `${name}.jsonl`), text);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    runsDir = join(dir, 'runs');
    mkdirSync(runsDir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(runsDir, '2026-10-30')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, without reading outside runsDir', () => {
    writeFileSync(join(dir, 'outside.jsonl'), line({ at: '2026-10-29T01:00:00+01:00', job: 'x', status: 'ok', owner: 'rook' }));
    expect(readNight(runsDir, '../outside')).toBeNull();
    expect(readNight(runsDir, '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran, not as a missing night', () => {
    night('2026-10-30', '');
    expect(readNight(runsDir, '2026-10-30')).toEqual({
      night: '2026-10-30', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines that do not parse, never throws, and skips blank lines', () => {
    const good = line({ at: '2026-10-29T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' });
    night('2026-10-30', [
      good,
      '',
      'not json',
      '[1,2]',
      'null',
      line({ at: '2026-10-29T01:00:00+01:00', status: 'ok', owner: 'rook' }), // no job
      line({ at: '2026-10-29T01:00:00+01:00', job: '', status: 'ok', owner: 'rook' }), // empty job
      line({ at: '2026-10-29T01:00:00+01:00', job: 'x', status: 'skipped', owner: 'rook' }), // unknown status
      line({ at: '2026-10-29T01:00:00', job: 'x', status: 'ok', owner: 'rook' }), // no offset
      line({ at: 'yesterday', job: 'x', status: 'ok', owner: 'rook' }), // not a time
      line({ at: '2026-10-29T01:00:00+01:00', job: 'x', status: 'ok', owner: 7 }), // owner not a string
      line({ at: '2026-10-29T01:00:00+01:00', job: 'x', status: 'fail', owner: 'rook', error: 503 }), // error not a string
      '   ',
      '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy',
    ].join('\r\n') + '\r\n');
    const d = readNight(runsDir, '2026-10-30');
    expect(d?.badLines).toBe(11);
    expect(d?.rows).toHaveLength(1);
    expect(d?.rows[0]?.job).toBe('lane/sync');
    expect(d?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('a file of only bad lines still reads: no rows, every line counted', () => {
    night('2026-10-30', 'oops\n{"half":\n');
    expect(readNight(runsDir, '2026-10-30')).toEqual({
      night: '2026-10-30', rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps a row whose owner is null, missing or blank, as owner null', () => {
    night('2026-10-30', [
      line({ at: '2026-10-29T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
      line({ at: '2026-10-29T01:00:00+01:00', job: 'b', status: 'ok' }),
      line({ at: '2026-10-29T01:00:00+01:00', job: 'c', status: 'ok', owner: '  ' }),
    ].join('\n'));
    const d = readNight(runsDir, '2026-10-30');
    expect(d?.rows.map((r) => [r.job, r.owner])).toEqual([['a', null], ['b', null], ['c', null]]);
    expect(d?.badLines).toBe(0);
  });

  it('takes the latest non-null owner and the latest error', () => {
    night('2026-10-30', [
      line({ at: '2026-10-29T01:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'first' }),
      line({ at: '2026-10-29T01:01:00+01:00', job: 'a', status: 'retry', owner: 'lane-07', error: 'second' }),
      line({ at: '2026-10-29T01:02:00+01:00', job: 'a', status: 'ok', owner: null }),
    ].join('\n'));
    const [row] = readNight(runsDir, '2026-10-30')?.rows ?? [];
    expect(row).toMatchObject({ owner: 'lane-07', lastError: 'second', lastStatus: 'ok', runs: 3, retries: 2 });
  });

  it('orders a job by instant, not by file order or string, and keeps each time as logged', () => {
    // 25 Oct 2026, clocks go back: 02:10+01:00 (01:10Z) is after 02:30+02:00 (00:30Z).
    night('2026-10-24', [
      line({ at: '2026-10-25T02:10:00+01:00', job: 'a', status: 'fail', owner: 'rook', error: 'late' }),
      line({ at: '2026-10-25T02:30:00+02:00', job: 'a', status: 'ok', owner: 'rook' }),
      line({ at: '2026-10-24T23:59:00Z', job: 'a', status: 'retry', owner: 'rook', error: 'early' }),
    ].join('\n'));
    const [row] = readNight(runsDir, '2026-10-24')?.rows ?? [];
    expect(row).toMatchObject({
      firstAt: '2026-10-24T23:59:00Z',
      lastAt: '2026-10-25T02:10:00+01:00',
      lastStatus: 'fail',
      lastError: 'late',
      runs: 3, retries: 1, fails: 1,
    });
  });
});
