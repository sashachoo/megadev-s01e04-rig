import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

it('api digest returns readNight rows in order; 404 for a missing night', async () => {
  const res = await createApp(config).request('/api/digest/2026-10-28');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(readNight('runs', '2026-10-28'));
  const miss = await createApp(config).request('/api/digest/2020-01-01');
  expect(miss.status).toBe(404);
  expect(await miss.json()).toEqual({ error: 'no run log', night: '2020-01-01' });
});
