import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

// Route tests for #2 (GET /digest/:night) and #3 (GET /api/digest/:night).
// Nights are written into a temp runs dir; runs/ is never touched.

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const at = (m: number) => `2026-10-29T01:${String(m).padStart(2, '0')}:00+01:00`;

const NIGHT = '2026-10-29';
const EMPTY = '2026-10-30';
const MISSING = '2026-10-31';
const BAD = '2026-10-28';

// Written in non-sorted job order on purpose: the routes must sort, not echo the file.
const NIGHT_LINES = [
  line({ at: at(0), job: 'zeta/last', status: 'retry', owner: 'rook', error: 'upstream 503' }),
  line({ at: at(1), job: 'zeta/last', status: 'retry', owner: 'rook' }),
  line({ at: at(2), job: 'zeta/last', status: 'retry', owner: 'rook' }),
  line({ at: at(3), job: 'zeta/last', status: 'ok', owner: 'rook' }),
  line({ at: at(4), job: 'alpha/first', status: 'ok', owner: null }),
  line({ at: at(5), job: 'mid/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' }),
  line({ at: at(6), job: 'beta/quiet', status: 'ok', owner: 'rook' }),
].join('\n');

describe('digest routes', () => {
  let dir: string;
  let runsDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    runsDir = join(dir, 'runs');
    mkdirSync(runsDir);
    writeFileSync(join(runsDir, `${NIGHT}.jsonl`), NIGHT_LINES + '\n');
    writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
    writeFileSync(join(runsDir, `${BAD}.jsonl`), [line({ at: at(0), job: 'lane/sync', status: 'ok', owner: 'rook' }), 'not json'].join('\n') + '\n');
    app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // The <tr> that holds a job's name in the page.
  const rowOf = (html: string, job: string) => {
    const i = html.indexOf(job);
    if (i < 0) throw new Error(`job ${job} not in page`);
    return html.slice(html.lastIndexOf('<tr', i), html.indexOf('</tr>', i));
  };

  describe('GET /digest/:night (page)', () => {
    it('200 for a night with a file, titled with the night', async () => {
      const res = await app.request(`/digest/${NIGHT}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain(`digest · ${NIGHT}`);
      for (const job of ['alpha/first', 'beta/quiet', 'mid/backup', 'zeta/last']) expect(html).toContain(job);
    });

    it('404 for a night with no file, saying so', async () => {
      const res = await app.request(`/digest/${MISSING}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain(`no run log for ${MISSING}`);
    });

    it('200 for the empty night, saying nothing ran', async () => {
      const res = await app.request(`/digest/${EMPTY}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('nothing ran');
    });

    it('marks a row warn when retries >= 3 or fails > 0, and not otherwise', async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      expect(rowOf(html, 'zeta/last')).toContain('class="warn"');
      expect(rowOf(html, 'mid/backup')).toContain('class="warn"');
      expect(rowOf(html, 'beta/quiet')).not.toContain('class="warn"');
      expect(rowOf(html, 'alpha/first')).not.toContain('class="warn"');
    });

    it('renders a null owner as an em dash', async () => {
      const html = await (await app.request(`/digest/${NIGHT}`)).text();
      expect(rowOf(html, 'alpha/first')).toContain('—');
    });

    it('says how many lines did not parse when there is a bad line', async () => {
      const html = await (await app.request(`/digest/${BAD}`)).text();
      // the page escapes the apostrophe (&#39;), as hono/jsx escapes all text
      expect(html).toMatch(/line\(s\) didn(?:'|&#39;)t parse/);
    });
  });

  describe('GET /api/digest/:night (JSON)', () => {
    it('200 with the NightDigest from readNight', async () => {
      const res = await app.request(`/api/digest/${NIGHT}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(readNight(runsDir, NIGHT));
    });

    it('404 with the error body for a night with no file', async () => {
      const res = await app.request(`/api/digest/${MISSING}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
    });

    it('200 for the empty night: no rows, no bad lines, zero counts', async () => {
      const res = await app.request(`/api/digest/${EMPTY}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        night: EMPTY, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
      });
    });

    it('reports a bad line in badLines and still returns the good rows', async () => {
      const res = await app.request(`/api/digest/${BAD}`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.badLines).toBe(1);
      expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['lane/sync']);
    });

    it('sorts rows by job, whatever the file order', async () => {
      const body = await (await app.request(`/api/digest/${NIGHT}`)).json();
      expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['alpha/first', 'beta/quiet', 'mid/backup', 'zeta/last']);
    });
  });

  it('page and JSON list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const json = await (await app.request(`/api/digest/${NIGHT}`)).json();
    const jobs: string[] = json.rows.map((r: { job: string }) => r.job);
    const pageOrder = jobs
      .map((job) => [html.indexOf(job), job] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, job]) => job);
    expect(jobs.length).toBe(4);
    expect(pageOrder).toEqual(jobs);
  });
});
