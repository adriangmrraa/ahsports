"use client";

import { Component, type ReactNode } from "react";
import { Shirt } from "lucide-react";

type Props = { children: ReactNode; className?: string };
type State = { crashed: boolean };

/**
 * Island guard for the 3D viewer: if the scene throws (WebGL, chunk load,
 * renderer bug) the configurator page keeps its controls — the garment panel
 * degrades to this static fallback instead of white-paging the whole route.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
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
            Tu configuración se mantiene — recargá la página para reintentar.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
