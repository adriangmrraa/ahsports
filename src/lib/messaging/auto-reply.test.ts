/**
 * First-contact auto-reply primitives (A-18).
 *
 * The gate decides whether a new conversation gets the fixed first-contact
 * reply. The durable claim key is what makes two concurrent first messages
 * race-safe: only one of them wins the unique claim.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { autoReplyClaimKey, shouldSendAutoReply } from "./auto-reply";

describe("shouldSendAutoReply", () => {
  it("sends on a brand-new conversation", () => {
    assert.equal(
      shouldSendAutoReply({ isNew: true, alreadyReplied: false, conversationHasMessages: false }),
      true
    );
  });

  it("retries first contact after a retryable send failure (conversation row exists, no message did)", () => {
    assert.equal(
      shouldSendAutoReply({ isNew: false, alreadyReplied: false, conversationHasMessages: false }),
      true
    );
  });

  it("never duplicates a recorded reply", () => {
    assert.equal(
      shouldSendAutoReply({ isNew: true, alreadyReplied: true, conversationHasMessages: true }),
      false
    );
    assert.equal(
      shouldSendAutoReply({ isNew: false, alreadyReplied: true, conversationHasMessages: false }),
      false
    );
  });

  it("never replies into an established thread", () => {
    assert.equal(
      shouldSendAutoReply({ isNew: false, alreadyReplied: false, conversationHasMessages: true }),
      false
    );
  });

  it("trusts the isNew fast path (a fresh conversation row may report no messages yet)", () => {
    assert.equal(
      shouldSendAutoReply({ isNew: true, alreadyReplied: false, conversationHasMessages: true }),
      true
    );
  });
});

describe("autoReplyClaimKey", () => {
  it("is conversation-scoped and stable across calls", () => {
    assert.equal(autoReplyClaimKey("conv-1"), "auto-reply:conv:conv-1");
    assert.equal(autoReplyClaimKey("conv-1"), autoReplyClaimKey("conv-1"));
    assert.notEqual(autoReplyClaimKey("conv-1"), autoReplyClaimKey("conv-2"));
  });
});
