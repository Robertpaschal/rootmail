import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { after, describe, it } from "node:test";
import { closeQueues, closeRedis, env, signProof, verifyProof } from "@rootmail/core";
import { closeDb } from "@rootmail/db";
import { buildServer } from "./server";

// The API must refuse to start in production without its own proof key, and
// must start normally with one. Nothing here listens on a port or calls AWS.
const previous = { nodeEnv: env.NODE_ENV, key: env.PROOF_SIGNING_KEY };
const DEV_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIFN412AGmRRBVx+saStk5pIP4UrwMaKQYeFJh63Dr2jE
-----END PRIVATE KEY-----
`;

after(async () => {
  env.NODE_ENV = previous.nodeEnv;
  env.PROOF_SIGNING_KEY = previous.key;
  await closeQueues();
  await closeRedis();
  await closeDb();
});

describe("API startup — proof signing key", () => {
  it("refuses to build the server in production with no key, a bad key or the dev key", async () => {
    env.NODE_ENV = "production";
    try {
      for (const key of [undefined, "oops", DEV_PEM]) {
        env.PROOF_SIGNING_KEY = key;
        await assert.rejects(buildServer(), (err: Error) => {
          assert.equal(err.name, "ProofKeyError");
          assert.ok(!key || !err.message.includes(key.trim()), "never prints the value");
          return true;
        });
      }
    } finally {
      env.NODE_ENV = previous.nodeEnv;
      env.PROOF_SIGNING_KEY = previous.key;
    }
  });

  it("starts in production with a real Ed25519 PKCS8 PEM and signs with it", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    env.NODE_ENV = "production";
    env.PROOF_SIGNING_KEY = privateKey;
    try {
      const app = await buildServer();
      await app.close();
      const signed = signProof({ hello: "world" });
      assert.equal(signed.public_key, publicKey, "proofs are signed with the configured key");
      assert.ok(verifyProof({ hello: "world" }, signed.signature));
    } finally {
      env.NODE_ENV = previous.nodeEnv;
      env.PROOF_SIGNING_KEY = previous.key;
    }
  });

  it("still starts in dev/test with no key", async () => {
    env.PROOF_SIGNING_KEY = undefined;
    const app = await buildServer();
    await app.close();
  });
});
