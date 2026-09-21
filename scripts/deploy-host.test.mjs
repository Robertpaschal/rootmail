import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/deploy-host.sh');
const sha = `sha-${'a'.repeat(40)}`;
// A fake Docker boundary exercises real shell control flow without touching a host.
const fakeDocker = `#!/usr/bin/env node
const fs = require('fs');
let a = process.argv.slice(2), tag = '';
fs.appendFileSync('calls', JSON.stringify(a)+'\\n');
if(a[0]==='env') { tag=a.find(x=>x.startsWith('TAG=')).slice(4); a=a.slice(a.indexOf('docker')+1); }
else if(a[0]==='docker') a=a.slice(1);
const state=fs.existsSync('state')?fs.readFileSync('state','utf8'):'old';
if(a[0]==='compose') {
  const op=a.find(x=>['config','ps','up','run'].includes(x));
  if(op==='ps') console.log('cid');
  if(op==='up') { fs.writeFileSync('state', tag.startsWith('rollback')?'old':'new'); }
} else if(a[0]==='pull' && process.env.SCENARIO==='pull-fails') process.exit(1);
else if(a[0]==='inspect') {
  const f=a[2];
  if(f==='{{.Image}}') console.log(state+'-image');
  else if(f==='{{.State.Status}}') console.log('running');
  else if(f==='{{.RestartCount}}') console.log('0');
  else console.log(process.env.SCENARIO==='unhealthy' && state==='new'?'unhealthy':'healthy');
} else if(a[0]==='image') console.log('new-image');
else if(a[0]==='create') console.log('rollback-holder');
`;

for (const overlay of [false, true]) {
for (const scenario of ['healthy', 'pull-fails', 'unhealthy', 'invalid-tag']) {
  test(`deployment ${scenario}, host overlay=${overlay}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'rootmail-deploy-test-'));
    try {
      writeFileSync(join(dir, '.env.prod'), '');
      writeFileSync(join(dir, 'docker-compose.prod.yml'), '');
      if (overlay) writeFileSync(join(dir, 'docker-compose.host.yml'), '');
      writeFileSync(join(dir, 'sudo'), fakeDocker, { mode: 0o755 });
      writeFileSync(join(dir, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const result = spawnSync('bash', [script, 'api'], {
        cwd: dir, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCENARIO: scenario,
          TAG: scenario === 'invalid-tag' ? 'latest' : sha },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, scenario === 'healthy' ? 0 : scenario === 'invalid-tag' ? 2 : 1, result.stderr);
      assert.equal(existsSync(join(dir, '.deploy-api.lock')), false);
      const state = existsSync(join(dir, 'state')) ? readFileSync(join(dir, 'state'), 'utf8') : 'old';
      assert.equal(state, scenario === 'healthy' ? 'new' : 'old');
      if (scenario === 'unhealthy') assert.match(result.stderr, /Previous image restored and healthy/);
      if (scenario === 'pull-fails') assert.doesNotMatch(readFileSync(join(dir, 'calls'), 'utf8'), /force-recreate/);
      if (scenario !== 'invalid-tag') {
        const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n').map(JSON.parse);
        for (const call of calls.filter(args => args.includes('compose'))) {
          assert.equal(call.includes('docker-compose.host.yml'), overlay);
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
}
