import "server-only";

import { redirect } from "next/navigation";
import { createConfiguratorDraft, getConfiguratorDraftByToken } from "@/lib/configurator/drafts";
import { isDraftToken, type DraftPayload } from "@/configurator/schemas";
import { legacyParamsToPayload } from "./wizard-legacy-params";
import type { GarmentConfig } from "@/configurator/model";

/**
 * Wizard draft resolution — every step resolves `?d=<cfg_…>` to a live
 * server-side draft instead of reading flow state off the URL.
 *
 * Backward compatibility: a URL arriving with legacy params (productId, sq,
 * lineItems…) but no `d` gets seeded into a fresh draft and redirected to its
 * canonical `?d=` form, so old shared/catalog links keep working while PII and
 * upload secrets stop riding query strings from here on.
 */

export type ResolvedWizardDraft = {
  token: string;
  payload: DraftPayload;
  items: Array<{
    id: string;
    productId: string;
    sortOrder: number;
    currentRevisionNo: number;
    orderLineId: string | null;
    config: GarmentConfig;
  }>;
};

/**
 * Resolves the wizard draft for this request. Missing token → creates an
 * empty draft and redirects to `?d=`. Legacy params → seeds them into the
 * draft first, then redirects. Expired/unknown token → fresh draft.
 */
export async function resolveWizardDraft(
  step: number,
  sp: Record<string, string | undefined>,
): Promise<ResolvedWizardDraft> {
  const token = sp.d;
  if (isDraftToken(token)) {
    const draft = await getConfiguratorDraftByToken(token);
    if (draft) {
      return {
        token,
        payload: draft.draft.payload as DraftPayload,
        items: draft.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          sortOrder: i.sortOrder,
          currentRevisionNo: i.currentRevisionNo,
          orderLineId: i.orderLineId,
          config: i.normalizedConfig,
        })),
      };
    }
  }

  const seeded = legacyParamsToPayload(sp);
  const created = await createConfiguratorDraft({ ...seeded, step });
  redirect(`/presupuesto/${step}?d=${created.token}`);
}

/** Items with their normalized config — for surfaces that render the design. */
export async function loadWizardDraftWithConfigs(token: string) {
  if (!isDraftToken(token)) return null;
  return getConfiguratorDraftByToken(token);
}
