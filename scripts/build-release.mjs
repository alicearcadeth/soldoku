import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? files(join(directory, entry.name), `${path}/`) : [path];
  });
}
const assets = Object.fromEntries(files('dist').filter(path => !['release.json', '_headers', '_redirects'].includes(path)).sort()
  .map(path => [`/${path}`, sha256(readFileSync(join('dist', path)))]));
const release = {
  commit: git('rev-parse', 'HEAD'),
  dirty: Boolean(git('status', '--porcelain', '--untracked-files=normal')),
  assets,
};
writeFileSync('dist/release.json', `${JSON.stringify(release, null, 2)}\n`);
console.log(`Release ${release.commit}${release.dirty ? ' (uncommitted changes)' : ' (clean)'}`);
