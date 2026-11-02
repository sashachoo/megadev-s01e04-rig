import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

it('digest page renders a night', async () => {
  const res = await createApp(config).request('/digest/2026-10-28');
  const html = await res.text();
  expect(res.status).toBe(200);
  expect(html).toContain('digest · 2026-10-28');
  expect(html).toContain('fixtures/refresh');
});
