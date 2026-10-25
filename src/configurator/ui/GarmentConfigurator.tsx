"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { beginPublicUploadSession, uploadAttachmentFromPublic } from "@/app/actions/public-orders";
import {
  normalizeGarmentConfig,
  type CollarVariant,
  type GarmentColors,
  type GarmentConfig,
  type GarmentConfigInput,
  type GarmentZone,
  type HexColor,
  type ProductGarmentDescriptor,
  type SleeveVariant,
  type ViewPreset,
  type VisualAssetPlacement,
} from "../model";
import { productCapabilities, type ProductCapabilities } from "../capabilities";
import { GarmentViewer, type GarmentViewerHandle } from "../viewer/GarmentViewer";
import { ViewerErrorBoundary } from "../viewer/ViewerErrorBoundary";
import {
  AttachmentPanel,
  ControlSection,
  SegmentedControl,
  SelectField,
  SublimationPanel,
  SwatchField,
  type UploadedAsset,
} from "./controls";

/**
 * GarmentConfigurator — the single shared configurator surface for home,
 * wizard step 4 and admin. Owns config state, emits every change upward and
 * exposes a deterministic captureImage via ref. Product/fabric data arrives
 * server-fetched as props; uploads go through an injectable uploader so public
 * surfaces reuse the upload-session pipeline while admin can inject its own.
 */

export type ConfiguratorMode = "home" | "quote" | "admin";

export type ConfiguratorProduct = ProductGarmentDescriptor & {
  id: string;
  name: string;
  sku?: string | null;
  zones?: readonly string[] | null;
};

export type ConfiguratorFabric = {
  id: string;
  name: string;
  sublimable: boolean;
  /** Renderer preset id resolved server-side (performance|satin|pique|mesh). */
  visualPreset: string;
};

export type ConfiguratorState = {
  productId: string | null;
  config: GarmentConfig;
  assets: readonly UploadedAsset[];
};

export type ConfiguratorUploader = (file: File, kind: string) => Promise<UploadedAsset>;

export type GarmentConfiguratorHandle = {
  captureImage: (type?: string, quality?: number) => Promise<Blob | null>;
};

export type GarmentConfiguratorProps = {
  mode: ConfiguratorMode;
  products: readonly ConfiguratorProduct[];
  fabrics: readonly ConfiguratorFabric[];
  initialProductId?: string | null;
  initialConfig?: GarmentConfigInput | null;
  initialAssets?: readonly UploadedAsset[];
  /** Locks the picker to this product — wizard step 4 designs the priced pick. */
  lockProductId?: string | null;
  onStateChange?: (state: ConfiguratorState) => void;
  /** Runs before export so public surfaces can durably save the exact design. */
  beforeExport?: (state: ConfiguratorState) => Promise<void> | void;
  /**
   * Upload implementation. undefined → built-in public upload session
   * (home/wizard). null → attachments hidden. Admin passes its own.
   */
  uploader?: ConfiguratorUploader | null;
  /**
   * Called once the public upload session exists so the surface can bind it
   * (wizard persists its id on the draft payload). Arg is a stable session id.
   */
  onUploadSession?: (sessionId: string) => void;
  /** Session-storage namespace for upload creds — keeps them off the URL and off the DB. */
  storageKey?: string;
  showAttachments?: boolean;
  showExport?: boolean;
  className?: string;
};

const COLLAR_LABELS: Record<CollarVariant, string> = {
  crew: "Redondo",
  "v-neck": "En V",
  polo: "Polo",
};

const SLEEVE_LABELS: Record<SleeveVariant, string> = {
  sleeveless: "Sin mangas",
  short: "Corta",
  long: "Larga",
};

const COLOR_ROLE_LABELS: Record<keyof GarmentColors, string> = {
  primary: "Color principal",
  secondary: "Paneles",
  accent: "Detalles",
};

const ZONE_LABELS: Record<GarmentZone, string> = {
  "chest-left": "Pecho izq.",
  "chest-right": "Pecho der.",
  "front-center": "Pecho central",
  "back-upper": "Espalda alta",
  "back-lower": "Espalda baja",
  "sleeve-left": "Manga izq.",
  "sleeve-right": "Manga der.",
  "leg-left": "Pierna izq.",
  "leg-right": "Pierna der.",
};

const ATTACHMENT_KINDS = [
  { value: "identidad_organizacion", label: "Logo / Identidad" },
  { value: "sponsor", label: "Sponsor" },
  { value: "diseno_pedido", label: "Diseño de referencia" },
] as const;

const IMAGE_ASSET_KINDS = new Set(["identidad_organizacion", "sponsor", "diseno_pedido"]);

let placementSeq = 0;
function nextPlacementId() {
  placementSeq += 1;
  return `plc_${Date.now().toString(36)}_${placementSeq.toString(36)}`;
}

/**
 * Built-in public uploader: lazily opens one upload session per configurator
 * mount, then stages each file through the existing public-orders pipeline.
 * Session creds persist in sessionStorage under `storageKey` so a page reload
 * keeps pending uploads; they never enter the URL or the draft payload.
 */
function usePublicUploader(storageKey: string | undefined, onSession: ((id: string) => void) | undefined) {
  const sessionRef = useRef<Promise<{ id: string; secret: string } | null> | null>(null);
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;

  const openSession = useCallback(async () => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as { id?: unknown; secret?: unknown };
          if (typeof saved.id === "string" && typeof saved.secret === "string") {
            onSessionRef.current?.(saved.id);
            return { id: saved.id, secret: saved.secret };
          }
        }
      } catch {
        /* corrupted entry → fresh session below */
      }
    }
    const res = await beginPublicUploadSession();
    if (!res.ok) return null;
    const session = { id: res.id, secret: res.secret };
    if (storageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        /* storage full/blocked — session still works in memory */
      }
    }
    onSessionRef.current?.(session.id);
    return session;
  }, [storageKey]);

  return useCallback<ConfiguratorUploader>(
    async (file, kind) => {
      sessionRef.current ??= openSession();
      let session = await sessionRef.current;
      if (!session) throw new Error("No se pudo preparar la carga de archivos");
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      let res = await uploadAttachmentFromPublic(form, session);
      if (!res.ok && /sesi[oó]n|venci/i.test(res.error)) {
        // Stored creds may point at an expired session — reopen once.
        if (storageKey && typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
        sessionRef.current = openSession();
        session = await sessionRef.current;
        if (!session) throw new Error("No se pudo preparar la carga de archivos");
        const retry = new FormData();
        retry.append("file", file);
        retry.append("kind", kind);
        res = await uploadAttachmentFromPublic(retry, session);
      }
      if (!res.ok) throw new Error(res.error);
      return { id: res.id, url: res.url, name: res.name, kind: res.kind };
    },
    [openSession, storageKey],
  );
}

export const GarmentConfigurator = forwardRef<GarmentConfiguratorHandle, GarmentConfiguratorProps>(
  function GarmentConfigurator(
    {
      mode,
      products,
      fabrics,
      initialProductId,
      initialConfig,
      initialAssets,
      lockProductId,
      onStateChange,
      beforeExport,
      uploader,
      onUploadSession,
      storageKey,
      showAttachments = true,
      showExport = true,
      className,
    },
    ref,
  ) {
    const [productId, setProductId] = useState<string | null>(lockProductId ?? initialProductId ?? products[0]?.id ?? null);
    const [config, setConfig] = useState<GarmentConfig>(() => normalizeGarmentConfig(initialConfig));
    const [assets, setAssets] = useState<readonly UploadedAsset[]>(initialAssets ?? []);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const viewerRef = useRef<GarmentViewerHandle>(null);

    const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
    const caps: ProductCapabilities = useMemo(
      () => productCapabilities(product, product?.zones),
      [product],
    );
    // attachment id → URL for the decal layer. Whether an asset actually draws
    // is decided by placements referencing it; non-image URLs fail texture
    // load and are skipped honestly.
    const assetUrls = useMemo(
      () => Object.fromEntries(assets.map((a) => [a.id, a.url])),
      [assets],
    );
    const sublimationAsset = useMemo(
      () => assets.find((asset) => asset.id === config.sublimation?.assetRef) ?? null,
      [assets, config.sublimation?.assetRef],
    );
    const attachmentAssets = useMemo(
      () => assets.filter((asset) => asset.id !== config.sublimation?.assetRef),
      [assets, config.sublimation?.assetRef],
    );
    const attachmentsEnabled = showAttachments && uploader !== null;
    const publicUploader = usePublicUploader(storageKey, onUploadSession);
    const upload = uploader ?? publicUploader;

    const emit = useCallback(
      (next: ConfiguratorState) => onStateChange?.(next),
      [onStateChange],
    );

    /** Pure-then-set: computes the next config outside the updater (StrictMode safe). */
    const update = useCallback(
      (patch: Partial<GarmentConfig>, nextAssets?: readonly UploadedAsset[], nextProductId?: string | null) => {
        const nextConfig = normalizeGarmentConfig({ ...config, ...patch });
        const nextState: ConfiguratorState = {
          productId: nextProductId !== undefined ? nextProductId : productId,
          config: nextConfig,
          assets: nextAssets ?? assets,
        };
        setConfig(nextConfig);
        if (nextAssets) setAssets(nextAssets);
        if (nextProductId !== undefined) setProductId(nextProductId);
        emit(nextState);
      },
      [config, assets, productId, emit],
    );

    // Keep collar/sleeves in range when the product (and its capabilities)
    // change — e.g. switching to a campera hides the collar control.
    useEffect(() => {
      const collar = caps.collarVariants.length === 0
        ? caps.defaultCollar
        : caps.collarVariants.includes(config.collar)
          ? config.collar
          : caps.defaultCollar;
      const sleeves = caps.sleeveVariants.length === 0
        ? caps.defaultSleeves
        : caps.sleeveVariants.includes(config.sleeves)
          ? config.sleeves
          : caps.defaultSleeves;
      if (collar !== config.collar || sleeves !== config.sleeves) {
        update({ collar, sleeves });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [caps]);

    const onUpload = useCallback(
      async (file: File, kind: string, purpose: "attachment" | "sublimation" = "attachment") => {
        setUploadBusy(true);
        setUploadError(null);
        try {
          const asset = await upload(file, kind);
          const nextAssets = purpose === "sublimation"
            ? [...assets.filter((current) => current.id !== config.sublimation?.assetRef), asset]
            : [...assets, asset];
          setAssets(nextAssets);
          if (purpose === "sublimation") {
            update({
              sublimation: {
                assetRef: asset.id,
                repeat: config.sublimation?.repeat ?? 2,
              },
            }, nextAssets);
            return;
          }
          // Logo/sponsor uploads auto-create a placement on the first free zone.
          if (IMAGE_ASSET_KINDS.has(kind) && caps.supportsPlacements) {
            const usedZones = new Set(config.placements.map((p) => p.zone));
            const freeZone = caps.zones.find((z) => !usedZones.has(z));
            if (freeZone) {
              const placement: VisualAssetPlacement = {
                id: nextPlacementId(),
                zone: freeZone,
                assetRef: asset.id,
                anchor: { u: 0.5, v: 0.5 },
                scale: 1,
                rotationDeg: 0,
              };
              update({ placements: [...config.placements, placement] }, nextAssets);
              return;
            }
          }
          update({}, nextAssets);
        } catch (e) {
          setUploadError(e instanceof Error ? e.message : "No se pudo subir el archivo");
        } finally {
          setUploadBusy(false);
        }
      },
      [assets, caps, config.placements, config.sublimation, update, upload],
    );

    const removeAsset = useCallback(
      (id: string) => {
        const nextAssets = assets.filter((a) => a.id !== id);
        setAssets(nextAssets);
        update({
          placements: config.placements.filter((p) => p.assetRef !== id),
          sublimation: config.sublimation?.assetRef === id ? null : config.sublimation,
        }, nextAssets);
      },
      [assets, config.placements, config.sublimation, update],
    );

    const removeSublimation = useCallback(() => {
      const assetRef = config.sublimation?.assetRef;
      const nextAssets = assetRef ? assets.filter((asset) => asset.id !== assetRef) : assets;
      update({ sublimation: null }, nextAssets);
    }, [assets, config.sublimation?.assetRef, update]);

    const setPlacementZone = useCallback(
      (placementId: string, zone: GarmentZone) => {
        update({
          placements: config.placements.map((p) => (p.id === placementId ? { ...p, zone } : p)),
        });
      },
      [config.placements, update],
    );

    const exportImage = useCallback(async () => {
      if (!viewerRef.current) return;
      setExporting(true);
      try {
        await beforeExport?.({ productId, config, assets });
        const blob = await viewerRef.current.captureImage("image/png");
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ah-sports-${product?.name ? product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "diseno"}-${config.view}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    }, [assets, beforeExport, config, product, productId]);

    useImperativeHandle(
      ref,
      () => ({ captureImage: (type, quality) => viewerRef.current?.captureImage(type, quality) ?? Promise.resolve(null) }),
      [],
    );

    const fallbackNotice = caps.rendererKey === "generic-garment";

    return (
      <div className={cn("grid w-full gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]", className)} data-mode={mode}>
        {/* Viewer — the protagonist */}
        <div className="relative">
          <ViewerErrorBoundary>
            <GarmentViewer
              ref={viewerRef}
              config={config}
              descriptor={product}
              view={config.view}
              onViewChange={(view: ViewPreset) => update({ view })}
              assetUrls={assetUrls}
            />
          </ViewerErrorBoundary>
          {fallbackNotice && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-on-navy-variant">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Vista genérica — el modelo dedicado de este producto todavía está en camino.
            </p>
          )}
          {showExport && (
            <button
              type="button"
              onClick={exportImage}
              disabled={exporting}
              className="absolute right-3 top-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-navy-line bg-navy-950/80 px-3 text-xs font-semibold text-on-navy backdrop-blur-sm transition-colors hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {exporting ? "Exportando…" : "Exportar PNG"}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 rounded-lg border border-navy-line bg-navy-950/60 p-2 sm:p-3">
          <ControlSection title="Producto" summary={product?.name ?? "Elegí la prenda"} defaultOpen={!lockProductId}>
            {lockProductId ? (
              <p className="rounded-md border border-navy-line bg-navy-900/60 px-3 py-2.5 text-sm font-semibold text-on-navy">
                {product?.name ?? "Producto"}
              </p>
            ) : (
              <SelectField
                label="Elegí la prenda"
                value={productId ?? ""}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(id) => {
                  setProductId(id);
                  update({}, undefined, id);
                }}
              />
            )}
          </ControlSection>

          <ControlSection
            title="Colores"
            summary={
              <span className="inline-flex items-center justify-end gap-1.5" aria-label="Colores elegidos">
                {caps.colorRoles.map((role) => (
                  <span key={role} className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: config.colors[role] }} />
                ))}
              </span>
            }
          >
            {caps.colorRoles.map((role) => (
              <SwatchField
                key={role}
                label={COLOR_ROLE_LABELS[role]}
                value={config.colors[role]}
                onChange={(v: HexColor) => update({ colors: { ...config.colors, [role]: v } })}
              />
            ))}
          </ControlSection>

          {caps.supportsFabrics && fabrics.length > 0 && (
            <ControlSection title="Tela" summary={fabrics.find((fabric) => fabric.id === config.fabricId)?.name ?? "Estándar"}>
              <SelectField
                label="Material"
                value={config.fabricId ?? ""}
                options={[
                  { value: "", label: "Estándar" },
                  ...fabrics.map((f) => ({ value: f.id, label: f.name })),
                ]}
                onChange={(fabricId) => {
                  const fabric = fabrics.find((f) => f.id === fabricId);
                  update(fabric ? { fabricId: fabric.id, fabric: fabric.visualPreset as GarmentConfig["fabric"] } : { fabricId: null });
                }}
              />
            </ControlSection>
          )}

          {caps.collarVariants.length > 0 && (
            <ControlSection title="Cuello" summary={COLLAR_LABELS[config.collar]}>
              <SegmentedControl
                ariaLabel="Tipo de cuello"
                value={config.collar}
                onChange={(collar) => update({ collar })}
                options={caps.collarVariants.map((v) => ({ value: v, label: COLLAR_LABELS[v] }))}
              />
            </ControlSection>
          )}

          {caps.sleeveVariants.length > 0 && (
            <ControlSection title="Mangas" summary={SLEEVE_LABELS[config.sleeves]}>
              <SegmentedControl
                ariaLabel="Tipo de mangas"
                value={config.sleeves}
                onChange={(sleeves) => update({ sleeves })}
                options={caps.sleeveVariants.map((v) => ({ value: v, label: SLEEVE_LABELS[v] }))}
              />
            </ControlSection>
          )}

          {attachmentsEnabled && caps.supportsFabrics && (
            <ControlSection
              title="Sublimación base"
              summary={sublimationAsset?.name ?? "patrón frente y espalda"}
            >
              <SublimationPanel
                asset={sublimationAsset}
                repeat={config.sublimation?.repeat ?? 2}
                onRepeatChange={(repeat) => {
                  if (config.sublimation) update({ sublimation: { ...config.sublimation, repeat } });
                }}
                onUpload={(file) => void onUpload(file, "diseno_pedido", "sublimation")}
                onRemove={removeSublimation}
                busy={uploadBusy}
                error={uploadError}
              />
            </ControlSection>
          )}

          {caps.supportsPlacements && config.placements.length > 0 && (
            <ControlSection title="Ubicación de logos" summary={`${config.placements.length} ${config.placements.length === 1 ? "ubicación" : "ubicaciones"}`}>
              {config.placements.map((p) => {
                const asset = assets.find((a) => a.id === p.assetRef);
                return (
                  <SelectField
                    key={p.id}
                    label={asset?.name ?? "Archivo"}
                    value={p.zone}
                    options={caps.zones.map((z) => ({ value: z, label: ZONE_LABELS[z] }))}
                    onChange={(zone) => setPlacementZone(p.id, zone)}
                  />
                );
              })}
            </ControlSection>
          )}

          {attachmentsEnabled && (
            <ControlSection title="Archivos" summary={attachmentAssets.length > 0 ? `${attachmentAssets.length} ${attachmentAssets.length === 1 ? "archivo" : "archivos"}` : "logos y referencias"}>
              <AttachmentPanel
                assets={attachmentAssets}
                onUpload={(file, kind) => void onUpload(file, kind)}
                onRemove={removeAsset}
                busy={uploadBusy}
                error={uploadError}
                kinds={ATTACHMENT_KINDS}
              />
            </ControlSection>
          )}
        </div>
      </div>
    );
  },
);
