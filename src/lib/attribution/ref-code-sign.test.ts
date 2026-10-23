/**
 * Signed ref-code contract (W9-fix / R3 findings 2-3, 9).
 *
 * - Only 5-part HMAC codes may yield attribution; unsigned 4-part codes are
 *   attacker-controlled and must resolve to null.
 * - The HMAC key is a domain-separated sub-key of SESSION_SECRET.
 * - `extractRefCode` never returns a token wider than the ref_code column.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeRefCode, extractRefCode, type RefCodeData } from "./ref-code";

const SECRET = "test-session-secret-0123456789";

type SignModule = typeof import("./ref-code-sign");

let cached: SignModule | undefined;

/** env is read at call time, so setting it before the dynamic import is enough. */
async function loadSignModule(): Promise<SignModule> {
  if (!cached) {
    process.env.SESSION_SECRET = SECRET;
    cached = await import("./ref-code-sign");
  }
  return cached;
}

const DATA: RefCodeData = {
  campaignId: "camp-dia-del-padre",
  adsetId: "adset-1",
  adId: "ad-1",
  timestamp: 1_760_000_000_000,
};

describe("signRefCode / verifyRefCodeSignature", () => {
  it("round-trips a signed code", async () => {
    const { signRefCode, verifyRefCodeSignature } = await loadSignModule();
    const code = signRefCode(DATA);
    assert.match(code, /^ref:[A-Za-z0-9_-]+$/);
    assert.equal(verifyRefCodeSignature(code), true);
  });

  it("emits a 5-part code that decodeRefCode marks as signed", async () => {
    const { signRefCode } = await loadSignModule();
    const decoded = decodeRefCode(signRefCode(DATA));
    assert.ok(decoded);
    assert.equal(decoded.signed, true);
    assert.equal(decoded.campaignId, DATA.campaignId);
    assert.equal(decoded.adsetId, DATA.adsetId);
    assert.equal(decoded.adId, DATA.adId);
    assert.equal(decoded.timestamp, DATA.timestamp);
  });

  it("rejects a tampered payload", async () => {
    const { signRefCode, verifyRefCodeSignature } = await loadSignModule();
    const code = signRefCode(DATA);
    const tampered = code.replace(DATA.campaignId, "camp-other");
    assert.equal(verifyRefCodeSignature(tampered), false);
  });

  it("rejects a signature produced with another secret", async () => {
    const { signRefCode, verifyRefCodeSignature } = await loadSignModule();
    const code = signRefCode(DATA);
    const previous = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "a-completely-different-secret";
    try {
      assert.equal(verifyRefCodeSignature(code), false);
    } finally {
      process.env.SESSION_SECRET = previous;
    }
  });

  it("rejects malformed / unsigned codes without throwing", async () => {
    const { verifyRefCodeSignature } = await loadSignModule();
    assert.equal(verifyRefCodeSignature(""), false);
    assert.equal(verifyRefCodeSignature("ref:camp_adset_ad_abc"), false);
    assert.equal(verifyRefCodeSignature("ref:onlyone"), false);
  });
});

describe("resolveAttributionFromRef", () => {
  it("resolves ids from a valid signed code", async () => {
    const { signRefCode, resolveAttributionFromRef } = await loadSignModule();
    const code = signRefCode(DATA);
    assert.deepEqual(resolveAttributionFromRef(code), {
      campaignId: DATA.campaignId,
      adsetId: DATA.adsetId,
      adId: DATA.adId,
    });
  });

  it("accepts a signed code without the ref: prefix", async () => {
    const { signRefCode, resolveAttributionFromRef } = await loadSignModule();
    const code = signRefCode(DATA).slice(4);
    assert.deepEqual(resolveAttributionFromRef(code), {
      campaignId: DATA.campaignId,
      adsetId: DATA.adsetId,
      adId: DATA.adId,
    });
  });

  it("drops unsigned 4-part legacy codes (attacker-controlled)", async () => {
    const { resolveAttributionFromRef } = await loadSignModule();
    assert.equal(resolveAttributionFromRef("fake_fake_fake_1"), null);
    assert.equal(resolveAttributionFromRef("ref:fake_fake_fake_1"), null);
  });

  it("returns null for signed codes with an invalid signature", async () => {
    const { signRefCode, resolveAttributionFromRef } = await loadSignModule();
    const code = signRefCode(DATA);
    const parts = code.split("_");
    parts[4] = "0".repeat(parts[4].length);
    assert.equal(resolveAttributionFromRef(parts.join("_")), null);
  });

  it("returns null for missing/garbage input", async () => {
    const { resolveAttributionFromRef } = await loadSignModule();
    assert.equal(resolveAttributionFromRef(null), null);
    assert.equal(resolveAttributionFromRef(""), null);
    assert.equal(resolveAttributionFromRef("nonsense"), null);
  });
});

describe("extractRefCode", () => {
  it("extracts a token embedded in free text", () => {
    assert.equal(extractRefCode("Hola! Vi su anuncio ref:camp_adset_ad_ts"), "camp_adset_ad_ts");
    assert.equal(extractRefCode("REF:Upper_Case_1_abc"), "Upper_Case_1_abc");
  });

  it("returns null when no ref token is present", () => {
    assert.equal(extractRefCode("Hola! Quiero un presupuesto"), null);
  });

  it("rejects an overlong token whole instead of truncating it", () => {
    assert.equal(extractRefCode(`ref:${"a".repeat(300)}`), null);
    assert.equal(extractRefCode(`ref:camp_${"a".repeat(300)}`), null);
  });

  it("accepts a token up to the ref_code column width", () => {
    const token = "a".repeat(255);
    assert.equal(extractRefCode(`ref:${token}`), token);
  });
});
