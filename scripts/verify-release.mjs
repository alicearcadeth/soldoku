import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = process.env.QA_ORIGIN ?? 'https://soldoku.com/';
const local = JSON.parse(readFileSync('dist/release.json', 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(local.dirty, false, 'Build includes uncommitted changes');
assert.equal(local.commit, head, 'Build was made from an older commit');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Local code changed since the build');
const remote = execFileSync('gh', ['api', 'repos/alicearcadeth/soldoku/commits/main', '--jq', '.sha'], { encoding: 'utf8' }).trim();
assert.equal(remote, head, 'GitHub main does not match local HEAD');
const response = await fetch(new URL('/api/release', origin), { cache: 'no-store' });
assert.equal(response.status, 200, 'Live Worker release endpoint unavailable');
assert.match(response.headers.get('content-type') ?? '', /json/, 'Worker returned an old HTML shell');
assert.deepEqual(await response.json(), local, 'Live Worker/build differs from local release');
for (const [path, expected] of Object.entries(local.assets)) {
  const response = await fetch(new URL(path, origin), { cache: 'no-store' });
  assert.equal(response.status, 200, `Missing live file: ${path}`);
  const live = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  const disk = createHash('sha256').update(readFileSync(`dist${path}`)).digest('hex');
  assert.equal(disk, expected, `Local file changed after build: ${path}`);
  assert.equal(live, expected, `Outdated live file: ${path}`);
}
console.log(`PASS: local, GitHub main, Worker and ${Object.keys(local.assets).length} live files match ${head} at ${origin}`);
