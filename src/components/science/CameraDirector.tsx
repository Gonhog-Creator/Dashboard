"use client";

/* eslint-disable react-hooks/immutability --
   useFrame is R3F's render loop: mutating controls/camera there is the
   intended pattern, not a React state violation. */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  eclToThree,
  getEarthPos,
  moonWorldPos,
  pushOutOfPlanets,
  trajectoryScenePoints,
} from "./coords";
import { EPHEMERIS, positionAt, toJD } from "@/lib/science/ephemeris";
import type { PathFrame, Selection, ViewMode } from "./types";

interface Props {
  selection: Selection;
  /** world-space position of the selected facility marker */
  facilityPos: THREE.Vector3 | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
  /** increments each time "view flight path" is pressed */
  pathView: number;
  /** reference frame for the flight path */
  pathFrame: PathFrame;
  onModeChange: (mode: ViewMode) => void;
}

const ORIGIN = new THREE.Vector3(0, 0, 0);
// distance bands (camera -> earth) for mode + retargeting, with hysteresis
const EARTH_NEAR = 3.5; // closer than this -> lock onto earth
const EARTH_FAR = 80; // farther than this -> orbit the sun
const MODE_SPLIT = 4; // HUD mode boundary

/**
 * Unified-scene camera brain. There is no scene swap: earth lives at its real
 * orbital position and "views" are just camera distance. This component lerps
 * the OrbitControls target between earth and the sun as you cross distance
 * bands, flies to selections, and reports the effective view mode for the HUD.
 */
export function CameraDirector({ selection, facilityPos, controls, pathView, pathFrame, onModeChange }: Props) {
  const camera = useThree((s) => s.camera);
  const earth = useMemo(() => getEarthPos(), []);
  const goal = useRef<{ pos: THREE.Vector3 | null; target: THREE.Vector3 }>({
    pos: null,
    target: earth.clone(),
  });
  const animating = useRef(false);
  const mode = useRef<ViewMode>("earth");
  // controls instance we've attached the user-input cancel listener to
  const wiredTo = useRef<OrbitControlsImpl | null>(null);
  // last pathView counter we've consumed — selecting a different craft
  // must NOT re-fire the path overview just because it's still nonzero
  const seenPathView = useRef(0);
  // whether the path overview is currently the active camera goal —
  // toggling the frame re-fits only while this is true
  const overviewShown = useRef(false);
  const lastFrame = useRef<PathFrame>(pathFrame);

  // Selection -> fly camera + retarget
  useEffect(() => {
    overviewShown.current = false;
    if (selection?.type === "facility" && facilityPos) {
      const out = facilityPos.clone().sub(earth).normalize();
      goal.current = {
        pos: facilityPos.clone().add(out.multiplyScalar(1.6)),
        target: facilityPos.clone(),
      };
      animating.current = true;
    } else if (selection?.type === "spacecraft") {
      const craft = EPHEMERIS.spacecraft[selection.id];
      if (craft) {
        const [x, y, z] = positionAt(craft.points, toJD(new Date()));
        // pushed position matches where the node actually renders — the raw
        // point can sit inside a planet's keep-out bubble (JWST ~0.5 from
        // earth) which made the camera target the globe instead
        const p = pushOutOfPlanets(eclToThree(x, y, z));
        // near-earth craft: offset away from earth so the globe can't
        // occlude; distant craft: sun-radial + up as before
        const offset =
          p.distanceTo(earth) < 8
            ? p
                .clone()
                .sub(earth)
                .normalize()
                .multiplyScalar(3.2)
                .add(new THREE.Vector3(0, 0.8, 0))
            : p
                .clone()
                .normalize()
                .multiplyScalar(3.2)
                .add(new THREE.Vector3(0, 1.4, 0));
        goal.current = { pos: p.clone().add(offset), target: p };
        animating.current = true;
      }
    } else if (selection?.type === "planet") {
      const p = EPHEMERIS.planets[selection.id];
      if (p) {
        const [x, y, z] = positionAt(p.points, toJD(new Date()));
        const pos = eclToThree(x, y, z);
        // sun-radial + up, distance scaled to the planet's rendered size
        const offset = pos
          .clone()
          .normalize()
          .multiplyScalar(p.radius * 3.5 + 2)
          .add(new THREE.Vector3(0, p.radius * 1.2 + 0.6, 0));
        goal.current = { pos: pos.clone().add(offset), target: pos };
        animating.current = true;
      }
    } else if (selection?.type === "moon") {
      const parent = EPHEMERIS.planets[selection.planet];
      if (parent) {
        const pos = moonWorldPos(selection.planet, selection.index);
        const [x, y, z] = positionAt(parent.points, toJD(new Date()));
        const ppos = eclToThree(x, y, z);
        // offset radially out from the parent so the planet can't occlude
        const offset = pos
          .clone()
          .sub(ppos)
          .normalize()
          .multiplyScalar(1.6)
          .add(new THREE.Vector3(0, 0.5, 0));
        goal.current = { pos: pos.clone().add(offset), target: pos };
        animating.current = true;
      }
    } else if (selection?.type === "earth") {
      goal.current = {
        pos: earth.clone().add(new THREE.Vector3(0, 0.8, 3.0)),
        target: earth.clone(),
      };
      animating.current = true;
    } else {
      // deselected: stop any in-flight camera move; target retargets by band
      animating.current = false;
      goal.current.pos = null;
    }
  }, [selection, facilityPos, earth]);

  // "View flight path" -> pull back far enough to frame the whole trajectory.
  // Also re-fits when the frame toggles while the overview is up.
  useEffect(() => {
    const clicked = pathView !== seenPathView.current;
    const frameChanged = lastFrame.current !== pathFrame;
    seenPathView.current = pathView;
    lastFrame.current = pathFrame;
    if (!clicked && !(frameChanged && overviewShown.current)) return;
    if (selection?.type !== "spacecraft") return;
    const craft = EPHEMERIS.spacecraft[selection.id];
    if (!craft) return;
    // same transform the rendered trajectory uses (helio or earth-relative)
    const pts = trajectoryScenePoints(craft.points, pathFrame);
    const box = new THREE.Box3();
    for (const p of pts) box.expandByPoint(p);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const persp = camera as THREE.PerspectiveCamera;
    const fit =
      sphere.radius /
      (Math.tan((persp.fov * Math.PI) / 360) * Math.min(1, persp.aspect));
    // dominant plane normal via Newell's method -> view the disc face-on
    // instead of edge-on; degenerate (near-straight) paths get ecliptic north
    const normal = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      a.copy(pts[i]).sub(center);
      b.copy(pts[(i + 1) % pts.length]).sub(center);
      normal.x += (a.y - b.y) * (a.z + b.z);
      normal.y += (a.z - b.z) * (a.x + b.x);
      normal.z += (a.x - b.x) * (a.y + b.y);
    }
    if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
    normal.normalize();
    if (normal.y < 0) normal.negate(); // always look from ecliptic north
    goal.current = {
      pos: center.clone().add(normal.multiplyScalar(fit * 1.25)),
      target: center,
    };
    overviewShown.current = true;
    animating.current = true;
  }, [pathView, pathFrame, selection, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;

    // user grabbing the controls cancels any in-flight fly-to
    if (wiredTo.current !== c) {
      wiredTo.current = c;
      c.addEventListener("start", () => {
        animating.current = false;
        goal.current.pos = null;
      });
    }

    const k = 1 - Math.pow(0.002, dt); // damped approach
    const camToEarth = camera.position.distanceTo(earth);

    // --- retarget by proximity when nothing (or just earth) is selected ---
    if (!selection || selection.type === "earth") {
      const distToEarth = c.target.distanceTo(earth);
      // close in: glide the orbit target back to earth's CENTER — a facility
      // leaves it on the surface (~0.95 out), which orbits the lab not earth
      if (camToEarth < EARTH_NEAR && distToEarth > 0.4) {
        goal.current.target.copy(earth);
      } else if (camToEarth > EARTH_FAR && distToEarth < 5) {
        goal.current.target.copy(ORIGIN);
      }
      // easing the target toward its goal keeps retargets smooth
      c.target.lerp(goal.current.target, k);
    }

    // --- fly-to animation for selections ---
    if (animating.current) {
      if (goal.current.pos) camera.position.lerp(goal.current.pos, k);
      c.target.lerp(goal.current.target, k);
      const posDone =
        !goal.current.pos || camera.position.distanceTo(goal.current.pos) < 0.05;
      const tgtDone = c.target.distanceTo(goal.current.target) < 0.05;
      if (posDone && tgtDone) animating.current = false;
    }

    // --- min zoom distance depends on what we're orbiting ---
    const targetNearEarth = c.target.distanceTo(earth) < 5;
    const targetNearSun = c.target.length() < 5;
    c.minDistance = targetNearEarth ? 1.3 : targetNearSun ? 12 : 1.0;

    // --- report view mode for HUD + marker visibility ---
    const m: ViewMode = camToEarth < MODE_SPLIT ? "earth" : "system";
    if (m !== mode.current) {
      mode.current = m;
      onModeChange(m);
    }

    c.update();
  });

  return null;
}
