"use client";

import { Component, type ReactNode } from "react";
import { Shirt } from "lucide-react";

type Props = { children: ReactNode; className?: string };
type State = { crashed: boolean; retryNonce: number; detail: string | null };

/**
 * Island guard for the 3D viewer: if the scene throws (WebGL, chunk load,
 * renderer bug) the configurator page keeps its controls — the garment panel
 * degrades to this static fallback instead of white-paging the whole route.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, retryNonce: 0, detail: null };

  static getDerivedStateFromError(error: unknown): State {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? "unknown");
    return { crashed: true, retryNonce: 0, detail };
  }

  componentDidCatch(error: unknown) {
    console.error("[garment-viewer] render crash", error);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="relative flex min-h-[320px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-navy-950 texture-mesh px-6 text-center">
          <Shirt className="h-10 w-10 text-on-navy-variant" aria-hidden />
          <p className="text-sm font-medium text-on-navy">
            La vista 3D no pudo cargarse.
          </p>
          <p className="text-xs text-on-navy-variant">
            Tu configuración sigue guardada. Podés reintentar sin recargar la página.
          </p>
          <button
            type="button"
            onClick={() => this.setState((state) => ({ crashed: false, retryNonce: state.retryNonce + 1 }))}
            className="mt-1 inline-flex min-h-10 items-center justify-center rounded-md border border-accent/50 bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Reintentar vista 3D
          </button>
          {this.state.detail && (
            <details className="mt-2 max-w-full text-left">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-on-navy-variant">
                Detalle técnico
              </summary>
              <p className="mt-1 max-h-24 overflow-auto break-all rounded bg-navy-900/60 p-2 font-mono text-[10px] leading-relaxed text-on-navy-variant">
                {this.state.detail}
              </p>
            </details>
          )}
        </div>
      );
    }
    return <div key={this.state.retryNonce}>{this.props.children}</div>;
  }
}
