/**
 * Hinge-aware, warm-started 2-bone planar CCD solver.
 * - Root at origin, links rest along +X
 * - Joints are hinges about axis0, axis1 (default Z), so motion is planar in XY.
 */
const THREE = require('three');
const { clampHinge } = require('../math/ik_constraints');

function wrapAngleIntoLimits(angle, min, max) {
  // Bring 'angle' to an equivalent value (angle + 2πk) that lies inside [min, max] if possible.
  // If no equivalent exists (interval width < 2π), pick the one closest to 0 within [k1, k2].
  const twoPi = Math.PI * 2;
  const k1 = Math.ceil((min - angle) / twoPi);
  const k2 = Math.floor((max - angle) / twoPi);
  // Choose k in [k1, k2] closest to 0 (i.e., clamp 0 into that interval)
  const k = Math.max(k1, Math.min(0, k2));
  const a = angle + twoPi * k;
  // Final safety clamp against tiny FP drift
  return THREE.MathUtils.clamp(a, min, max);
}

class TwoBoneChain {
  constructor(L1, L2, opts = {}) {
    this.L1 = L1; this.L2 = L2;
    this.axis0 = (opts.axis0 || new THREE.Vector3(0,0,1)).clone().normalize();
    this.axis1 = (opts.axis1 || new THREE.Vector3(0,0,1)).clone().normalize();
    this.lim0 = opts.lim0 || { min: -Math.PI*0.75, max: Math.PI*0.75 }; // shoulder range
    this.lim1 = opts.lim1 || { min: 0.0, max: Math.PI*0.95 };           // elbow flexion

    this.q0 = new THREE.Quaternion(); // local joint rotations
    this.q1 = new THREE.Quaternion();
    this.root = new THREE.Vector3(0,0,0);

    // Step tuning
    this.gain = 0.6;                   // damp each step to avoid overshoot near limits
    this.maxStepRad = Math.PI / 10;    // max ~18 degrees per iteration
  }

  // Forward kinematics
  fk() {
    const xAxis = new THREE.Vector3(1,0,0);
    const q0w = this.q0.clone();
    const p0 = this.root.clone();
    const p1 = p0.clone().add(xAxis.clone().applyQuaternion(q0w).multiplyScalar(this.L1));
    const q1w = q0w.clone().multiply(this.q1);
    const p2 = p1.clone().add(xAxis.clone().applyQuaternion(q1w).multiplyScalar(this.L2));
    return { p0, p1, p2, q0w, q1w };
  }

  /**
   * Analytic warm start for a planar 2-bone chain.
   * Elbow angle (phi) from law of cosines; shoulder angle (theta) by triangle geometry.
   * IMPORTANT: wrap theta by ±2π into [lim0.min, lim0.max] (not just clamp).
   */
  warmStart(target) {
    const L1 = this.L1, L2 = this.L2;
    const reach = L1 + L2;
    const r = Math.min(reach - 1e-5, Math.max(1e-5, target.length()));

    let cosPhi = (r*r - L1*L1 - L2*L2) / (2 * L1 * L2);
    cosPhi = Math.max(-1, Math.min(1, cosPhi));
    let phi = Math.acos(cosPhi); // elbow flexion (>=0)
    // Respect elbow hinge limits
    phi = THREE.MathUtils.clamp(phi, this.lim1.min, this.lim1.max);

    const thetaTarget = Math.atan2(target.y, target.x);
    const thetaOffset  = Math.atan2(L2 * Math.sin(phi), L1 + L2 * Math.cos(phi));
    const thetaRaw     = thetaTarget - thetaOffset;

    // Wrap theta into the legal shoulder interval by adding/subtracting 2π
    const theta = wrapAngleIntoLimits(thetaRaw, this.lim0.min, this.lim0.max);

    this.q0.setFromAxisAngle(this.axis0, theta);
    this.q1.setFromAxisAngle(this.axis1, phi);

    // Final strict clamp (no-op if already inside)
    this.q0 = clampHinge(this.q0, this.axis0, this.lim0.min, this.lim0.max);
    this.q1 = clampHinge(this.q1, this.axis1, this.lim1.min, this.lim1.max);
  }

  // Rotate a joint strictly about its hinge axis to align the chain toward target
  rotateJointAboutHinge(jIndex, target) {
    const { p0, p1, p2, q0w } = this.fk();

    const parent_qw = (jIndex === 1) ? q0w : new THREE.Quaternion();
    const jointAxisLocal = (jIndex === 1) ? this.axis1 : this.axis0;
    const jointPos = (jIndex === 1) ? p1 : p0;

    // World hinge axis
    const axis_w = jointAxisLocal.clone().applyQuaternion(parent_qw).normalize();

    // Current and target vectors from the joint, projected onto hinge plane
    const v_cur = p2.clone().sub(jointPos);
    const v_tar = target.clone().sub(jointPos);

    const v_cur_proj = v_cur.clone().sub(axis_w.clone().multiplyScalar(axis_w.dot(v_cur)));
    const v_tar_proj = v_tar.clone().sub(axis_w.clone().multiplyScalar(axis_w.dot(v_tar)));

    const n_cur = v_cur_proj.length();
    const n_tar = v_tar_proj.length();
    if (n_cur < 1e-9 || n_tar < 1e-9) return; // degenerate

    // Signed angle around hinge axis
    const a = v_cur_proj.clone().multiplyScalar(1 / n_cur);
    const b = v_tar_proj.clone().multiplyScalar(1 / n_tar);
    const sin = axis_w.dot(a.clone().cross(b));
    const cos = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    let ang = Math.atan2(sin, cos);

    // Damp and clamp step size
    ang = THREE.MathUtils.clamp(ang * this.gain, -this.maxStepRad, this.maxStepRad);

    // Apply world-space delta around hinge axis, convert to joint-local
    const delta_world = new THREE.Quaternion().setFromAxisAngle(axis_w, ang);
    const delta_local = parent_qw.clone().invert().multiply(delta_world).multiply(parent_qw);

    if (jIndex === 1) {
      this.q1 = delta_local.multiply(this.q1).normalize();
      this.q1 = clampHinge(this.q1, this.axis1, this.lim1.min, this.lim1.max);
    } else {
      this.q0 = delta_local.multiply(this.q0).normalize();
      this.q0 = clampHinge(this.q0, this.axis0, this.lim0.min, this.lim0.max);
    }
  }

  iterate(target) {
    // End → root
    this.rotateJointAboutHinge(1, target); // elbow
    this.rotateJointAboutHinge(0, target); // shoulder
  }

  solve(target, { maxIters = 120, tol = 1e-2 } = {}) {
    this.warmStart(target);
    for (let i = 0; i < maxIters; i++) {
      this.iterate(target);
      const { p2 } = this.fk();
      const err = p2.distanceTo(target);
      if (err < tol) return { ok: true, iters: i + 1, err };
    }
    const { p2 } = this.fk();
    return { ok: false, iters: maxIters, err: p2.distanceTo(target) };
  }
}

module.exports = { TwoBoneChain };
