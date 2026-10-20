import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { env } from "./env";
import {
  ASSUME_ROLE_SECONDS,
  assumeRoleAvailable,
  assumeTenantRole,
  externalIdFor,
  sessionName,
  tenantPolicies,
  type AssumedCredentials,
} from "./aws-assume";

const ASSUMER = "arn:aws:iam::130299713609:role/rootmail-byo-assumer";
const prev = env.BYO_ASSUMER_ROLE_ARN;
afterEach(() => { env.BYO_ASSUMER_ROLE_ARN = prev; });

const creds = (tag: string): { Credentials: Record<string, unknown> } => ({
  Credentials: { AccessKeyId: `AK${tag}`, SecretAccessKey: `SK${tag}`, SessionToken: `ST${tag}`, Expiration: new Date(Date.now() + 900_000) },
});

describe("assume-role helpers", () => {
  it("is available only with a well-formed assumer ARN", () => {
    assert.equal(assumeRoleAvailable(undefined), false);
    assert.equal(assumeRoleAvailable(""), false);
    assert.equal(assumeRoleAvailable("rootmail-byo-assumer"), false);
    assert.equal(assumeRoleAvailable(ASSUMER), true);
  });

  it("external ID: stable per org, different across orgs, none without the key", () => {
    const k = "k".repeat(40);
    assert.equal(externalIdFor("org_a", k), externalIdFor("org_a", k));
    assert.notEqual(externalIdFor("org_a", k), externalIdFor("org_b", k));
    assert.match(externalIdFor("org_a", k)!, /^rm-[A-Za-z0-9_-]{32}$/);
    assert.equal(externalIdFor("org_a", ""), null);
  });

  it("session names fit AWS's alphabet and length", () => {
    assert.equal(sessionName("byo", "org_abc"), "byo-org_abc");
    assert.match(sessionName("rootmail", "x y/z".repeat(30)), /^[\w+=,.@-]{1,64}$/);
  });

  it("tenant policies: trust names only our assumer and requires the external ID; three SES actions", () => {
    const p = tenantPolicies("rm-x", ASSUMER);
    assert.deepEqual(p.trust.Statement[0], {
      Effect: "Allow", Principal: { AWS: ASSUMER }, Action: "sts:AssumeRole",
      Condition: { StringEquals: { "sts:ExternalId": "rm-x" } },
    });
    assert.deepEqual(p.permissions.Statement[0]!.Action, ["ses:SendEmail", "ses:GetAccount", "ses:ListEmailIdentities"]);
  });
});

describe("assumeTenantRole — the two-hop chain", () => {
  it("our role first (no tenant input), then theirs with our external ID, both 15 min", async () => {
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER;
    const calls: { using?: AssumedCredentials; input: Record<string, unknown> }[] = [];
    const out = await assumeTenantRole(
      { orgId: "org_1", roleArn: "arn:aws:iam::111122223333:role/sender", externalId: "rm-ext" },
      { stsFor: (using) => ({ send: async (cmd: { input: Record<string, unknown> }) => { calls.push({ using, input: cmd.input }); return creds(String(calls.length)); } }) as never },
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.using, undefined, "hop 1 uses the default chain (instance role)");
    assert.deepEqual(calls[0]!.input, { RoleArn: ASSUMER, RoleSessionName: "byo-org_1", DurationSeconds: ASSUME_ROLE_SECONDS });
    assert.equal(calls[1]!.using?.accessKeyId, "AK1", "hop 2 uses hop 1's session");
    assert.deepEqual(calls[1]!.input, { RoleArn: "arn:aws:iam::111122223333:role/sender", RoleSessionName: "rootmail-org_1", ExternalId: "rm-ext", DurationSeconds: ASSUME_ROLE_SECONDS });
    assert.equal(out.accessKeyId, "AK2");
    assert.equal(ASSUME_ROLE_SECONDS, 900);
  });

  it("refuses outright when the assumer isn't configured", async () => {
    env.BYO_ASSUMER_ROLE_ARN = undefined;
    await assert.rejects(assumeTenantRole({ orgId: "o", roleArn: "arn:aws:iam::111122223333:role/r", externalId: "e" }), /isn't available/);
  });

  it("our hop failing never shows the tenant our role or AWS's text", async () => {
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER;
    const err = await assumeTenantRole(
      { orgId: "o", roleArn: "arn:aws:iam::111122223333:role/r", externalId: "e" },
      { stsFor: () => ({ send: async () => { throw Object.assign(new Error(`not authorized on ${ASSUMER}`), { name: "AccessDenied" }); } }) as never },
    ).catch((e: Error) => e);
    assert.ok(err instanceof Error);
    assert.doesNotMatch(err.message, /130299713609|rootmail-byo-assumer/);
  });

  it("their trust policy refusing us: says what to check", async () => {
    env.BYO_ASSUMER_ROLE_ARN = ASSUMER;
    let n = 0;
    await assert.rejects(
      assumeTenantRole(
        { orgId: "o", roleArn: "arn:aws:iam::111122223333:role/r", externalId: "e" },
        { stsFor: () => ({ send: async () => { if (n++ === 0) return creds("1"); throw Object.assign(new Error("x"), { name: "AccessDenied" }); } }) as never },
      ),
      /trust policy/,
    );
  });
});
