/**
 * NASA 3D Resources GLBs served from public/models/spacecraft.
 * Craft not listed here keep the white-dot marker.
 * rotate: optional euler [x,y,z] tweak applied in model space (radians),
 * for models whose forward axis doesn't match the +Z velocity alignment.
 */
export const SPACECRAFT_MODELS: Record<
  string,
  { file: string; rotate?: [number, number, number] }
> = {
  voyager1: { file: "voyager1.glb" },
  voyager2: { file: "voyager2.glb" },
  pioneer10: { file: "pioneer10.glb" },
  pioneer11: { file: "pioneer10.glb" }, // Pioneer 11 flew the same bus
  parker: { file: "parker.glb" },
  cassini: { file: "cassini.glb" },
  juno: { file: "juno.glb" },
  kepler: { file: "kepler.glb" },
  jwst: { file: "jwst.glb" },
  soho: { file: "soho.glb" },
  stereo_a: { file: "stereo_a.glb" },
  maven: { file: "maven.glb" },
  osirisapex: { file: "osirisapex.glb" }, // OSIRIS-REx bus, renamed post-sample-return
  newhorizons: { file: "newhorizons.glb" }, // science.nasa.gov
  europaclipper: { file: "europaclipper.glb" }, // science.nasa.gov
  dart: { file: "dart.glb" }, // NASA 3D-print STL -> GLB, simplified
};
