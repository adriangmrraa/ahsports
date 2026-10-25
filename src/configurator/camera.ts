import type { ViewPreset } from "./model";

/**
 * Camera presets for the garment viewer. A pose is spherical coordinates
 * around a fixed target so the orbit control and the preset buttons share the
 * same math.
 */

export type CameraPose = {
  /** Radians around +Y. 0 faces the garment front (+Z). */
  azimuth: number;
  /** Polar angle from +Y — smaller looks more from above. */
  polar: number;
  /** Distance from target, in scene units. */
  distance: number;
};

/** Chest-height pivot so orbiting feels like turning a mannequin. */
export const VIEW_TARGET: readonly [number, number, number] = [0, 0.95, 0];

export const ORBIT_LIMITS = {
  minPolar: 0.45,
  maxPolar: 1.5,
  minDistance: 2.4,
  maxDistance: 4.4,
} as const;

/**
 * Presets are named by the garment side they frame: "left" shows the wearer's
 * left sleeve (camera on +X, since the garment faces +Z).
 */
export const VIEW_CAMERA_PRESETS: Record<ViewPreset, CameraPose> = {
  front: { azimuth: 0, polar: 1.32, distance: 3.55 },
  back: { azimuth: Math.PI, polar: 1.32, distance: 3.55 },
  left: { azimuth: Math.PI / 2, polar: 1.35, distance: 3.4 },
  right: { azimuth: -Math.PI / 2, polar: 1.35, distance: 3.4 },
};

export const VIEW_PRESET_LABELS: Record<ViewPreset, string> = {
  front: "Frente",
  back: "Espalda",
  left: "Izquierda",
  right: "Derecha",
};

export function cameraPoseToPosition(pose: CameraPose): [number, number, number] {
  const sinPolar = Math.sin(pose.polar);
  return [
    VIEW_TARGET[0] + pose.distance * sinPolar * Math.sin(pose.azimuth),
    VIEW_TARGET[1] + pose.distance * Math.cos(pose.polar),
    VIEW_TARGET[2] + pose.distance * sinPolar * Math.cos(pose.azimuth),
  ];
}
