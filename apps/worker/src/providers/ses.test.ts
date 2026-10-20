import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "@rootmail/core";
import { sesConfigurationSetFor } from "./ses";

describe("sesConfigurationSetFor", () => {
  it("our account: unchanged — per-message set, else SES_CONFIGURATION_SET", () => {
    const prev = env.SES_CONFIGURATION_SET;
    env.SES_CONFIGURATION_SET = "rootmail-events";
    try {
      assert.equal(sesConfigurationSetFor({ configurationSet: "dedicated-1" }, undefined), "dedicated-1");
      assert.equal(sesConfigurationSetFor({ configurationSet: null }, undefined), "rootmail-events");
      assert.equal(sesConfigurationSetFor({}, undefined), "rootmail-events");
    } finally {
      env.SES_CONFIGURATION_SET = prev;
    }
  });
  it("a tenant's account: never ours — only theirs, or none", () => {
    const prev = env.SES_CONFIGURATION_SET;
    env.SES_CONFIGURATION_SET = "rootmail-events";
    try {
      const creds = { accessKeyId: "a", secretAccessKey: "b" };
      assert.equal(sesConfigurationSetFor({ configurationSet: "dedicated-1" }, creds), undefined);
      assert.equal(sesConfigurationSetFor({}, creds), undefined);
      assert.equal(sesConfigurationSetFor({ configurationSet: "dedicated-1" }, { ...creds, configurationSet: "theirs" }), "theirs");
    } finally {
      env.SES_CONFIGURATION_SET = prev;
    }
  });
});
