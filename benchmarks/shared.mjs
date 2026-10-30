import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpus, platform, arch, release } from 'node:os';
export async function sourceHash() {
  const hash = createHash('sha256');
  async function visit(dir) {
    for (const name of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${name.name}`;
      if (name.isDirectory()) await visit(path);
      else { hash.update(path); hash.update(await readFile(path)); }
    }
  }
  await visit('src'); return hash.digest('hex');
}
export async function environment() {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  return { date: new Date().toISOString(), node: process.version, v8: process.versions.v8, os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, sourceSHA256: await sourceHash(), versions: pkg.devDependencies };
}
export const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
