const fc = require('fast-check');
const THREE = require('three');
const { clampHinge, clampBall, swingTwistDecomposition, basisFromAxis } = require('../src/math/ik_constraints');

function randQuat(arbitrary) {
  return arbitrary.map((v) => {
    const ax = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    const ang = v[3];
    return new THREE.Quaternion().setFromAxisAngle(ax, ang);
  });
}

describe('IKConstraints: hinge clamp', () => {
  it('removes swing and clamps twist into [min,max]', () => {
    const arb = fc.array(fc.tuple(
      fc.double({min:-1,max:1}), fc.double({min:-1,max:1}), fc.double({min:-1,max:1}),
      fc.double({min:-Math.PI, max:Math.PI})
    ), {minLength: 200, maxLength: 200});

    return fc.assert(fc.property(arb, (arr) => {
      const axis = new THREE.Vector3(0,0,1);
      const min = -Math.PI/3, max = Math.PI/2;
      for (const v of arr) {
        const ax = new THREE.Vector3(v[0], v[1], v[2]).normalize();
        const ang = v[3];
        const q_rel = new THREE.Quaternion().setFromAxisAngle(ax, ang);
        const qc = clampHinge(q_rel, axis, min, max);
        const { swing, twist } = swingTwistDecomposition(qc, axis);
        // swing angle ~ 0
        const swv = new THREE.Vector3(swing.x, swing.y, swing.z);
        const swingAng = 2 * Math.atan2(swv.length(), swing.w);
        if (swingAng > 1e-5) return false;
        const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
        const twistAng = 2 * Math.atan2(tvec.dot(axis), twist.w);
        if (twistAng < min - 1e-6 || twistAng > max + 1e-6) return false;
      }
      return true;
    }));
  });
});

describe('IKConstraints: ball clamp', () => {
  it('keeps swing within elliptical cone and twist within [min,max]', () => {
    const arb = fc.array(fc.tuple(
      fc.double({min:-1,max:1}), fc.double({min:-1,max:1}), fc.double({min:-1,max:1}),
      fc.double({min:-Math.PI, max:Math.PI})
    ), {minLength: 200, maxLength: 200});

    return fc.assert(fc.property(arb, (arr) => {
      const axis = new THREE.Vector3(0,0,1);
      const swingX = Math.PI/4, swingY = Math.PI/6;
      const twistMin = -Math.PI/8, twistMax = Math.PI/8;
      const { e1, e2 } = basisFromAxis(axis);

      for (const v of arr) {
        const ax = new THREE.Vector3(v[0], v[1], v[2]).normalize();
        const ang = v[3];
        const q_rel = new THREE.Quaternion().setFromAxisAngle(ax, ang);
        const qc = clampBall(q_rel, axis, swingX, swingY, twistMin, twistMax);
        const { swing, twist } = swingTwistDecomposition(qc, axis);

        // Check swing ellipse
        const swv = new THREE.Vector3(swing.x, swing.y, swing.z);
        const swingAng = 2 * Math.atan2(swv.length(), swing.w);
        let sx=0, sy=0;
        if (swingAng > 1e-10) {
          const swingAxis = swv.clone().normalize();
          sx = swingAng * swingAxis.dot(e1);
          sy = swingAng * swingAxis.dot(e2);
        }
        const nx = sx / swingX, ny = sy / swingY;
        const d = nx*nx + ny*ny;
        if (d > 1.0005) return false;

        // Check twist range
        const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
        const twistAng = 2 * Math.atan2(tvec.dot(axis), twist.w);
        if (twistAng < twistMin - 1e-6 || twistAng > twistMax + 1e-6) return false;
      }
      return true;
    }));
  });
});
