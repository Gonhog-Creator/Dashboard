"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { latLonToVec3 } from "./coords";
import type { FacilityState } from "./types";

interface Props {
  facility: FacilityState;
  earthPos: THREE.Vector3;
  radius: number;
  selected: boolean;
  onSelect: () => void;
}

// beyond this camera->marker distance the tag fades out entirely —
// band sits just past the earth->satellite mode transition (~4 units)
const FADE_START = 3;
const FADE_END = 5;

/**
 * HTML dot + tag pinned to the globe. Hidden when the facility is on the
 * far side of the earth (dot-product occlusion) or the camera is too far
 * for the tag to be meaningful — cheap, no raycasting.
 */
export function FacilityMarker({ facility, earthPos, radius, selected, onSelect }: Props) {
  const tag = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera);
  const [hover, setHover] = useState(false);

  const pos = useMemo(
    () => latLonToVec3(facility.lat, facility.lon, radius * 1.005).add(earthPos),
    [facility.lat, facility.lon, radius, earthPos]
  );
  const normal = useMemo(
    () => pos.clone().sub(earthPos).normalize(),
    [pos, earthPos]
  );

  useFrame(() => {
    if (!tag.current) return;
    const toCam = camera.position.clone().sub(pos);
    const dist = toCam.length();
    const facing = normal.dot(toCam.normalize()) > 0.12;
    // fade band: fully visible < FADE_START, gone by FADE_END
    const near =
      dist < FADE_START
        ? 1
        : dist > FADE_END
          ? 0
          : 1 - (dist - FADE_START) / (FADE_END - FADE_START);
    const opacity = facing ? near : 0;
    tag.current.style.opacity = String(opacity);
    tag.current.style.pointerEvents = opacity > 0.4 ? "auto" : "none";
  });

  const color =
    facility.status === "offline" ? "#f87171" : facility.status === "online" ? "#4ade80" : "#a3a3a3";
  const flashing = facility.unseen > 0;

  return (
    <group position={pos}>
      <Html
        center
        zIndexRange={[30, 0]}
        style={{ transition: "opacity 0.25s" }}
        wrapperClass="facility-marker"
      >
        <div ref={tag} className="relative flex items-center" style={{ transition: "opacity .2s" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            className="relative grid cursor-pointer place-items-center"
            aria-label={facility.name}
            style={{ width: 26, height: 26, margin: "-6px 0 -6px -6px" }}
          >
            {flashing && (
              <span
                className="absolute rounded-full animate-ping"
                style={{ width: 14, height: 14, background: color, opacity: 0.7 }}
              />
            )}
            <span
              className="absolute rounded-full border border-black/40"
              style={{
                width: 14,
                height: 14,
                background: color,
                boxShadow: flashing
                  ? `0 0 10px 2px ${color}`
                  : `0 0 6px 1px ${color}88`,
                transform: selected ? "scale(1.5)" : "scale(1)",
                transition: "transform .2s",
              }}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            className="ml-2 cursor-pointer whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
            style={{
              background: "rgba(10,14,22,0.78)",
              color: "#e5e7eb",
              border: "1px solid rgba(255,255,255,0.14)",
              opacity: hover || selected ? 1 : 0.85,
              backdropFilter: "blur(4px)",
            }}
          >
            {facility.short}
            {flashing && <span style={{ color }}> ●</span>}
          </button>
        </div>
      </Html>
    </group>
  );
}
