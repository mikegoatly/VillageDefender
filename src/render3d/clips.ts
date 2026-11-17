// Animation clips built in code for moves the Kenney rig has no clip for. They sit beside the
// model's own clips (looked up first by name) and are baked to pose tables like any other.
//
// The Mini rig: root > legs, torso > arms, head. The bind pose is a T-pose with the right arm
// along -X, the model faces +Z. A held weapon sits across the fist, so with the arm hanging at
// the side (rest: 45° down) it points straight ahead. The arm is one rigid bone: turning it about
// Y would swing the weapon sideways, so a thrust only raises it about Z (the weapon stays pointing
// ahead) and the drive forward comes from the root moving and the body leaning into it.

import * as THREE from 'three';

const deg = THREE.MathUtils.degToRad;
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** Rotation applying `first` (about its axis) then `then`: [axis, degrees] pairs. */
function rot(...turns: [keyof typeof AXIS, number][]): THREE.Quaternion {
  const q = new THREE.Quaternion();
  for (const [axis, d] of turns) q.premultiply(new THREE.Quaternion().setFromAxisAngle(AXIS[axis], deg(d)));
  return q;
}

/**
 * One key pose, in degrees: the right arm's drop below horizontal (rest 45), the torso's twist
 * (about Y, positive turns the right shoulder forward) and lean (about X, positive is forward),
 * each leg's swing (about X, negative is forward); plus the root's forward shift in model units
 * (the character is drawn at 1.5×).
 */
interface KeyPose {
  t: number;
  arm: number;
  /** Spear tip tilt (about the arm, negative raises the tip). */
  tilt: number;
  twist: number;
  lean: number;
  legLeft: number;
  legRight: number;
  root: number;
}

const REST: Omit<KeyPose, 't'> = { arm: 45, tilt: 0, twist: 0, lean: 0, legLeft: 0, legRight: 0, root: 0 };
/**
 * Full stretch: spear level at the waist (raised much higher, the elbowless arm sticks out like a
 * wing), right shoulder turned in, leaning onto the left foot.
 */
const STRETCH: Omit<KeyPose, 't'> = { arm: 24, tilt: 0, twist: 18, lean: 16, legLeft: -35, legRight: 28, root: 0.28 };

/**
 * Spear thrust, timed to the spear (hit at 0.14 s of 0.35 s): draw back with the spear tip cocked
 * up, the right shoulder turned away and the weight on the back foot, drive out from the hip to
 * full stretch at the hit, hold there a moment, then settle back to rest.
 */
export const THRUST_KEYS: KeyPose[] = [
  { t: 0, ...REST },
  { t: 0.08, arm: 42, tilt: -14, twist: -18, lean: -8, legLeft: -6, legRight: 12, root: -0.1 },
  { t: 0.14, ...STRETCH },
  { t: 0.2, ...STRETCH },
  { t: 0.35, ...REST },
];

/** The time of the thrust's full stretch (when the hit lands). */
export const THRUST_HIT = 0.14;

function thrustClip(): THREE.AnimationClip {
  const times = THRUST_KEYS.map((k) => k.t);
  const quats = (pick: (k: KeyPose) => THREE.Quaternion) => THRUST_KEYS.flatMap((k) => pick(k).toArray());
  const torso = (k: KeyPose) => rot(['y', k.twist], ['x', k.lean]);
  const tracks = [
    new THREE.VectorKeyframeTrack('root.position', times, THRUST_KEYS.flatMap((k) => [0, 0, k.root])),
    new THREE.QuaternionKeyframeTrack('torso.quaternion', times, quats(torso)),
    // The head and the spear arm turn back against the torso's twist, so the knight keeps
    // looking at his target and the spear keeps pointing at it.
    new THREE.QuaternionKeyframeTrack('head.quaternion', times, quats((k) => torso(k).invert())),
    new THREE.QuaternionKeyframeTrack('arm-right.quaternion', times, quats((k) => rot(['x', k.tilt], ['z', k.arm]).premultiply(torso(k).invert()))),
    // The shield arm stays at rest.
    new THREE.QuaternionKeyframeTrack('arm-left.quaternion', times, quats(() => rot(['z', -45]))),
    new THREE.QuaternionKeyframeTrack('leg-left.quaternion', times, quats((k) => rot(['x', k.legLeft]))),
    new THREE.QuaternionKeyframeTrack('leg-right.quaternion', times, quats((k) => rot(['x', k.legRight]))),
  ];
  return new THREE.AnimationClip('thrust', times[times.length - 1], tracks);
}

/** Clips made here, by name; each is built once on first use. */
const BUILDERS: Record<string, () => THREE.AnimationClip> = { thrust: thrustClip };
const built = new Map<string, THREE.AnimationClip>();

/** A clip by name: a code-built one if there is one, else the model's own (undefined if neither). */
export function findClip(animations: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  const build = BUILDERS[name];
  if (!build) return animations.find((c) => c.name === name);
  let clip = built.get(name);
  if (!clip) built.set(name, (clip = build()));
  return clip;
}
