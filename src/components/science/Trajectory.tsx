"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { nowIndex, toJD } from "@/lib/science/ephemeris";
import { trajectoryScenePoints } from "./coords";
import type { EphPoint } from "@/lib/science/ephemeris";
import type { PathFrame } from "./types";

interface Props {
  points: EphPoint[];
  /** reference frame for the path */
  frame: PathFrame;
  /** seconds for the full trace to complete */
  duration?: number;
  /** restart the animation when this changes */
  traceKey: string | number;
}

/**
 * Flight path that grows outward from the spacecraft in both directions:
 * already-flown segment in light red, upcoming segment in whitish-grey.
 * Implemented with setDrawRange on two THREE.Line objects — cheap, no rebuilds.
 */
export function Trajectory({ points, frame, duration = 2.4, traceKey }: Props) {
  const progress = useRef(0);

  const { pastLine, futureLine, pastGeo, futureGeo, pastCount, futureCount } =
    useMemo(() => {
      const jd = toJD(new Date());
      const split = nowIndex(points, jd);
      const all = trajectoryScenePoints(points, frame);

      // past: ordered spacecraft -> launch so drawRange grows backward
      const pastPts = all.slice(0, split + 1).reverse();
      // future: ordered spacecraft -> end so drawRange grows forward
      const futurePts = all.slice(split);

      const pastGeo = new THREE.BufferGeometry().setFromPoints(pastPts);
      const futureGeo = new THREE.BufferGeometry().setFromPoints(futurePts);
      pastGeo.setDrawRange(0, 0);
      futureGeo.setDrawRange(0, 0);

      const pastLine = new THREE.Line(
        pastGeo,
        new THREE.LineBasicMaterial({
          color: "#f08080", // light red — path already traveled
          transparent: true,
          opacity: 0.9,
        })
      );
      const futureLine = new THREE.Line(
        futureGeo,
        new THREE.LineBasicMaterial({
          color: "#c9ccd4", // whitish grey — path ahead
          transparent: true,
          opacity: 0.55,
        })
      );
      return {
        pastLine,
        futureLine,
        pastGeo,
        futureGeo,
        pastCount: pastPts.length,
        futureCount: futurePts.length,
      };
    }, [points, frame]);

  // restart the trace whenever a new craft is selected
  useEffect(() => {
    progress.current = 0;
    pastGeo.setDrawRange(0, 0);
    futureGeo.setDrawRange(0, 0);
  }, [traceKey, pastGeo, futureGeo]);

  useEffect(() => {
    return () => {
      pastGeo.dispose();
      futureGeo.dispose();
      (pastLine.material as THREE.Material).dispose();
      (futureLine.material as THREE.Material).dispose();
    };
  }, [pastGeo, futureGeo, pastLine, futureLine]);

  useFrame((_, dt) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + dt / duration);
    // ease-out so the trace decelerates as it completes
    const t = 1 - Math.pow(1 - progress.current, 2.2);
    pastGeo.setDrawRange(0, Math.floor(pastCount * t));
    futureGeo.setDrawRange(0, Math.floor(futureCount * t));
  });

  return (
    <group>
      <primitive object={pastLine} />
      <primitive object={futureLine} />
    </group>
  );
}
