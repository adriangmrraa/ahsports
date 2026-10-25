"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  normalizeGarmentConfig,
  VIEW_PRESETS,
  type GarmentConfig,
  type ProductGarmentDescriptor,
  type ViewPreset,
} from "../model";
import { cameraPoseToPosition, VIEW_CAMERA_PRESETS, VIEW_PRESET_LABELS } from "../camera";
import { GarmentScene, type CaptureImageFn } from "./GarmentScene";

export type GarmentViewerHandle = {
  /**
   * Deterministic frame export: renders one frame on demand, then reads the
   * canvas via toBlob. Returns null when WebGL is unavailable.
   */
  captureImage: (type?: string, quality?: number) => Promise<Blob | null>;
};

export type GarmentViewerProps = {
  /** Partial config is normalized against DEFAULT_GARMENT_CONFIG. */
  config?: Partial<GarmentConfig> | null;
  /** Product classification used to pick the renderer (falls back safely). */
  descriptor?: ProductGarmentDescriptor | null;
  /** Controlled camera view preset. */
  view?: ViewPreset;
  onViewChange?: (view: ViewPreset) => void;
  showViewControls?: boolean;
  className?: string;
};

type WebGLSupport = "unknown" | "supported" | "unsupported";

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * Reusable garment viewer: premium navy studio scene, orbit rotation, camera
 * presets, on-demand rendering and deterministic image export. Renders a
 * semantic fallback panel when WebGL is unavailable.
 */
export const GarmentViewer = forwardRef<GarmentViewerHandle, GarmentViewerProps>(
  function GarmentViewer(
    { config, descriptor, view, onViewChange, showViewControls = true, className },
    ref,
  ) {
    const normalized = normalizeGarmentConfig(config);
    const [support, setSupport] = useState<WebGLSupport>("unknown");
    const [internalView, setInternalView] = useState<ViewPreset>(view ?? normalized.view);
    const activeView = view ?? internalView;
    const captureRef = useRef<CaptureImageFn | null>(null);

    useEffect(() => {
      setSupport(detectWebGLSupport() ? "supported" : "unsupported");
    }, []);

    const pickView = (next: ViewPreset) => {
      setInternalView(next);
      onViewChange?.(next);
    };

    const onCaptureBridge = useCallback((fn: CaptureImageFn | null) => {
      captureRef.current = fn;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        captureImage: async (type = "image/png", quality) => {
          if (!captureRef.current) return null;
          return captureRef.current(type, quality);
        },
      }),
      [],
    );

    const initialPose = cameraPoseToPosition(VIEW_CAMERA_PRESETS[normalized.view]);

    return (
      <div
        className={cn(
          "relative touch-none overflow-hidden rounded-lg bg-navy-950 texture-mesh",
          "min-h-[320px] w-full",
          className,
        )}
        data-testid="garment-viewer"
      >
        {support === "supported" && (
          <Canvas
            frameloop="demand"
            dpr={[1, 1.75]}
            shadows
            gl={{
              antialias: true,
              preserveDrawingBuffer: true,
              powerPreference: "high-performance",
              alpha: false,
            }}
            camera={{ fov: 32, near: 0.1, far: 20, position: initialPose }}
          >
            <GarmentScene
              config={normalized}
              descriptor={descriptor}
              view={activeView}
              onCaptureBridge={onCaptureBridge}
            />
          </Canvas>
        )}

        {support === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Shirt className="h-10 w-10 text-on-navy-variant" aria-hidden />
            <p className="text-sm font-medium text-on-navy">
              La vista 3D no está disponible en este dispositivo.
            </p>
            <p className="text-xs text-on-navy-variant">
              Tu navegador no soporta WebGL. La configuración elegida se mantiene.
            </p>
          </div>
        )}

        {support === "supported" && showViewControls && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-navy-line bg-navy-950/70 p-1 backdrop-blur-sm">
            {VIEW_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => pickView(preset)}
                aria-pressed={activeView === preset}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  activeView === preset
                    ? "bg-accent text-on-accent"
                    : "text-on-navy-variant hover:text-on-navy",
                )}
              >
                {VIEW_PRESET_LABELS[preset]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
