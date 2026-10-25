import { draftPayloadSchema, type DraftPayload } from "@/configurator/schemas";

/**
 * Parses the legacy wizard URL fields into a draft payload patch — used once
 * at seed time when an old shared/catalog link arrives without `?d=`.
 *
 * Deliberately ignores `uploadSessionSecret` (it never belongs server-side
 * from a URL), `files` (claimed via the session, not ids) and `total` (the
 * engine recomputes quantities from size ids).
 */
export function legacyParamsToPayload(sp: Record<string, string | undefined>): DraftPayload {
  const payload: Record<string, unknown> = {};
  if (sp.type === "new" || sp.type === "returning") payload.type = sp.type;
  if (sp.name) payload.name = sp.name;
  if (sp.email) payload.email = sp.email;
  if (sp.phone) payload.phone = sp.phone;
  if (sp.org) payload.organizationName = sp.org;
  if (sp.notes) payload.notes = sp.notes;
  if (sp.productId) payload.productId = sp.productId;
  if (sp.fabricId) payload.fabricId = sp.fabricId;
  if (sp.methodIds) payload.techniqueIds = sp.methodIds.split(",").filter(Boolean);
  if (sp.uploadSessionId) payload.uploadSessionId = sp.uploadSessionId;

  // sq = "<sizeId>:<qty>,…" — the id-keyed form used by the pricing engine.
  if (sp.sq) {
    payload.sizeQuantities = sp.sq
      .split(",")
      .filter(Boolean)
      .map((entry) => {
        const [sizeId, qty] = entry.split(":");
        return { sizeId: sizeId || null, quantity: Number(qty) || 0 };
      })
      .filter((entry) => entry.quantity > 0);
  }

  // lineItems = "<talle>|<name>|<number>,…" — labels resolved to ids at read time.
  if (sp.lineItems) {
    payload.lineItems = sp.lineItems
      .split(",")
      .filter(Boolean)
      .map((row) => {
        const [talle, name, number] = row.split("|");
        return { sizeId: null, sizeLabel: talle ?? "", individualName: name ?? "", individualNumber: number ?? "" };
      });
  }
  const parsed = draftPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : {};
}
