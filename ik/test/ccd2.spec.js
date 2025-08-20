const THREE = require('three');
const fc = require('fast-check');
const { TwoBoneChain } = require('../src/solvers/ccd2');
const { swingTwistDecomposition, basisFromAxis } = require('../src/math/ik_constraints');

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

  it('clamps to hinge limits for unreachable targets', () => {
    const L1 = 1.0, L2 = 0.7;
    const chain = new TwoBoneChain(L1, L2, {
      axis0: new THREE.Vector3(0,0,1),
      axis1: new THREE.Vector3(0,0,1),
      lim0: { min: -Math.PI/4, max: Math.PI/4 },
      lim1: { min: 0, max: Math.PI*0.95 }
    });

    // Target requires shoulder rotation beyond max limit
    const phi = 0.5;
    const theta = Math.PI/2; // beyond shoulder limit
    chain.q0.setFromAxisAngle(chain.axis0, theta);
    chain.q1.setFromAxisAngle(chain.axis1, phi);
    const { p2 } = chain.fk();

    chain.q0.set(0,0,0,1);
    chain.q1.set(0,0,0,1);

    const res = chain.solve(p2, { maxIters: 200, tol: 1e-2 });
    expect(res.err).toBeGreaterThan(1e-2);
    const { twist } = swingTwistDecomposition(chain.q0, chain.axis0);
    const tvec = new THREE.Vector3(twist.x, twist.y, twist.z);
    const ang = 2 * Math.atan2(tvec.dot(chain.axis0), twist.w);
    expect(Math.abs(ang - chain.lim0.max)).toBeLessThan(1e-3);
  });
});

describe('TwoBoneChain CCD with ball constraints', () => {
  it('solves targets within ball joint limits', () => {
    const L1 = 1.0, L2 = 0.7;
    const chain = new TwoBoneChain(L1, L2, {
      joint0: { type: 'ball', axis: new THREE.Vector3(0,0,1), swingX: Math.PI/4, swingY: Math.PI/4, twistMin: -Math.PI/8, twistMax: Math.PI/8 },
      axis1: new THREE.Vector3(0,0,1),
      lim1: { min: 0, max: Math.PI*0.95 }
    });

    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), 0.2);
    const twist = new THREE.Quaternion().setFromAxisAngle(chain.axis0, 0.1);
    chain.q0 = swing.multiply(twist);
    const phi = 0.5;
    chain.q1.setFromAxisAngle(chain.axis1, phi);
    const { p2 } = chain.fk();

    chain.q0.set(0,0,0,1);
    chain.q1.set(0,0,0,1);

    const res = chain.solve(p2, { maxIters: 200, tol: 1e-2 });
    expect(res.err).toBeLessThan(1e-2);
  });

  it('clamps swing beyond ball limits', () => {
    const L1 = 1.0, L2 = 0.7;
    const swingY = Math.PI/6;
    const chain = new TwoBoneChain(L1, L2, {
      joint0: { type: 'ball', axis: new THREE.Vector3(0,0,1), swingX: Math.PI/4, swingY, twistMin: -Math.PI/8, twistMax: Math.PI/8 },
      axis1: new THREE.Vector3(0,0,1),
      lim1: { min: 0, max: Math.PI*0.95 }
    });

    const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), swingY*2); // beyond limit
    chain.q0 = swing;
    const phi = 0.5;
    chain.q1.setFromAxisAngle(chain.axis1, phi);
    const { p2 } = chain.fk();

    chain.q0.set(0,0,0,1);
    chain.q1.set(0,0,0,1);

    const res = chain.solve(p2, { maxIters: 200, tol: 1e-2 });
    expect(res.err).toBeGreaterThan(1e-2);
    const { swing: sw } = swingTwistDecomposition(chain.q0, chain.axis0);
    const swv = new THREE.Vector3(sw.x, sw.y, sw.z);
    const ang = 2 * Math.atan2(swv.length(), sw.w);
    let sy = 0;
    if (ang > 1e-8) {
      const swingAxis = swv.clone().normalize();
      const { e2 } = basisFromAxis(chain.axis0); // e2 aligns with +Y for axis Z
      sy = ang * swingAxis.dot(e2); // component along Y
    }
    expect(Math.abs(sy) - swingY).toBeLessThan(1e-3);
  });
});
