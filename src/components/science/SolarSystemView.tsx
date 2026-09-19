"use client";

import { useMemo } from "react";
import { Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { EPHEMERIS, positionAt, toJD } from "@/lib/science/ephemeris";
import { MOONS } from "@/lib/science/moons";
import { eclToThree, moonOrbitRadius, moonWorldPos } from "./coords";
import { SpacecraftNode } from "./SpacecraftNode";
import type { PathFrame, Selection } from "./types";

const PLANET_TEX: Record<string, string> = {
  mercury: "/textures/mercury.jpg",
  venus: "/textures/venus.jpg",
  earth: "/textures/earth_day.jpg",
  mars: "/textures/mars.jpg",
  jupiter: "/textures/jupiter.jpg",
  saturn: "/textures/saturn.jpg",
  uranus: "/textures/uranus.jpg",
  neptune: "/textures/neptune.jpg",
};

interface Props {
  selection: Selection;
  onSelectSpacecraft: (id: string) => void;
  onSelectPlanet: (id: string) => void;
  onSelectMoon: (planet: string, index: number) => void;
  /** reference frame for spacecraft flight paths */
  pathFrame: PathFrame;
}

function OrbitLine({ points }: { points: [number, number, number, number][] }) {
  const geo = useMemo(() => {
    const pts = points.map(([, x, y, z]) => eclToThree(x, y, z));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [points]);
  const line = useMemo(
    () =>
      new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: "#3d4b63",
          transparent: true,
          opacity: 0.5,
        })
      ),
    [geo]
  );
  return <primitive object={line} />;
}

function Planet({ id, onSelect }: { id: string; onSelect: () => void }) {
  const p = EPHEMERIS.planets[id];
  const tex = useTexture(PLANET_TEX[id], (t) => {
    (t as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  });

  const pos = useMemo(() => {
    const [x, y, z] = positionAt(p.points, toJD(new Date()));
    return eclToThree(x, y, z);
  }, [p.points]);

  return (
    <group position={pos}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          // ignore drag-releases that end over the planet
          if (e.delta > 6) return;
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <sphereGeometry args={[p.radius, 40, 28]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0} />
      </mesh>
      {id === "saturn" && <SaturnRing />}
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap text-[10px] font-medium tracking-widest uppercase"
          style={{
            transform: `translateY(${p.radius * 12 + 12}px)`,
            color: "rgba(203,213,225,0.6)",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}
        >
          {p.name}
        </div>
      </Html>
    </group>
  );
}

function SaturnRing() {
  const tex = useTexture("/textures/saturn_ring.png", (t) => {
    (t as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  });
  return (
    <mesh rotation={[-Math.PI / 2.15, 0, 0.15]}>
      <ringGeometry args={[3.4, 6.2, 96]} />
      <meshBasicMaterial
        map={tex}
        side={THREE.DoubleSide}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </mesh>
  );
}

function Sun() {
  const tex = useTexture("/textures/sun.jpg", (t) => {
    (t as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[9, 48, 32]} />
        <meshBasicMaterial map={tex} color="#ffd9a0" toneMapped={false} />
      </mesh>
      {/* halo */}
      <mesh scale={1.35}>
        <sphereGeometry args={[9, 32, 24]} />
        <meshBasicMaterial
          color="#ffb84d"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight intensity={2.2} distance={0} decay={0} color="#fff2dd" />
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap text-[10px] font-medium tracking-widest uppercase"
          style={{ transform: "translateY(120px)", color: "rgba(253,230,180,0.7)", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
        >
          Sun
        </div>
      </Html>
    </group>
  );
}

/**
 * A planet's major moons on analytic circular orbits in the ecliptic plane.
 * Orbit radii are evenly spaced just outside the planet mesh (or saturn's
 * rings) — real distances would sit inside the exaggerated planets — but
 * ordering and period-accurate angular speed are honest.
 */
function Moons({ id, onSelect }: { id: string; onSelect: (index: number) => void }) {
  const moons = MOONS[id];
  const data = useMemo(() => {
    if (!moons) return null;
    const p = EPHEMERIS.planets[id];
    const [x, y, z] = positionAt(p.points, toJD(new Date()));
    const center = eclToThree(x, y, z);
    return moons.map((m, i) => {
      const r = moonOrbitRadius(id, i);
      const pos = moonWorldPos(id, i);
      // faint orbit circle in the ecliptic (XZ) plane
      const circle: THREE.Vector3[] = [];
      for (let s = 0; s <= 64; s++) {
        const a = (s / 64) * Math.PI * 2;
        circle.push(
          center
            .clone()
            .add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
        );
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(circle);
      const orbitLine = new THREE.Line(
        orbitGeo,
        new THREE.LineBasicMaterial({
          color: "#8a8f98",
          transparent: true,
          opacity: 0.25,
        })
      );
      return { pos, orbitLine, size: id === "earth" ? 0.12 : 0.08 };
    });
  }, [id, moons]);
  if (!data) return null;
  return (
    <group>
      {data.map((d, i) => (
        <group key={i}>
          <primitive object={d.orbitLine} />
          <mesh position={d.pos}>
            <sphereGeometry args={[d.size, 12, 12]} />
            <meshStandardMaterial color="#c8ccd4" roughness={0.9} />
          </mesh>
          {/* enlarged invisible hit target — the moon dot is tiny */}
          <mesh
            position={d.pos}
            onClick={(e) => {
              e.stopPropagation();
              // ignore drag-releases that end over the moon
              if (e.delta > 6) return;
              onSelect(i);
            }}
            onPointerOver={() => (document.body.style.cursor = "pointer")}
            onPointerOut={() => (document.body.style.cursor = "auto")}
          >
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function SolarSystemView({ selection, onSelectSpacecraft, onSelectPlanet, onSelectMoon, pathFrame }: Props) {
  return (
    <group>
      <Sun />
      {Object.keys(EPHEMERIS.planets).map((id) => (
        <group key={id}>
          <OrbitLine points={EPHEMERIS.planets[id].points} />
          {/* EarthView renders the detailed earth — skip its planet mesh */}
          {id !== "earth" && (
            <Planet id={id} onSelect={() => onSelectPlanet(id)} />
          )}
          <Moons id={id} onSelect={(i) => onSelectMoon(id, i)} />
        </group>
      ))}
      {Object.entries(EPHEMERIS.spacecraft).map(([id, craft]) => (
        <SpacecraftNode
          key={id}
          id={id}
          craft={craft}
          selected={selection?.type === "spacecraft" && selection.id === id}
          onSelect={() => onSelectSpacecraft(id)}
          pathFrame={pathFrame}
        />
      ))}
      {/* faint ambient so night sides aren't pure black */}
      <ambientLight intensity={0.12} />
    </group>
  );
}
