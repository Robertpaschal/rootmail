// Local-only acceptance test for the pruned API/worker images, PostgreSQL 18
// and Valkey 7.2. No real secrets, production endpoints or mail provider allowed.
// Prerequisites: rootmail-postgres18-compat-check on 5492 and
// rootmail-valkey-compat-check on 6392; image tags rootmail-{api,worker}:infra-test.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const maildir = mkdtempSync(join(tmpdir(), 'rootmail-runtime-mail-'));
// Disposable mock mail only; Linux runner uid differs from container uid 1000.
chmodSync(maildir, 0o777);
const fixtureEnv = {
  NODE_ENV: 'test', MAIL_PROVIDER: 'mock', DNS_VERIFY_MODE: 'mock',
  DATABASE_URL: 'postgres://rootmail:rootmail@host.docker.internal:5492/rootmail',
  REDIS_URL: 'redis://host.docker.internal:6392', MAILDIR: '/tmp/mock-mail',
  LOG_LEVEL: 'silent',
};
const envArgs = ['--add-host=host.docker.internal:host-gateway',
  ...Object.entries(fixtureEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`])];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 });
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
for (const [name, expected] of [
  ['rootmail-postgres18-compat-check', 'postgres:18-alpine'],
  ['rootmail-valkey-compat-check', 'valkey/valkey:7.2-alpine'],
]) assert.equal(docker('inspect', '--format', '{{.Config.Image}}', name).trim(), expected);
for (let i = 0; i < 40; i++) {
  try { docker('exec', 'rootmail-postgres18-compat-check', 'pg_isready', '-U', 'rootmail'); break; }
  catch (error) { if (i === 39) throw error; await pause(); }
}

const created = [];
try {
  docker('run', '--rm', ...envArgs, 'rootmail-api:infra-test', 'pnpm', 'db:migrate');
  const seed = docker('run', '--rm', ...envArgs, 'rootmail-api:infra-test', 'pnpm', 'db:seed');
  const key = seed.match(/rm_live_[A-Za-z0-9_-]+/)?.[0];
  const testKey = seed.match(/rm_test_[A-Za-z0-9_-]+/)?.[0];
  assert.ok(key && testKey, 'Fixture keys exist (never print their values)');
  for (const svc of ['api', 'worker']) {
    const name = `rootmail-runtime-${svc}-check-${process.pid}`;
    docker('run', '-d', '--init', '--name', name, ...envArgs,
      '-v', `${maildir}:/tmp/mock-mail`,
      ...(svc === 'api' ? ['-p', '127.0.0.1:4092:4000'] : []),
      `rootmail-${svc}:infra-test`);
    created.push(name);
  }
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const health = await fetch('http://127.0.0.1:4092/health').then(r => r.json());
      const worker = JSON.parse(docker('exec', created[1], 'cat', '/tmp/rootmail-worker-health.json'));
      if (health.status === 'ok' && worker.ready) { ready = true; break; }
    } catch { /* bounded startup wait */ }
    await pause();
  }
  assert.ok(ready, 'API dependency health and worker readiness');
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/smoke.ts'], {
    stdio: 'inherit', timeout: 120000,
    env: { ...process.env, NODE_ENV: 'test', MAIL_PROVIDER: 'mock', DNS_VERIFY_MODE: 'mock',
      ROOTMAIL_API_KEY: key, ROOTMAIL_TEST_API_KEY: testKey,
      ROOTMAIL_BASE_URL: 'http://127.0.0.1:4092', MAILDIR: maildir },
  });
  for (const name of created) assert.equal(docker('inspect', '--format', '{{.RestartCount}}', name).trim(), '0');
  console.log('ARM runtime images + PostgreSQL 18 + Valkey 7.2 passed.');
} finally {
  // Only test containers created above; retain fixtures/mock files for diagnosis.
  for (const name of created) {
    docker('stop', '-t', '30', name);
    docker('rm', name);
  }
}
