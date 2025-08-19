(function () {
  if (!window.IKConstraints) {
    console.warn("[ik_install_hook] Load ik_constraints.js first");
    return;
  }

  // Map your repo's constraint schema → clamp call
  // Axis arrays -> THREE.Vector3; angles must be radians.
  IKConstraints.installProjectionHook(({ joint, q_rel }) => {
    const c = joint && joint.constraint;
    if (!c) return q_rel;

    // Normalize axis from array if needed
    function axisFrom(caxis) {
      if (caxis && typeof caxis.x === 'number') return caxis.clone().normalize();
      if (Array.isArray(caxis) && caxis.length === 3) {
        return new THREE.Vector3(caxis[0], caxis[1], caxis[2]).normalize();
      }
      // default: bone local X as twist axis (fallback)
      return new THREE.Vector3(1,0,0);
    }

    if (c.type === 'hinge') {
      const axis = axisFrom(c.axis);
      return IKConstraints.clampHinge(q_rel, axis, c.min, c.max);
    } else if (c.type === 'ball') {
      const axis = axisFrom(c.axis);
      return IKConstraints.clampBall(q_rel, axis, c.swingX, c.swingY, c.twistMin, c.twistMax);
    }
    return q_rel;
  });

  console.log("[ik_install_hook] Projection hook installed.");
})();
