# IK Test Harness (standalone)

This folder contains a **standalone Node** project you can use to validate your constraint math and a simple 2-bone CCD solver.

## Install
```bash
cd ik
npm install
```

## Run tests
```bash
npm test
```
- `constraints.spec.js` checks that `clampHinge` and `clampBall` keep rotations inside limits (property-based with fast-check).
- `ccd2.spec.js` checks a minimal 2-bone planar chain converges to random reachable targets.

## Produce a heatmap (CSV)
```bash
npm run heatmap
```
This writes `out/heatmap.csv` with (x,y,err,iters,ok). Open it in your favorite plotting tool to see the field of successful solutions and error levels.

## How to plug this into your repo
1. Copy `js/animations/ik_constraints.js` into your repo (same path).
2. Add to `index.html`:
   ```html
   <script src="js/animations/ik_constraints.js"></script>
   <script src="js/animations/ik_patch_template.js"></script>
   ```
3. In your IK loop, after computing each joint's **relative** quaternion `q_rel` (child relative to parent, in joint space), project it:
   ```js
   q_rel = IKConstraints.__project(q_rel, joint);
   // then write q_rel back and propagate transforms
   ```
4. During init, install a projection hook:
   ```js
   IKConstraints.installProjectionHook(({ joint, q_rel }) => {
     if (joint.constraint?.type === 'hinge') {
       return IKConstraints.clampHinge(q_rel, joint.constraint.axis, joint.constraint.min, joint.constraint.max);
     } else if (joint.constraint?.type === 'ball') {
       const c = joint.constraint;
       return IKConstraints.clampBall(q_rel, c.axis, c.swingX, c.swingY, c.twistMin, c.twistMax);
     }
     return q_rel;
   });
   ```

### Notes
- Axes should be defined in the joint's **rest (local) frame**.
- Keep units in **radians**.
- For a 2-bone limb, make both joints `hinge` around the same axis (planar) and optionally add a small bias for your bend (pole) when choosing targets or when selecting the delta rotation axis.
