import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { legacyParamsToPayload } from "./wizard-legacy-params";
import { draftOrderDataSchema } from "@/lib/validators";

const SIZE_A = "11111111-1111-4111-8111-111111111111";
const SIZE_B = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const FABRIC = "44444444-4444-4444-8444-444444444444";
const SESSION = "55555555-5555-4555-8555-555555555555";

describe("legacyParamsToPayload", () => {
  it("seeds contact, product, options and quantities from a legacy URL", () => {
    const payload = legacyParamsToPayload({
      type: "returning",
      name: "Ana",
      email: "ana@club.ar",
      phone: "3704",
      org: "Club X",
      notes: "urgente",
      productId: PRODUCT,
      fabricId: FABRIC,
      methodIds: "m1,m2",
      sq: `${SIZE_A}:2,${SIZE_B}:3`,
      sizeQuantities: "S:2,M:3",
      total: "5",
      lineItems: "S|Juan|10,M||",
    });
    assert.equal(payload.type, "returning");
    assert.equal(payload.name, "Ana");
    assert.equal(payload.organizationName, "Club X");
    assert.equal(payload.productId, PRODUCT);
    assert.equal(payload.fabricId, FABRIC);
    assert.deepEqual(payload.techniqueIds, ["m1", "m2"]);
    assert.deepEqual(payload.sizeQuantities, [
      { sizeId: SIZE_A, quantity: 2 },
      { sizeId: SIZE_B, quantity: 3 },
    ]);
    assert.deepEqual(payload.lineItems, [
      { sizeId: null, sizeLabel: "S", individualName: "Juan", individualNumber: "10" },
      { sizeId: null, sizeLabel: "M", individualName: "", individualNumber: "" },
    ]);
  });

  it("never lifts secrets or file ids off the URL", () => {
    const payload = legacyParamsToPayload({
      uploadSessionId: SESSION,
      uploadSessionSecret: "should-never-survive",
      files: `${SIZE_A},${SIZE_B}`,
      total: "999",
      productId: PRODUCT,
    });
    assert.equal(payload.uploadSessionId, SESSION);
    assert.equal((payload as Record<string, unknown>).uploadSessionSecret, undefined);
    assert.equal((payload as Record<string, unknown>).files, undefined);
    assert.equal((payload as Record<string, unknown>).total, undefined);
  });

  it("returns an empty payload for a bare URL", () => {
    assert.deepEqual(legacyParamsToPayload({}), {});
    assert.deepEqual(legacyParamsToPayload({ unknown: "x" }), {});
  });
});

describe("draftOrderDataSchema", () => {
  const valid = {
    type: "new" as const,
    name: "Ana",
    email: "ana@club.ar",
    phone: "3704",
    productId: PRODUCT,
    sizeQuantities: [{ sizeId: SIZE_A, quantity: 2 }],
    lineItems: [
      { sizeId: SIZE_A, sizeLabel: "S", individualName: "Juan", individualNumber: "10" },
      { sizeId: SIZE_A, sizeLabel: "S", individualName: null, individualNumber: null },
    ],
    uploadSessionId: SESSION,
  };

  it("accepts a complete draft payload and tolerates forward-compatible extras", () => {
    const parsed = draftOrderDataSchema.safeParse({ ...valid, step: 5, customerType: "club", futureField: 1 });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.type, "new");
      assert.equal(parsed.data.lineItems.length, 2);
      assert.equal(parsed.data.lineItems[0]!.sizeId, SIZE_A);
    }
  });

  it("rejects a draft missing contact identity", () => {
    assert.equal(draftOrderDataSchema.safeParse({ ...valid, name: "" }).success, false);
    assert.equal(draftOrderDataSchema.safeParse({ ...valid, email: "nope" }).success, false);
    const noEmail = { ...valid } as Record<string, unknown>;
    delete noEmail.email;
    assert.equal(draftOrderDataSchema.safeParse(noEmail).success, false);
  });

  it("rejects a draft with no garments or no product", () => {
    assert.equal(draftOrderDataSchema.safeParse({ ...valid, lineItems: [] }).success, false);
    assert.equal(draftOrderDataSchema.safeParse({ ...valid, sizeQuantities: [] }).success, false);
    const noProduct = { ...valid } as Record<string, unknown>;
    delete noProduct.productId;
    assert.equal(draftOrderDataSchema.safeParse(noProduct).success, false);
  });

  it("allows conversion without an upload session (no files staged)", () => {
    const noSession = { ...valid } as Record<string, unknown>;
    delete noSession.uploadSessionId;
    assert.equal(draftOrderDataSchema.safeParse(noSession).success, true);
  });
});
