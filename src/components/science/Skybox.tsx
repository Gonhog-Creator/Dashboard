"use client";

import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/** Equirectangular milky-way panorama on an inward-facing sphere. */
export function Skybox({ radius = 20000 }: { radius?: number }) {
  const tex = useTexture("/textures/milkyway.jpg", (t) => {
    const texture = t as THREE.Texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
  });

  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-100}>
      <sphereGeometry args={[radius, 64, 40]} />
      <meshBasicMaterial
        map={tex}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
