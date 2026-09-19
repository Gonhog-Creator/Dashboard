"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Skybox } from "./Skybox";
import { EarthView } from "./EarthView";
import { SolarSystemView } from "./SolarSystemView";
import { CameraDirector } from "./CameraDirector";
import { getEarthPos, latLonToVec3 } from "./coords";
import type { FacilityState, PathFrame, Selection, ViewMode } from "./types";

// three r186 deprecated THREE.Clock but @react-three/fiber 9.7 still builds
// one internally for the frameloop — drop exactly that upstream warning.
// Module scope so it's installed before the Canvas mounts. Remove once
// fiber migrates to THREE.Timer.
if (typeof window !== "undefined") {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("THREE.Clock")) return;
    origWarn.apply(console, args);
  };
}

interface Props {
  mode: ViewMode;
  facilities: FacilityState[];
  selection: Selection;
  onSelectFacility: (id: string) => void;
  onSelectSpacecraft: (id: string) => void;
  onSelectPlanet: (id: string) => void;
  onSelectMoon: (planet: string, index: number) => void;
  onSelectEarth: () => void;
  onModeChange: (mode: ViewMode) => void;
  onBackgroundClick: () => void;
  /** increments each time "view flight path" is pressed */
  pathView: number;
  /** reference frame for spacecraft flight paths */
  pathFrame: PathFrame;
}

/**
 * One continuous scene: the detailed earth sits at its real orbital position
 * inside the solar system. "Earth view" vs "system view" is purely camera
 * distance — zooming out from the globe IS the transition, nothing swaps.
 */
export function Scene({
  mode,
  facilities,
  selection,
  onSelectFacility,
  onSelectSpacecraft,
  onSelectPlanet,
  onSelectMoon,
  onSelectEarth,
  onModeChange,
  onBackgroundClick,
  pathView,
  pathFrame,
}: Props) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const earthPos = useMemo(() => getEarthPos(), []);

  const facilityPos = useMemo(() => {
    if (selection?.type !== "facility") return null;
    const f = facilities.find((x) => x.id === selection.id);
    return f ? latLonToVec3(f.lat, f.lon, 0.955).add(earthPos) : null;
  }, [selection, facilities, earthPos]);

  const camStart = useMemo(
    () => earthPos.clone().add(new THREE.Vector3(0, 0.9, 3.4)),
    [earthPos]
  );

  return (
    <Canvas
      camera={{ position: camStart.toArray(), fov: 50, near: 0.05, far: 80000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      onPointerMissed={onBackgroundClick}
      style={{ background: "#05070d" }}
    >
      <Suspense fallback={null}>
        <Skybox radius={30000} />
        {/* sun, planets (earth excluded — EarthView renders it), spacecraft */}
        <SolarSystemView
          selection={selection}
          onSelectSpacecraft={onSelectSpacecraft}
          onSelectPlanet={onSelectPlanet}
          onSelectMoon={onSelectMoon}
          pathFrame={pathFrame}
        />
        {/* detailed earth at its real orbital position */}
        <EarthView
          earthPos={earthPos}
          facilities={facilities}
          selection={selection}
          mode={mode}
          onSelectFacility={onSelectFacility}
          onSelectEarth={onSelectEarth}
        />
      </Suspense>

      <OrbitControls
        ref={controls}
        makeDefault
        target={earthPos}
        enablePan={mode === "system"}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.9}
        maxDistance={18000}
      />
      <CameraDirector
        selection={selection}
        facilityPos={facilityPos}
        controls={controls}
        pathView={pathView}
        pathFrame={pathFrame}
        onModeChange={onModeChange}
      />
    </Canvas>
  );
}
