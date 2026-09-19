"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Clone, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { positionAt, toJD } from "@/lib/science/ephemeris";
import { eclToThree, getEarthPos, pushOutOfPlanets } from "./coords";
import type { SpacecraftEph } from "@/lib/science/ephemeris";
import { SPACECRAFT_MODELS } from "@/lib/science/spacecraft-models";
import { Trajectory } from "./Trajectory";
import type { PathFrame } from "./types";

interface Props {
  id: string;
  craft: SpacecraftEph;
  selected: boolean;
  onSelect: () => void;
  /** reference frame for the flight path */
  pathFrame: PathFrame;
}

// whole node hides when the camera is this close to earth (earth view)
const HIDE_WITHIN = 3.5;
// max bounding-box dimension of a rendered craft model, in scene units
const MODEL_SIZE = 1.1;

/**
 * NASA GLB model normalized to MODEL_SIZE, centered on the craft position,
 * and rotated so +Z faces the velocity vector. Suspends while loading —
 * the caller wraps it in <Suspense> with the dot as fallback.
 */
function SpacecraftModel({
  file,
  rotate,
  orient,
  selected,
}: {
  file: string;
  rotate?: [number, number, number];
  orient: THREE.Quaternion;
  selected: boolean;
}) {
  // local draco decoder (public/draco) — only fetched for compressed files
  const { scene } = useGLTF(`/models/spacecraft/${file}`, "/draco/");
  const ref = useRef<THREE.Group>(null);

  const { scale, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    return {
      scale: MODEL_SIZE / Math.max(size.x, size.y, size.z, 1e-6),
      center: box.getCenter(new THREE.Vector3()),
    };
  }, [scene]);

  useFrame(() => {
    ref.current?.scale.setScalar(selected ? 1.5 : 1);
  });

  return (
    <group quaternion={orient}>
      <group ref={ref}>
        <group scale={scale}>
          <group position={center.clone().negate()} rotation={rotate}>
            <Clone object={scene} />
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Spacecraft dot + name tag at its real current position (nudged off the
 * globe when it would overlap earth). Click targets are the dot mesh and
 * the name label only — no invisible hit areas.
 */
export function SpacecraftNode({ id, craft, selected, onSelect, pathFrame }: Props) {
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);
  const dot = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);
  const earth = useMemo(() => getEarthPos(), []);

  const pos = useMemo(() => {
    const [x, y, z] = positionAt(craft.points, toJD(new Date()));
    // pushed out of any exaggerated planet mesh it would sit inside
    return pushOutOfPlanets(eclToThree(x, y, z));
  }, [craft.points]);

  // velocity direction (finite-diff over half a day) -> model orientation
  const orient = useMemo(() => {
    const jd = toJD(new Date());
    const [x1, y1, z1] = positionAt(craft.points, jd);
    const [x2, y2, z2] = positionAt(craft.points, jd + 0.5);
    const v = eclToThree(x2 - x1, y2 - y1, z2 - z1);
    if (v.lengthSq() < 1e-12) return new THREE.Quaternion();
    v.normalize();
    // +Z should face the velocity; keep +Y toward ecliptic north where possible
    const up = Math.abs(v.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4().lookAt(v, new THREE.Vector3(), up);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [craft.points]);

  const model = SPACECRAFT_MODELS[id];

  useFrame(({ camera, clock }) => {
    const camToEarth = camera.position.distanceTo(earth);
    const visible = camToEarth > HIDE_WITHIN || selected;
    visibleRef.current = visible;

    if (group.current) group.current.visible = visible;
    if (label.current) {
      label.current.style.opacity = visible ? "1" : "0";
      label.current.style.pointerEvents = visible ? "auto" : "none";
    }
    // pulse the marker
    if (dot.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.18;
      dot.current.scale.setScalar(selected ? 1.6 : s);
    }
  });

  return (
    <>
      {/* world-space path — must live OUTSIDE the positioned group */}
      {selected && (
        <Trajectory
          points={craft.points}
          frame={pathFrame}
          traceKey={`${id}:${pathFrame}`}
        />
      )}

      <group ref={group} position={pos}>
      <mesh
        ref={dot}
        onClick={(e) => {
          e.stopPropagation();
          // ignore drag-releases that happen to end over the craft —
          // without this, orbiting/panning re-selects and the camera
          // flings back to the fly-to position
          if (e.delta > 6) return;
          if (visibleRef.current) onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[model ? 0.62 : 0.18, 16, 12]} />
        <meshBasicMaterial
          color={selected ? "#7dd3fc" : hover ? "#bae6fd" : "#e2e8f0"}
          transparent={!!model}
          opacity={model ? 0 : 1}
          depthWrite={!model}
        />
      </mesh>

      {/* 3D model replaces the dot once loaded; dot stays as the click target */}
      {model && (
        <Suspense fallback={null}>
          <SpacecraftModel
            file={model.file}
            rotate={model.rotate}
            orient={orient}
            selected={selected}
          />
        </Suspense>
      )}

      <Html center zIndexRange={[30, 0]}>
        <div ref={label} style={{ transition: "opacity .3s" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            className="block cursor-pointer whitespace-nowrap rounded px-2.5 py-1.5 text-[10px] font-medium tracking-wide"
            style={{
              transform: "translateY(14px)",
              background: "rgba(10,14,22,0.72)",
              color: selected ? "#7dd3fc" : "#cbd5e1",
              border: `1px solid ${selected ? "rgba(125,211,252,0.5)" : "rgba(255,255,255,0.12)"}`,
              backdropFilter: "blur(4px)",
            }}
          >
            {craft.name}
          </button>
        </div>
      </Html>
      </group>
    </>
  );
}
