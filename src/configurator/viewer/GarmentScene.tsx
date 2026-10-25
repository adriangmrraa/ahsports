import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PMREMGenerator, Spherical, Vector3, type Group } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { GarmentConfig, ProductGarmentDescriptor, ViewPreset } from "../model";
import {
  cameraPoseToPosition,
  ORBIT_LIMITS,
  VIEW_CAMERA_PRESETS,
  VIEW_TARGET,
} from "../camera";
import { SCENE_TOKENS } from "../render-tokens";
import { ProductGarment } from "../renderers";
import { PlacementDecals } from "./PlacementDecals";

export type CaptureImageFn = (type?: string, quality?: number) => Promise<Blob | null>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Registers a capture function that renders a frame then reads the canvas. */
function CaptureBridge({ onBridge }: { onBridge: (fn: CaptureImageFn | null) => void }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    onBridge(async (type = "image/png", quality) => {
      invalidate();
      // demand frameloop: let the invalidated frame commit before reading.
      await nextFrame();
      await nextFrame();
      return new Promise<Blob | null>((resolve) => gl.domElement.toBlob(resolve, type, quality));
    });
    return () => onBridge(null);
  }, [gl, invalidate, onBridge]);

  return null;
}

/**
 * Minimal orbit rig: pointer drag orbits, wheel dollies, presets tween in.
 * Hand-rolled to keep the dependency surface at exactly three + fiber.
 */
function GarmentOrbit({ view }: { view: ViewPreset }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const target = useMemo(() => new Vector3(...VIEW_TARGET), []);
  const current = useRef(new Spherical());
  const desired = useRef(new Spherical());

  // Seed both poses from the initial preset so the first frame is stable.
  useEffect(() => {
    const pose = VIEW_CAMERA_PRESETS[view];
    current.current.set(pose.distance, pose.polar, pose.azimuth);
    desired.current.copy(current.current);
    camera.position.set(...cameraPoseToPosition(pose));
    camera.lookAt(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only seed
  }, []);

  useEffect(() => {
    const pose = VIEW_CAMERA_PRESETS[view];
    desired.current.set(pose.distance, pose.polar, pose.azimuth);
    invalidate();
  }, [view, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      el.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      desired.current.theta -= (event.clientX - lastX) * 0.006;
      desired.current.phi = clamp(
        desired.current.phi - (event.clientY - lastY) * 0.005,
        ORBIT_LIMITS.minPolar,
        ORBIT_LIMITS.maxPolar,
      );
      lastX = event.clientX;
      lastY = event.clientY;
      invalidate();
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      el.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      desired.current.radius = clamp(
        desired.current.radius + event.deltaY * 0.0018,
        ORBIT_LIMITS.minDistance,
        ORBIT_LIMITS.maxDistance,
      );
      invalidate();
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, invalidate]);

  useFrame((_, delta) => {
    const c = current.current;
    const d = desired.current;
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 10);
    // Shortest angular path so "back" never spins the long way around.
    const dTheta = Math.atan2(Math.sin(d.theta - c.theta), Math.cos(d.theta - c.theta));
    const dPhi = d.phi - c.phi;
    const dRadius = d.radius - c.radius;
    if (Math.abs(dTheta) < 1e-4 && Math.abs(dPhi) < 1e-4 && Math.abs(dRadius) < 1e-3) return;
    c.theta += dTheta * k;
    c.phi += dPhi * k;
    c.radius += dRadius * k;
    camera.position.setFromSpherical(c).add(target);
    camera.lookAt(target);
    invalidate();
  });

  return null;
}

/** Studio environment: PMREM'd RoomEnvironment for cloth-like PBR response. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const envMap = pmrem.fromScene(envScene, 0.04);
    scene.environment = envMap.texture;
    return () => {
      scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.35} color={SCENE_TOKENS.fillLight} />
      <directionalLight
        position={[2.4, 3.2, 2.6]}
        intensity={2.1}
        color={SCENE_TOKENS.keyLight}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1.8}
        shadow-camera-right={1.8}
        shadow-camera-top={2.2}
        shadow-camera-bottom={-0.5}
        shadow-camera-near={0.5}
        shadow-camera-far={8}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 1.6, 1.6]} intensity={0.55} color={SCENE_TOKENS.fillLight} />
      {/* Warm amber rim — the premium edge read against the navy backdrop. */}
      <directionalLight position={[0.4, 2.6, -3.2]} intensity={1.5} color={SCENE_TOKENS.rimLight} />
    </>
  );
}

function StageFloor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <circleGeometry args={[2.8, 64]} />
        <meshStandardMaterial color={SCENE_TOKENS.floor} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
        <ringGeometry args={[2.62, 2.68, 96]} />
        <meshBasicMaterial color={SCENE_TOKENS.floorRing} transparent opacity={0.6} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} receiveShadow>
        <circleGeometry args={[2.8, 64]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

export type GarmentSceneProps = {
  config: GarmentConfig;
  descriptor?: ProductGarmentDescriptor | null;
  view: ViewPreset;
  onCaptureBridge: (fn: CaptureImageFn | null) => void;
  /** attachment id → public URL — feeds the on-mesh decal layer. */
  assetUrls?: Record<string, string>;
};

export function GarmentScene({ config, descriptor, view, onCaptureBridge, assetUrls }: GarmentSceneProps) {
  const garmentRef = useRef<Group>(null);
  return (
    <>
      <color attach="background" args={[SCENE_TOKENS.backdrop]} />
      <fog attach="fog" args={[SCENE_TOKENS.backdropFog, 5.5, 10]} />
      <StudioEnvironment />
      <StudioLights />
      <StageFloor />
      <GarmentOrbit view={view} />
      <CaptureBridge onBridge={onCaptureBridge} />
      <Suspense fallback={null}>
        <group ref={garmentRef} position-y={0.1}>
          <ProductGarment descriptor={descriptor} config={config} />
        </group>
        <PlacementDecals
          target={garmentRef}
          placements={config.placements}
          assetUrls={assetUrls ?? {}}
          shapeKey={`${descriptor?.garmentFamily ?? "x"}:${descriptor?.garmentType ?? "x"}:${descriptor?.productType ?? "x"}:${descriptor?.productKind ?? "x"}:${config.collar}:${config.sleeves}`}
        />
      </Suspense>
    </>
  );
}
