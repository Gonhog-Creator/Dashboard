"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { FacilityMarker } from "./FacilityMarker";
import type { FacilityState, Selection, ViewMode } from "./types";

const EARTH_R = 0.95; // matches EPHEMERIS planet display radius

const atmosphereVert = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const atmosphereFrag = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
    gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * intensity;
  }
`;

interface Props {
  earthPos: THREE.Vector3;
  facilities: FacilityState[];
  selection: Selection;
  mode: ViewMode;
  onSelectFacility: (id: string) => void;
  onSelectEarth: () => void;
}

/**
 * The detailed earth at its real orbital position. Lit by the sun's point
 * light at the origin, so the day/night terminator is physically correct.
 * Facility markers are Html dots in world space; they fade out with distance.
 */
export function EarthView({
  earthPos,
  facilities,
  selection,
  mode,
  onSelectFacility,
  onSelectEarth,
}: Props) {
  const [day, night, clouds] = useTexture(
    [
      "/textures/earth_day.jpg",
      "/textures/earth_night.jpg",
      "/textures/earth_clouds_alpha.png",
    ],
    (textures) => {
      for (const t of textures as THREE.Texture[]) {
        t.colorSpace = THREE.SRGBColorSpace;
      }
    }
  );

  const cloudsRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (cloudsRef.current) cloudsRef.current.rotation.y += dt * 0.004;
  });

  return (
    <>
    <group position={earthPos}>
      {/* surface: day map + city lights glowing through on the night side */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          // ignore drag-releases that end over the globe — otherwise
          // orbiting flings the camera back to the earth fly-to
          if (e.delta > 6) return;
          if (mode === "system") onSelectEarth(); // click-to-return only from afar
        }}
      >
        <sphereGeometry args={[EARTH_R, 96, 64]} />
        <meshPhongMaterial
          map={day}
          emissiveMap={night}
          emissive={new THREE.Color("#ffdba8")}
          emissiveIntensity={0.55}
          specular={new THREE.Color("#1a2a3a")}
          shininess={12}
        />
      </mesh>

      {/* clouds */}
      <mesh ref={cloudsRef} scale={1.006}>
        <sphereGeometry args={[EARTH_R, 64, 48]} />
        <meshLambertMaterial map={clouds} transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {/* atmosphere rim glow */}
      <mesh scale={1.16}>
        <sphereGeometry args={[EARTH_R, 64, 48]} />
        <shaderMaterial
          vertexShader={atmosphereVert}
          fragmentShader={atmosphereFrag}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* planet label — visible from system range, doubles as "return" hint */}
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className="whitespace-nowrap text-[10px] font-medium tracking-widest uppercase"
          style={{
            transform: "translateY(24px)",
            color: "#7dd3fc",
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            opacity: mode === "system" ? 1 : 0,
            transition: "opacity 0.4s",
          }}
        >
          Earth · click to return
        </div>
      </Html>
    </group>

    {/* markers compute world-space positions internally — keep them
        OUTSIDE the earthPos group or the offset is applied twice */}
    {facilities.map((f) => (
      <FacilityMarker
        key={f.id}
        facility={f}
        earthPos={earthPos}
        radius={EARTH_R}
        selected={selection?.type === "facility" && selection.id === f.id}
        onSelect={() => onSelectFacility(f.id)}
      />
    ))}
    </>
  );
}
