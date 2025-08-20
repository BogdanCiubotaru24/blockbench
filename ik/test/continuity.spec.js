const THREE = require('three');
const { TwoBoneChain } = require('../src/solvers/ccd2');

function angleOf(q, axis) {
  // Extract signed angle around the hinge axis
  // Equivalent to projecting the rotation on the axis
  const v = new THREE.Vector3(q.x, q.y, q.z);
  const s = v.dot(axis);
  return 2 * Math.atan2(s, q.w);
}

describe('Continuity: circle path has no flips and small per-frame deltas', () => {
  it('keeps deltas bounded and errors small along a circle', () => {
    const L1 = 1.0, L2 = 0.7;
    const chain = new TwoBoneChain(L1, L2, {
      axis0: new THREE.Vector3(0,0,1),
      axis1: new THREE.Vector3(0,0,1),
      lim0: { min: -Math.PI*0.9, max: Math.PI*0.9 },
      lim1: { min: 0,             max: Math.PI*0.95 }
    });

    // Circle in front, radius chosen to be safely reachable
    const center = new THREE.Vector3(0.7, 0.1, 0);
    const radius = 0.4;
    const frames = 180;
    const TOL = 2.5e-2;

    // Start from a reasonable pose
    chain.q0.setFromAxisAngle(chain.axis0, 0.4);
    chain.q1.setFromAxisAngle(chain.axis1, 0.8);

    let lastTh = angleOf(chain.q0, chain.axis0);
    let lastPh = angleOf(chain.q1, chain.axis1);

    let maxDelta = 0;

    for (let i=0; i<frames; i++) {
      const t = i / frames;
      const ang = 2*Math.PI * t;
      const target = new THREE.Vector3(
        center.x + radius*Math.cos(ang),
        center.y + radius*Math.sin(ang),
        0
      );

      const res = chain.solve(target, { maxIters: 400, tol: TOL });
      expect(res.err).toBeLessThanOrEqual(TOL);

      const th = angleOf(chain.q0, chain.axis0);
      const ph = angleOf(chain.q1, chain.axis1);
      const dth = Math.abs(th - lastTh);
      const dph = Math.abs(ph - lastPh);

      // wrap small discontinuities across ±π if needed
      const wrap = (d) => Math.min(d, Math.abs(d - 2*Math.PI), Math.abs(d + 2*Math.PI));
      maxDelta = Math.max(maxDelta, wrap(dth), wrap(dph));

      lastTh = th; lastPh = ph;
    }

    // no wild spikes
    expect(maxDelta).toBeLessThan(1.1); // < ~63°
  });
});
