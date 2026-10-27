#!/usr/bin/env node
// Clean consumer install; synthetic mail only, never reads Rootmail .env.
import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), 'rootmail-supabase-consumer-'));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: directory, stdio: 'inherit',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' } });
  if (result.error || result.status !== 0) throw new Error('Consumer acceptance failed');
};
try {
  await mkdir(join(directory, 'vendor/supabase'), { recursive: true });
  // Copy only installable source/metadata, never local credentials or build state.
  for (const path of ['package.json', 'src']) {
    await cp(join(root, 'packages/supabase', path), join(directory, 'vendor/supabase', path), { recursive: true });
  }
  const tsx = JSON.parse(await readFile(join(root, 'node_modules/tsx/package.json'), 'utf8')).version;
  const { packageManager } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module',
    packageManager, dependencies: { '@rootmail/supabase': 'file:./vendor/supabase', tsx } }));
  await cp(join(root, 'scripts/fixtures/supabase-consumer/acceptance.ts'), join(directory, 'acceptance.ts'));
  run('pnpm', ['install', '--prefer-offline', '--ignore-scripts']);
  run(process.execPath, ['--import', 'tsx', 'acceptance.ts']);
} finally { await rm(directory, { recursive: true, force: true }); }
