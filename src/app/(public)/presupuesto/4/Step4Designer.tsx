"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  GarmentConfigurator,
  type ConfiguratorFabric,
  type ConfiguratorProduct,
  type ConfiguratorState,
  type UploadedAsset,
} from "@/configurator";
import type { GarmentConfigInput } from "@/configurator/model";
import {
  bindDraftUploadSession,
  saveConfiguratorItem,
  updateConfiguratorDraftPayload,
} from "@/app/actions/configurator";

/**
 * F4-11 — Paso 4: configurador compartido sobre el draft. Cada cambio de
 * diseño se guarda (debounced) como revisión del item; los archivos suben a
 * una sesión cuyo secreto queda solo en sessionStorage — el draft guarda el
 * id, nunca el secreto.
 */
export function Step4Designer({
  draftToken,
  products,
  fabrics,
  lockProductId,
  productName,
  initialConfig,
  initialAssets,
}: {
  draftToken: string;
  products: readonly ConfiguratorProduct[];
  fabrics: readonly ConfiguratorFabric[];
  lockProductId: string;
  productName: string;
  initialConfig?: GarmentConfigInput | null;
  initialAssets: readonly UploadedAsset[];
}) {
  const router = useRouter();
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced save — a color drag emits many states; only the settled one
  // becomes a revision. Latest state always kept for the explicit flush.
  const latest = useRef<ConfiguratorState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flushSave = useCallback(
    async (force = false) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const state = latest.current;
      const productId = state?.productId ?? lockProductId;
      if (!productId || (!dirty.current && !force)) return { ok: true as const };
      // When the user never touched a control, persist what they saw —
      // the normalized initial config (or the renderer default).
      const config = state?.config ?? initialConfig ?? {};
      const res = await saveConfiguratorItem(
        draftToken,
        { productId, config },
        "wizard",
      );
      if (res.ok) dirty.current = false;
      return res;
    },
    [draftToken, lockProductId, initialConfig],
  );

  const onStateChange = useCallback(
    (state: ConfiguratorState) => {
      latest.current = state;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flushSave();
      }, 1200);
    },
    [flushSave],
  );

  const onUploadSession = useCallback(
    (sessionId: string) => {
      void bindDraftUploadSession(draftToken, sessionId);
    },
    [draftToken],
  );

  async function goNext() {
    if (continuing) return;
    setContinuing(true);
    setError(null);
    const saved = await flushSave(true);
    if (!saved.ok) {
      setError(saved.error);
      setContinuing(false);
      return;
    }
    const patched = await updateConfiguratorDraftPayload(draftToken, { step: 4 });
    if (!patched.ok) {
      setError(patched.error);
      setContinuing(false);
      return;
    }
    router.push(`/presupuesto/5?d=${encodeURIComponent(draftToken)}`);
  }

  // Session-storage namespace per draft — a second draft never sees another's.
  const storageKey = useMemo(() => `cfg_upload_${draftToken}`, [draftToken]);

  return (
    <div className="flex w-full flex-col gap-5">
      <GarmentConfigurator
        mode="quote"
        products={products}
        fabrics={fabrics}
        initialProductId={lockProductId}
        lockProductId={lockProductId}
        initialConfig={initialConfig}
        initialAssets={initialAssets}
        onStateChange={onStateChange}
        onUploadSession={onUploadSession}
        storageKey={storageKey}
        showAttachments
        showExport
      />

      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus sm:justify-start"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </button>
        <p className="sr-only">{productName}</p>
        <Button
          type="button"
          size="lg"
          disabled={continuing}
          onClick={goNext}
          className="border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent"
        >
          {continuing ? "Guardando…" : "Revisar y confirmar →"}
        </Button>
      </div>
    </div>
  );
}
