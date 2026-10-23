/**
 * Meta / WhatsApp Cloud API signature verification (A-18).
 *
 * Contract: verification is fail-closed (missing secret, missing/malformed
 * header, wrong prefix/length all return false), runs over the exact raw body,
 * and compares digests with `timingSafeEqual` so a caller cannot learn the
 * expected value from timing.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  computeWhatsAppSignature,
  verifyWhatsAppSignature,
  WHATSAPP_SIGNATURE_PREFIX,
} from "./signature";

const SECRET = "fixture-app-secret";
const BODY = '{"object":"whatsapp_business_account","entry":[]}';

function digestFor(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("computeWhatsAppSignature", () => {
  it("emits the sha256= HMAC of the raw body", () => {
    assert.equal(
      computeWhatsAppSignature(SECRET, BODY),
      `${WHATSAPP_SIGNATURE_PREFIX}${digestFor(BODY)}`
    );
  });
});

describe("verifyWhatsAppSignature — happy path", () => {
  it("accepts a correctly signed body", () => {
    assert.equal(
      verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: computeWhatsAppSignature(SECRET, BODY) }),
      true
    );
  });

  it("accepts an uppercase hex digest (case-insensitive per the pattern)", () => {
    const header = `${WHATSAPP_SIGNATURE_PREFIX}${digestFor(BODY).toUpperCase()}`;
    assert.equal(verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header }), true);
  });
});

describe("verifyWhatsAppSignature — fail closed", () => {
  it("rejects an empty app secret even with a matching digest", () => {
    assert.equal(
      verifyWhatsAppSignature({ appSecret: "", rawBody: BODY, header: `sha256=${digestFor(BODY, "")}` }),
      false
    );
  });

  it("rejects a missing header", () => {
    assert.equal(verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: "" }), false);
  });

  it("rejects a header without the sha256= prefix", () => {
    assert.equal(
      verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: digestFor(BODY) }),
      false
    );
  });

  it("rejects a wrong-length digest", () => {
    assert.equal(
      verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: "sha256=abc123" }),
      false
    );
  });

  it("rejects non-hex characters of the right length", () => {
    assert.equal(
      verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: `sha256=${"z".repeat(64)}` }),
      false
    );
  });

  it("rejects a signature computed with another secret", () => {
    assert.equal(
      verifyWhatsAppSignature({
        appSecret: SECRET,
        rawBody: BODY,
        header: computeWhatsAppSignature("other-secret", BODY),
      }),
      false
    );
  });

  it("rejects a signature for a different body (raw bytes are load-bearing)", () => {
    assert.equal(
      verifyWhatsAppSignature({
        appSecret: SECRET,
        rawBody: `${BODY} `,
        header: computeWhatsAppSignature(SECRET, BODY),
      }),
      false
    );
  });

  it("rejects a bare prefix and a truncated digest without throwing", () => {
    assert.equal(verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: "sha256=" }), false);
    assert.equal(
      verifyWhatsAppSignature({ appSecret: SECRET, rawBody: BODY, header: `sha256=${digestFor(BODY).slice(0, 63)}` }),
      false
    );
  });
});
