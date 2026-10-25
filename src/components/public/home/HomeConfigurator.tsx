"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  GarmentConfigurator,
  type ConfiguratorFabric,
  type ConfiguratorProduct,
  type ConfiguratorState,
  type UploadedAsset,
} from "@/configurator";
import { normalizeGarmentConfig, type GarmentConfigInput } from "@/configurator/model";
import {
  bindDraftUploadSession,
  ensureConfiguratorDraft,
  saveConfiguratorItem,
  updateConfiguratorDraftPayload,
} from "@/app/actions/configurator";

const HOME_STORAGE_KEY = "cfg_upload_home";

/**
 * Home configurator — the shared GarmentConfigurator in `home` mode plus the
 * conversion CTA. Designing costs nothing; "Cotizar este diseño" materializes
 * the draft (or reuses the live one) and hands off to the wizard with `?d=`.
 */
export function HomeConfigurator({
  products,
  fabrics,
  draftToken,
  initialProductId,
  initialConfig,
  initialAssets,
}: {
  products: readonly ConfiguratorProduct[];
  fabrics: readonly ConfiguratorFabric[];
  /** Live draft resumed from `?d=` — null starts fresh at CTA time. */
  draftToken: string | null;
  initialProductId?: string | null;
  initialConfig?: GarmentConfigInput | null;
  initialAssets?: readonly UploadedAsset[];
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(draftToken ? "saved" : "idle");

  const latest = useRef<ConfiguratorState | null>(null);
  const sessionId = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(draftToken);
  const createPromise = useRef<Promise<string | null> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const payloadProductId = useRef<string | null>(initialProductId ?? null);
  const boundSessionId = useRef<string | null>(null);

  const currentState = useCallback(
    (): ConfiguratorState => latest.current ?? {
      productId: initialProductId ?? products[0]?.id ?? null,
      config: normalizeGarmentConfig(initialConfig),
      assets: initialAssets ?? [],
    },
    [initialAssets, initialConfig, initialProductId, products],
  );

  const ensureDraft = useCallback(async (state: ConfiguratorState) => {
    if (tokenRef.current) return tokenRef.current;
    if (!createPromise.current) {
      createPromise.current = (async () => {
        const res = await ensureConfiguratorDraft({
          productId: state.productId ?? undefined,
          uploadSessionId: sessionId.current ?? undefined,
          step: 1,
        });
        if (!res.ok) {
          setError(res.error);
          return null;
        }
        tokenRef.current = res.token;
        payloadProductId.current = state.productId;
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("d", res.token);
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
        return res.token;
      })().finally(() => {
        createPromise.current = null;
      });
    }
    return createPromise.current;
  }, []);

  const persistNow = useCallback(async (state: ConfiguratorState) => {
    try {
      const productId = state.productId;
      if (!productId) return false;
      setSaveStatus("saving");
      setError(null);
      const token = await ensureDraft(state);
      if (!token) {
        setSaveStatus("idle");
        return false;
      }

      const activeSession = sessionId.current;
      if (activeSession && boundSessionId.current !== activeSession) {
        const bound = await bindDraftUploadSession(token, activeSession);
        if (!bound.ok) {
          setError(bound.error);
          setSaveStatus("idle");
          return false;
        }
        boundSessionId.current = activeSession;
      }

      const saved = await saveConfiguratorItem(token, { productId, config: state.config }, "home");
      if (!saved.ok) {
        setError(saved.error);
        setSaveStatus("idle");
        return false;
      }
      if (payloadProductId.current !== productId) {
        const aligned = await updateConfiguratorDraftPayload(token, { productId });
        if (!aligned.ok) {
          setError(aligned.error);
          setSaveStatus("idle");
          return false;
        }
        payloadProductId.current = productId;
      }
      setSaveStatus("saved");
      return true;
    } catch {
      setError("No se pudo guardar el diseño. Revisá tu conexión y reintentá.");
      setSaveStatus("idle");
      return false;
    }
  }, [ensureDraft]);

  const enqueueSave = useCallback((state: ConfiguratorState) => {
    const queued = saveQueue.current.then(() => persistNow(state));
    saveQueue.current = queued.catch(() => false);
    return queued;
  }, [persistNow]);

  const onStateChange = useCallback((state: ConfiguratorState) => {
    latest.current = state;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void enqueueSave(state), 850);
  }, [enqueueSave]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const onUploadSession = useCallback(
    (id: string) => {
      sessionId.current = id;
      // Materialize/bind the draft as soon as an upload begins. The attachment
      // then survives reloads even when the user only exports the render.
      void (async () => {
        const state = currentState();
        const token = await ensureDraft(state);
        if (!token) return;
        const bound = await bindDraftUploadSession(token, id);
        if (bound.ok) boundSessionId.current = id;
        else setError(bound.error);
      })();
    },
    [currentState, ensureDraft],
  );

  async function startQuote() {
    if (starting) return;
    setStarting(true);
    setError(null);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    const state = currentState();
    const persisted = await enqueueSave(state);
    const token = tokenRef.current;
    if (!persisted || !token) {
      setStarting(false);
      return;
    }
    router.push(`/presupuesto/1?d=${encodeURIComponent(token)}`);
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <GarmentConfigurator
        mode="home"
        products={products}
        fabrics={fabrics}
        initialProductId={initialProductId}
        initialConfig={initialConfig}
        initialAssets={initialAssets}
        onStateChange={onStateChange}
        beforeExport={(state) => enqueueSave(state).then(() => undefined)}
        onUploadSession={onUploadSession}
        storageKey={HOME_STORAGE_KEY}
        showAttachments
        showExport
      />
      {error && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      )}
      <p className="flex min-h-5 items-center justify-center gap-1.5 text-xs text-on-surface-variant" aria-live="polite">
        {saveStatus === "saving" ? (
          <><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> Guardando diseño…</>
        ) : saveStatus === "saved" ? (
          <><Check className="h-3.5 w-3.5 text-success" aria-hidden /> Diseño guardado automáticamente</>
        ) : (
          "Tus cambios se guardan automáticamente"
        )}
      </p>
      <div className="flex justify-center">
        <Button
          type="button"
          size="lg"
          onClick={startQuote}
          disabled={starting}
          className="animate-pulse-cta border-accent bg-accent px-8 text-on-accent hover:border-accent-strong hover:bg-accent-strong hover:text-on-accent"
        >
          {starting ? "Preparando…" : "Cotizar este diseño"}
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
