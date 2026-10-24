/**
 * Runtime resolution checks for src/lib/ai/config.ts — DB-stored credential
 * precedence, endpoint resolution (stored value / env / catalog default) and
 * the catalog-vs-custom provider split.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after env setup */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SECRET_ENCRYPTION_KEY ??= "config-test-secret";

const { encryptSecret } = require("@/lib/crypto/secret-box") as typeof import("@/lib/crypto/secret-box");
const { resolveRuntimeFromConfig } = require("@/lib/ai/config") as typeof import("@/lib/ai/config");

function row(overrides: Partial<Parameters<typeof resolveRuntimeFromConfig>[0]> = {}) {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: null,
    enabledTools: [],
    providerKeyEnc: null,
    providerEndpointUrl: null,
    ...overrides,
  };
}

describe("resolveRuntimeFromConfig — credentials", () => {
  it("DB-stored providerKeyEnc wins over env", () => {
    const res = resolveRuntimeFromConfig(
      row({ providerKeyEnc: encryptSecret("db-key") }),
      { AGENT_AI_OPENAI_API_KEY: "env-key", AGENT_AI_API_KEY: "generic-env-key" },
    );
    assert.equal(res.configured, true);
    if (res.configured) assert.equal(res.runtime.apiKey, "db-key");
  });

  it("falls back to provider env, then generic env, when no DB key", () => {
    const res = resolveRuntimeFromConfig(
      row(),
      { AGENT_AI_OPENAI_API_KEY: "env-key", AGENT_AI_API_KEY: "generic-env-key" },
    );
    assert.equal(res.configured, true);
    if (res.configured) assert.equal(res.runtime.apiKey, "env-key");

    const generic = resolveRuntimeFromConfig(row(), { AGENT_AI_API_KEY: "generic-env-key" });
    if (generic.configured) assert.equal(generic.runtime.apiKey, "generic-env-key");
  });

  it("undecryptable providerKeyEnc reads as missing (no throw)", () => {
    const res = resolveRuntimeFromConfig(
      row({ providerKeyEnc: "not-an-encrypted-value" }),
      { AGENT_AI_API_KEY: "fallback" },
    );
    // Plaintext passthrough keeps legacy unencrypted rows working.
    assert.equal(res.configured, true);
    if (res.configured) assert.equal(res.runtime.apiKey, "not-an-encrypted-value");

    // A blob matching the encrypted format that fails decryption → missing.
    const corrupted = resolveRuntimeFromConfig(
      row({
        providerKeyEnc: `${"aa".repeat(16)}:${"bb".repeat(12)}:${"cc".repeat(16)}:${"dd".repeat(8)}`,
      }),
      { AGENT_AI_API_KEY: "fallback" },
    );
    if (corrupted.configured) assert.equal(corrupted.runtime.apiKey, "fallback");
  });
});

describe("resolveRuntimeFromConfig — endpoint", () => {
  it("catalog provider defaults to defaultBaseUrl + /chat/completions", () => {
    const res = resolveRuntimeFromConfig(
      row({ provider: "deepseek", providerKeyEnc: encryptSecret("k") }),
      {},
    );
    assert.equal(res.configured, true);
    if (res.configured) {
      assert.equal(res.runtime.endpointUrl, "https://api.deepseek.com/chat/completions");
    }
  });

  it("google resolves through its OpenAI-compatible chat base", () => {
    const res = resolveRuntimeFromConfig(
      row({ provider: "google", providerEndpointUrl: "https://generativelanguage.googleapis.com", providerKeyEnc: encryptSecret("k") }),
      {},
    );
    assert.equal(res.configured, true);
    if (res.configured) {
      assert.equal(
        res.runtime.endpointUrl,
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
    }
  });

  it("stored providerEndpointUrl wins over env; base gets path appended", () => {
    const res = resolveRuntimeFromConfig(
      row({ providerEndpointUrl: "https://custom.example.com/v2", providerKeyEnc: encryptSecret("k") }),
      { AGENT_AI_ENDPOINT_URL: "https://env.example.com/v1/chat/completions" },
    );
    assert.equal(res.configured, true);
    if (res.configured) {
      assert.equal(res.runtime.endpointUrl, "https://custom.example.com/v2/chat/completions");
    }
  });

  it("a stored full endpoint URL is used verbatim", () => {
    const res = resolveRuntimeFromConfig(
      row({ providerEndpointUrl: "https://x.example/v1/chat/completions", providerKeyEnc: encryptSecret("k") }),
      {},
    );
    if (res.configured) {
      assert.equal(res.runtime.endpointUrl, "https://x.example/v1/chat/completions");
    }
  });

  it("custom (non-catalog) provider still requires an explicit endpoint", () => {
    const res = resolveRuntimeFromConfig(
      row({ provider: "chat-completions", providerKeyEnc: encryptSecret("k") }),
      {},
    );
    assert.equal(res.configured, false);
    if (!res.configured) assert.ok(res.missing.includes("endpoint"));
  });
});
