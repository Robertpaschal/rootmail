// Public imports in a separate installed consumer: no repository-relative code imports.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { createSupabaseEmailHook, createPostgresHookLedger } from '@rootmail/supabase';
// Fail closed if this reference accidentally bypasses its injected fake transport.
globalThis.fetch = async () => { throw Error('Network forbidden in consumer fixture'); };
const secret = randomBytes(32);
const entries = new Map();
const ledger = createPostgresHookLedger(async (query, values) => {
  assert.match(query, /ON CONFLICT/);
  const [event, fingerprint, expires] = values;
  assert.match(event, /^[a-f0-9]{64}$/);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  if (!entries.has(event)) entries.set(event, { fingerprint, expires_at: expires });
  return [entries.get(event)];
});
const config = {
  hookSecrets: [`v1,whsec_${secret.toString('base64')}`],
  supabaseUrl: 'https://consumer.example.test', workspaceId: 'ws_consumer', clientId: 'tnt_consumer',
  rootmailUrl: 'https://api.example.test', rootmailApiKey: 'rm_live_fixture_only',
  from: 'auth@consumer.example.test', replyTo: 'support@consumer.example.test', brand: 'Consumer',
  emailChangeMode: 'secure' as const, deliveryMode: 'code_only' as const,
  credentialLifetimeSeconds: 3600, ledgerKey: randomBytes(32).toString('base64'), ledger,
};
const receipts = new Map(); let admitted = 0;
const transport: typeof fetch = async (url, init) => {
  assert.equal(init?.redirect, 'error');
  assert.equal(init?.headers?.['x-rootmail-subtenant'], 'tnt_consumer');
  if (String(url).endsWith('/capabilities')) return Response.json({ policy: 'authentication-v1',
    provider: 'ses', workspace_id: 'ws_consumer', sub_tenant_id: 'tnt_consumer' });
  assert.equal(init?.method, 'POST');
  const data = JSON.parse(String(init.body));
  assert.equal(data.policy, 'authentication-v1');
  assert.ok(!data.html.includes('fixture-hash'));
  if (!receipts.has(data.idempotency_key)) receipts.set(data.idempotency_key, {
    id: `msg_fixture_${++admitted}`, content_policy: data.policy, workspace_id: 'ws_consumer',
    sub_tenant_id: 'tnt_consumer', expires_at: data.expires_at, to: data.to, sandbox: false,
    test_recipient: null, status: 'sent', provider: 'ses', provider_message_id: `fake_${admitted}`,
  });
  return Response.json(receipts.get(data.idempotency_key));
};
const request = (action: string, id: string, valid = true) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ user: { email: 'first@example.test', new_email: 'second@example.test' },
    email_data: { email_action_type: action, token: '12345678', token_hash: 'fixture-hash',
      ...(action === 'email_change' ? { token_new: '87654321', token_hash_new: 'other-fixture-hash' } : {}) } });
  return new Request('https://hook.consumer.example.test', { method: 'POST', body, headers: {
    'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${valid ? createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64') : 'invalid'}`,
  } });
};
const hook = createSupabaseEmailHook(config, { fetch: transport });
assert.equal((await hook(request('signup', 'invalid', false))).status, 401);
assert.equal(entries.size, 0); assert.equal(admitted, 0);
for (const action of ['signup', 'magiclink', 'recovery', 'invite', 'reauthentication', 'email_change']) {
  assert.equal((await hook(request(action, `event_${action}`))).status, 200, action);
}
assert.equal(admitted, 7);
const restarted = createSupabaseEmailHook(config, { fetch: transport });
assert.equal((await restarted(request('email_change', 'event_email_change'))).status, 200);
assert.equal(admitted, 7, 'Restarted retry must retain the same recipient keys');
assert.equal(entries.size, 6);
console.log('Clean consumer install passed: public imports, six action types, two-recipient mapping, signature denial and restarted retry; synthetic delivery only.');
