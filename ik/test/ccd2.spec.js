const THREE = require('three');
const fc = require('fast-check');
const { TwoBoneChain } = require('../src/solvers/ccd2');

describe('TwoBoneChain CCD with hinge constraints', () => {
  it('solves random truly-reachable planar targets (respecting both elbow and shoulder limits)', () => {
    const L1 = 1.0, L2 = 0.7;
    const chain = new TwoBoneChain(L1, L2, {
      axis0: new THREE.Vector3(0,0,1),
      axis1: new THREE.Vector3(0,0,1),
      lim0: { min: -Math.PI*0.9, max: Math.PI*0.9 }, // shoulder
      lim1: { min: 0,              max: Math.PI*0.95 } // elbow flexion
    });

    // Small safety margins off the hard limits
    const M_TH = 0.03; // shoulder margin (rad)
    const M_PH = 0.03; // elbow margin (rad)
    const thMin = chain.lim0.min + M_TH, thMax = chain.lim0.max - M_TH;
    const phMin = chain.lim1.min + M_PH, phMax = chain.lim1.max - M_PH;

    const TOL = 1e-2;
    const MAX_ITERS = 160;

    // Generate reachable targets by sampling joint-space angles (phi, theta)
    fc.assert(fc.property(
      fc.tuple(
        fc.double({ min: phMin, max: phMax, noNaN: true, noDefaultInfinity: true }), // elbow φ
        fc.double({ min: thMin, max: thMax, noNaN: true, noDefaultInfinity: true })  // shoulder θ
      ),
      ([phi, theta]) => {
        // r depends only on phi (law of cosines)
        const r = Math.sqrt(L1*L1 + L2*L2 + 2*L1*L2*Math.cos(phi));
        const thetaOffset = Math.atan2(L2 * Math.sin(phi), L1 + L2 * Math.cos(phi));
        const thetaTarget = theta + thetaOffset;

        const target = new THREE.Vector3(
          r * Math.cos(thetaTarget),
          r * Math.sin(thetaTarget),
          0
        );

        // Reset pose per trial
        chain.q0.set(0,0,0,1);
        chain.q1.set(0,0,0,1);

        const res = chain.solve(target, { maxIters: MAX_ITERS, tol: TOL });
        return res.err <= TOL;
      }
    ), { numRuns: 150 });
  });

  it('solves an out-of-plane target with orthogonal hinge axes', () => {
    const L1 = 1.0, L2 = 0.7;
    const chain = new TwoBoneChain(L1, L2, {
      axis0: new THREE.Vector3(0,0,1), // shoulder yaw
      axis1: new THREE.Vector3(0,1,0), // elbow flexion about Y
      lim0: { min: -Math.PI*0.9, max: Math.PI*0.9 },
      lim1: { min: 0,              max: Math.PI*0.95 }
    });

    const phi = 0.9;
    const theta = -0.6;
    chain.q0.setFromAxisAngle(chain.axis0, theta);
    chain.q1.setFromAxisAngle(chain.axis1, phi);
    const { p2 } = chain.fk();

    chain.q0.set(0,0,0,1);
    chain.q1.set(0,0,0,1);

    const res = chain.solve(p2, { maxIters: 200, tol: 1e-2 });
    expect(res.err).toBeLessThan(1e-2);
  });
});
