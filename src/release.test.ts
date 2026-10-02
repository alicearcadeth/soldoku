import { expect, it } from 'vitest';
import worker from './worker';

it('serves the release manifest from the current Worker asset binding without caching', async () => {
  let assetPath = '';
  const response = await worker.fetch(new Request('https://soldoku.com/api/release'), {
    DB: { prepare() { throw new Error('Release lookup should not use the database'); } },
    ASSETS: { async fetch(request: Request) {
      assetPath = new URL(request.url).pathname;
      return Response.json({ commit: 'current', dirty: false, assets: {} });
    } },
  });
  expect(response.status).toBe(200);
  expect(assetPath).toBe('/release.json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ commit: 'current', dirty: false, assets: {} });
});
