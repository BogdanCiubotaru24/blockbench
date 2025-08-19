// Node/CommonJS variant of the constraint helpers (no globals).
const THREE = require('three');

function basisFromAxis(axis) {
  const e3 = axis.clone().normalize();
  const tmp = Math.abs(e3.x) < 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
  const e1 = tmp.clone().cross(e3).normalize();
  const e2 = e3.clone().cross(e1).normalize();
  return { e1, e2, e3 };
}

function swingTwistDecomposition(q_rel, twistAxis) {
  const q = q_rel.clone().normalize();
  const r = new THREE.Vector3(q.x, q.y, q.z);
  const proj = twistAxis.clone().multiplyScalar(r.dot(twistAxis));
  const q_twist = new THREE.Quaternion(proj.x, proj.y, proj.z, q.w).normalize();
  const q_swing = q.clone().multiply(q_twist.clone().invert()).normalize();
  return { swing: q_swing, twist: q_twist };
}

function clampHinge(q_rel, axis, min, max) {
  const { twist } = swingTwistDecomposition(q_rel, axis);
  const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
  const ang = 2 * Math.atan2(tvec.dot(axis), twist.w);
  const clamped = THREE.MathUtils.clamp(ang, min, max);
  return new THREE.Quaternion().setFromAxisAngle(axis, clamped).normalize();
}

function clampBall(q_rel, axis, swingX, swingY, twistMin, twistMax) {
  const { swing, twist } = swingTwistDecomposition(q_rel, axis);
  const swv = new THREE.Vector3(swing.x, swing.y, swing.z);
  const ang = 2 * Math.atan2(swv.length(), swing.w);
  let sx = 0, sy = 0;
  if (ang > 1e-8) {
    const swingAxis = swv.normalize();
    const { e1, e2 } = basisFromAxis(axis);
    sx = ang * swingAxis.dot(e1);
    sy = ang * swingAxis.dot(e2);
    const nx = sx / swingX, ny = sy / swingY;
    const d = nx*nx + ny*ny;
    if (d > 1.0) {
      const scale = 1 / Math.sqrt(d);
      sx *= scale; sy *= scale;
    }
    const dir = new THREE.Vector3().addScaledVector(e1, sx).addScaledVector(e2, sy);
    const newAng = dir.length();
    const newAxis = newAng < 1e-8 ? new THREE.Vector3(1,0,0) : dir.clone().multiplyScalar(1/newAng);
    const swNew = new THREE.Quaternion().setFromAxisAngle(newAxis, newAng);

    const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
    const twistAng = 2 * Math.atan2(tvec.dot(axis), twist.w);
    const twClamped = THREE.MathUtils.clamp(twistAng, twistMin, twistMax);
    const twNew = new THREE.Quaternion().setFromAxisAngle(axis, twClamped);
    return swNew.multiply(twNew).normalize();
  } else {
    const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
    const twistAng = 2 * Math.atan2(tvec.dot(axis), twist.w);
    const twClamped = THREE.MathUtils.clamp(twistAng, twistMin, twistMax);
    return new THREE.Quaternion().setFromAxisAngle(axis, twClamped).normalize();
  }
}

module.exports = {
  basisFromAxis,
  swingTwistDecomposition,
  clampHinge,
  clampBall
};
