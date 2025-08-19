(function () {
  if (!window.IKConstraints) {
    console.warn("[ik_install_hook] Load ik_constraints.js before ik_install_hook.js");
    return;
  }
  if (!window.THREE) {
    console.warn("[ik_install_hook] THREE is not on window. Load three.js first.");
    return;
  }

  function axisFrom(a) {
    if (!a) return new THREE.Vector3(1, 0, 0); // fallback
    if (a.isVector3) return a.clone().normalize();
    if (Array.isArray(a) && a.length === 3) return new THREE.Vector3(a[0], a[1], a[2]).normalize();
    if (typeof a.x === 'number' && typeof a.y === 'number' && typeof a.z === 'number') {
      return new THREE.Vector3(a.x, a.y, a.z).normalize();
    }
    return new THREE.Vector3(1, 0, 0);
  }

  IKConstraints.installProjectionHook(({ joint, q_rel }) => {
    const c = joint && joint.constraint;
    if (!c) return q_rel;

    if (c.type === 'hinge') {
      const axis = axisFrom(c.axis);
      return IKConstraints.clampHinge(q_rel, axis, c.min, c.max);
    }
    if (c.type === 'ball') {
      const axis = axisFrom(c.axis);
      return IKConstraints.clampBall(q_rel, axis, c.swingX, c.swingY, c.twistMin, c.twistMax);
    }
    return q_rel;
  });

  console.log("[ik_install_hook] Projection hook installed.");
})();
