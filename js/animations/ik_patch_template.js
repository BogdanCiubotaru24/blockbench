/**
 * IK Constraint projection patch (template).
 *
 * This file DOES NOT change anything by default. It exposes one function:
 *   window.IKConstraints.installProjectionHook(hookFn)
 *
 * You can call it from the console or from a small init script once you know
 * where your solver loop computes per-joint q_rel rotations.
 *
 * Example usage (pseudo):
 *   IKConstraints.installProjectionHook(({joint, q_rel}) => {
 *     if (joint.constraint?.type === 'hinge') {
 *       return IKConstraints.clampHinge(q_rel, joint.constraint.axis, joint.constraint.min, joint.constraint.max);
 *     } else if (joint.constraint?.type === 'ball') {
 *       const c = joint.constraint;
 *       return IKConstraints.clampBall(q_rel, c.axis, c.swingX, c.swingY, c.twistMin, c.twistMax);
 *     }
 *     return q_rel;
 *   });
 *
 * Then, in your IK step, call:
 *   q_rel = IKConstraints.__project(q_rel, joint);
 *   // ...apply q_rel...
 *
 * This keeps the solver clean, and the projection logic centralized.
 */

(function (global) {
  if (!global.IKConstraints) {
    console.warn("[IKConstraints] Load ik_constraints.js before ik_patch_template.js");
    global.IKConstraints = {};
  }
  let projectFn = (ctx) => ctx.q_rel;
  function installProjectionHook(fn) {
    if (typeof fn === 'function') {
      projectFn = fn;
      console.log("[IKConstraints] Projection hook installed.");
    } else {
      console.warn("[IKConstraints] installProjectionHook expects a function");
    }
  }
  function __project(q_rel, joint) {
    try {
      return projectFn({ q_rel, joint });
    } catch (e) {
      console.warn("[IKConstraints] Projection hook error:", e);
      return q_rel;
    }
  }
  global.IKConstraints.installProjectionHook = installProjectionHook;
  global.IKConstraints.__project = __project;
})(window);
