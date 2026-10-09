import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// `deploy-host.sh --canary`, driven through fake docker and curl boundaries:
// real shell control flow, no host, registry, network or mail.
const script = resolve('scripts/deploy-host.sh');
const sha = `sha-${'a'.repeat(40)}`;
const prev = `sha-${'b'.repeat(40)}`;
const key = 'rm_live_SECRET_canary_key_value';
const fakeDocker = `#!/usr/bin/env node
const fs = require('fs');
let a = process.argv.slice(2), tag = '';
fs.appendFileSync('calls', JSON.stringify(a)+'\\n');
if(a[0]==='env') { tag=a.find(x=>x.startsWith('TAG=')).slice(4); a=a.slice(a.indexOf('docker')+1); }
else if(a[0]==='docker') a=a.slice(1);
const svc = a.includes('worker') ? 'worker' : 'api';
const st = (s) => fs.existsSync('state-'+s) ? fs.readFileSync('state-'+s,'utf8') : 'old';
if(a[0]==='compose') {
  const op=a.find(x=>['config','ps','up','run','down'].includes(x));
  if(op==='ps') console.log('cid-'+svc);
  if(op==='up') fs.writeFileSync('state-'+svc, tag===${JSON.stringify(sha)}?'new':'old');
  if(op==='run' && a.includes('-d')) fs.writeFileSync('canary', a[a.indexOf('--name')+1]);
} else if(a[0]==='inspect') {
  const f=a[2], s=(a[3]||'').replace('cid-','');
  if(a[1]!=='--format') process.exit(fs.existsSync('canary')?0:1);
  else if(f==='{{.Config.Image}}') console.log('pachal/rootmail-'+s+':'+${JSON.stringify(prev)});
  else if(f==='{{.Image}}') console.log(st(s)+'-image');
  else if(f==='{{.State.Status}}') console.log('running');
  else if(f==='{{.RestartCount}}') console.log('0');
  else console.log('healthy');
} else if(a[0]==='image') console.log((a[a.length-1].endsWith(${JSON.stringify(sha)})?'new':'old')+'-image');
else if(a[0]==='create') console.log('rollback-holder');
else if(a[0]==='rm' && a[1]==='-f') fs.rmSync('canary',{force:true});
else if(a[0]==='logs') {
  if(a.includes('--tail')) console.log('canary log line');
  else { console.log('rootmail worker ready'); if(process.env.SCENARIO==='worker-log-error' && st('worker')==='new') console.log('worker error: boom'); }
}
`;
const fakeCurl = `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync('curl-calls', JSON.stringify(a)+'\\n');
const out = a[a.indexOf('-o')+1], method = a[a.indexOf('-X')+1], url = a[a.length-1];
const canary = url.includes(':4100/'), S = process.env.SCENARIO;
let code = 200, body = {};
if(url.endsWith('/health')) body = { status: S==='canary-unhealthy'&&canary ? 'degraded' : 'ok', service: 'rootmail-api' };
else if(url.endsWith('/v1/auth/signup')) { code = 409; body = { error: { message: 'An account with that email already exists.' } }; }
else if(method==='POST' && url.endsWith('/v1/messages')) {
  if(S==='send-fails'&&canary) { code = 500; body = { error: { message: 'boom' } }; }
  else { code = 202; body = { id: 'msg_1', object: 'message', status: 'queued' }; }
}
else if(url.endsWith('/audit')) body = { message_id: 'msg_1', status: 'delivered', trail: [{ event: 'delivered' }] };
else body = { id: 'msg_1', status: 'delivered', provider_message_id: 'pm-1', rendered_html: '<p>x <a href="https://rootmail.io/">r</a></p>' };
fs.writeFileSync(out, JSON.stringify(body));
process.stdout.write(String(code));
`;

function run(scenario, to = 'admin@rootmail.io') {
  const dir = mkdtempSync(join(tmpdir(), 'rootmail-canary-test-'));
  writeFileSync(join(dir, '.env.prod'), '');
  writeFileSync(join(dir, 'docker-compose.prod.yml'), '');
  writeFileSync(join(dir, 'docker-compose.host.yml'), '');
  writeFileSync(join(dir, 'sudo'), fakeDocker, { mode: 0o755 });
  writeFileSync(join(dir, 'curl'), fakeCurl, { mode: 0o755 });
  writeFileSync(join(dir, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const r = spawnSync('bash', [script, '--canary'], {
    cwd: dir, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCENARIO: scenario, TAG: sha, CANARY_TO: to, CANARY_API_KEY: key, CANARY_EVENT_WAIT: '3' },
  });
  const read = (f) => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '';
  const res = { ...r, dir, docker: read('calls'), curl: read('curl-calls'), api: read('state-api') || 'old', worker: read('state-worker') || 'old', canary: existsSync(join(dir, 'canary')) };
  for (const l of ['.deploy-canary.lock', '.deploy-api.lock', '.deploy-worker.lock']) assert.equal(existsSync(join(dir, l)), false, l);
  rmSync(dir, { recursive: true, force: true });
  return res;
}

// The canary never shares a port, compose project, name or alias with prod.
function isolation(r) {
  const calls = r.docker.trim().split('\n').map(JSON.parse).filter((c) => c.includes('compose'));
  const project = (c) => (c.includes('-p') && c[c.indexOf('-p') - 1] === 'compose') ? c[c.indexOf('-p') + 1] : 'rootmail';
  const runs = calls.filter((c) => c.includes('run') && c.includes('-d'));
  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(project(run), 'rootmail-canary', 'own compose project, so its own network');
  assert.equal(run.slice(run.indexOf('compose') + 1, run.indexOf('compose') + 7).join(' '), '-p rootmail-canary --env-file .env.prod -f docker-compose.prod.yml', 'same files and env as prod');
  assert.ok(run.includes('docker-compose.host.yml'), 'host overlay (.env.api.prod) too');
  assert.match(run[run.indexOf('--name') + 1], /^rootmail-canary-api-\d+$/);
  const published = run.filter((x, i) => run[i - 1] === '-p' && x.includes(':'));
  assert.deepEqual(published, ['127.0.0.1:4100:4000'], 'only its own loopback port; never 4000 on the host');
  for (const f of ['--service-ports', '--use-aliases', '--network', '--network-alias']) assert.equal(run.includes(f), false, f);
  for (const c of calls.filter((c) => c.includes('up'))) assert.equal(project(c), 'rootmail', 'prod swaps stay in the prod project');
  for (const c of calls.filter((c) => c.includes('down'))) assert.equal(project(c), 'rootmail-canary', 'teardown only touches the canary project');
  assert.ok(calls.some((c) => c.includes('down')), 'canary network removed');
}

test('refuses any recipient outside the hard allowlist before touching docker or the network', () => {
  for (const to of ['someone@example.com', 'admin@rootmail.io.evil.test', 'nnamani.odinakarobert+x@gmail.com', '']) {
    const r = run('healthy', to);
    assert.equal(r.status, 2, to);
    assert.match(r.stderr, /Refusing to send anywhere else/);
    assert.equal(r.docker, ''); assert.equal(r.curl, '');
  }
});

test('healthy: canary on 127.0.0.1, smoke, swap api then worker, rollback printed, no secrets', () => {
  const r = run('healthy');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.api, 'new'); assert.equal(r.worker, 'new'); assert.equal(r.canary, false);
  assert.match(r.docker, /"run","-d","--no-deps","--name","rootmail-canary-api-\d+","-p","127\.0\.0\.1:4100:4000","api"/);
  assert.match(r.docker, /docker-compose\.host\.yml/);
  isolation(r);
  assert.match(r.stdout, new RegExp(`TAG=${prev} \\./scripts/deploy-host\\.sh api`));
  assert.match(r.stdout, /Inbound reply check/);
  for (const out of [r.stdout, r.stderr, r.docker, r.curl]) assert.equal(out.includes(key), false);
  for (const call of r.curl.trim().split('\n').map(JSON.parse)) {
    const data = call[call.indexOf('--data') + 1] ?? '';
    if (call.includes('--data')) assert.match(data, /"(to|email)":"admin@rootmail\.io"/);
  }
});

for (const scenario of ['canary-unhealthy', 'send-fails']) {
  test(`${scenario}: canary torn down, prod untouched, non-zero with logs`, () => {
    const r = run(scenario);
    assert.equal(r.status, 1);
    assert.equal(r.api, 'old'); assert.equal(r.worker, 'old'); assert.equal(r.canary, false);
    assert.doesNotMatch(r.docker, /force-recreate/);
    isolation(r);
    assert.match(r.stderr, /canary log line/);
  });
}

test('worker log check fails: worker rolled back automatically, api rollback printed', () => {
  const r = run('worker-log-error');
  assert.equal(r.status, 1);
  assert.equal(r.api, 'new'); assert.equal(r.worker, 'old');
  assert.match(r.stderr, new RegExp(`Rolling the worker back to ${prev}`));
  assert.doesNotMatch(r.stderr, /URGENT/);
  assert.match(r.stderr, new RegExp(`TAG=${prev} \\./scripts/deploy-host\\.sh api`));
});
