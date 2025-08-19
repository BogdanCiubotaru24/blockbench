// js/animations/ik_test_runner.js
(function () {
  if (!window.THREE) return console.warn('[ik_test_runner] THREE missing');

  function findSelectedNullAndAnimator() {
    const sel = Outliner.selected && Outliner.selected[0];
    if (!(sel && sel instanceof NullObject)) {
      Blockbench.showQuickMessage('Select a Null Object (IK controller) in the outliner first.');
      return null;
    }
    // find an animator instance for this null in the current animation
    let anim = null;
    if (Animation && Animation.selected && Animation.selected.animators) {
      for (const a of Object.values(Animation.selected.animators)) {
        if (a instanceof NullObjectAnimator && a.uuid === sel.uuid) { anim = a; break; }
      }
    }
    if (!anim) {
      Blockbench.showQuickMessage('No NullObjectAnimator found for selected null in this animation.');
      return null;
    }
    return { nullObj: sel, anim };
  }

  function setNullWorldPosition(nullObj, worldV3) {
    const parent = nullObj.mesh.parent || scene; // parent Object3D
    const local = worldV3.clone();
    parent.worldToLocal(local);
    nullObj.mesh.position.copy(local);
    nullObj.mesh.updateMatrixWorld();
  }

  function runGridSweep({ anim, nullObj, center, halfSpan = 0.9, steps = 25 }) {
    // halfSpan is a fraction of approximate reach; steps is samples per axis
    // Approx reach by summing bone segment lengths once:
    let approxReach = 0.0;
    (function estimateReach() {
      const bones = [];
      let current = [ ...Group.all, ...Locator.all ].find(n => n.uuid == nullObj.ik_target)?.parent;
      const source = nullObj.ik_source ? [ ...Group.all ].find(n => n.uuid == nullObj.ik_source) : nullObj.parent;
      if (!source) return;
      while (current && current !== source) { if (current instanceof Group) bones.push(current); current = current.parent; }
      if (nullObj.ik_source && source instanceof Group) bones.push(source);
      bones.reverse();
      for (let i = 0; i < bones.length; i++) {
        const A = bones[i].mesh.getWorldPosition(new THREE.Vector3());
        const B = (bones[i+1] ? bones[i+1] : nullObj).getWorldCenter ? new THREE.Vector3().copy(
          (bones[i+1] ? bones[i+1] : nullObj).getWorldCenter(false)
        ) : bones[i+1]?.mesh.getWorldPosition(new THREE.Vector3()) || A;
        approxReach += A.distanceTo(B);
      }
      approxReach = approxReach || 1;
    })();

    const span = approxReach * halfSpan;
    const N = Math.max(3, steps|0);
    const xs = [...Array(N)].map((_,i)=> -span + (2*span)*(i/(N-1)));
    const ys = xs.slice(); // same sampling on Y
    const z = center.z;    // sweep in plane parallel to XY at center.z

    const rows = [];
    rows.push(['ix','iy','x','y','z','posErr','ok'].join(','));
    let pass = 0, fail = 0;

    // remember original pos
    const origPos = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const p = new THREE.Vector3(center.x + xs[ix], center.y + ys[iy], z);
        setNullWorldPosition(nullObj, p);

        // Run one solve with metrics
        const res = anim.displayIK(true); // we patched displayIK to return __metrics
        const m = (res && res.__metrics) || { posErr: Number.POSITIVE_INFINITY, ok: false };

        rows.push([ix,iy,p.x.toFixed(4),p.y.toFixed(4),p.z.toFixed(4), m.posErr.toFixed(6), m.ok?1:0].join(','));
        if (m.ok) pass++; else fail++;
      }
    }

    // restore original null position and one more refresh
    setNullWorldPosition(nullObj, origPos);
    anim.displayIK(false);

    return { csv: rows.join('\n'), pass, fail, approxReach, N };
  }

  function runCircleSweep({ anim, nullObj, center, radius, frames = 180 }) {
    const rows = [];
    rows.push(['i','x','y','z','posErr','ok'].join(','));
    let pass = 0, fail = 0;

    const origPos = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      const ang = 2 * Math.PI * t;
      const p = new THREE.Vector3(center.x + radius*Math.cos(ang), center.y + radius*Math.sin(ang), center.z);
      setNullWorldPosition(nullObj, p);

      const res = anim.displayIK(true);
      const m = (res && res.__metrics) || { posErr: Number.POSITIVE_INFINITY, ok: false };

      rows.push([i, p.x.toFixed(4), p.y.toFixed(4), p.z.toFixed(4), m.posErr.toFixed(6), m.ok?1:0].join(','));
      if (m.ok) pass++; else fail++;
    }

    setNullWorldPosition(nullObj, origPos);
    anim.displayIK(false);

    return { csv: rows.join('\n'), pass, fail };
  }

  function saveCSV(name, csv) {
    try {
      // Electron / Node path (desktop Blockbench)
      const fs = require('fs');
      const path = require('path');
      const outDir = path.join(Project?.export_path || '', 'ik_reports');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const file = path.join(outDir, name);
      fs.writeFileSync(file, csv, 'utf8');
      Blockbench.showQuickMessage('Saved: ' + file);
    } catch (e) {
      // Browser fallback: download via data URL
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Blockbench.showQuickMessage('CSV downloaded');
    }
  }

  function runGridAction() {
    const ctx = findSelectedNullAndAnimator();
    if (!ctx) return;
    const { nullObj, anim } = ctx;

    // center at current null world pos
    const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    new Dialog({
      id: 'ik_grid_sweep',
      title: 'IK Grid Sweep',
      width: 360,
      form: {
        steps: { label: 'Samples per axis', type: 'number', value: 21, min: 5, max: 121, step: 2 },
        span:  { label: 'Half-span (as % of reach)', type: 'number', value: 90, min: 10, max: 120, step: 5 },
      },
      onConfirm(form) {
        const steps = Math.max(5, Math.min(121, parseInt(form.steps)));
        const halfSpan = Math.max(0.1, Math.min(1.2, (parseFloat(form.span) || 90) / 100));
        const { csv, pass, fail, approxReach, N } = runGridSweep({ anim, nullObj, center, halfSpan, steps });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveCSV(`ik_grid_${stamp}_N${N}_reach${approxReach.toFixed(3)}.csv`, csv);
        Blockbench.showMessageBox({
          title: 'IK Grid Sweep',
          message: `Pass: ${pass}  •  Fail: ${fail}\nReach≈ ${approxReach.toFixed(3)}  •  Samples: ${steps}×${steps}`,
          buttons: ['OK']
        });
      }
    }).show();
  }

  function runCircleAction() {
    const ctx = findSelectedNullAndAnimator();
    if (!ctx) return;
    const { nullObj, anim } = ctx;

    const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    new Dialog({
      id: 'ik_circle_sweep',
      title: 'IK Circle Sweep',
      width: 360,
      form: {
        radius: { label: 'Radius (model units)', type: 'number', value: 0.4, step: 0.05 },
        frames: { label: 'Frames', type: 'number', value: 180, min: 32, max: 720, step: 1 },
      },
      onConfirm(form) {
        const radius = parseFloat(form.radius) || 0.4;
        const frames = Math.max(16, Math.min(720, parseInt(form.frames)));
        const { csv, pass, fail } = runCircleSweep({ anim, nullObj, center, radius, frames });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveCSV(`ik_circle_${stamp}_R${radius.toFixed(3)}_F${frames}.csv`, csv);
        Blockbench.showMessageBox({
          title: 'IK Circle Sweep',
          message: `Pass: ${pass}  •  Fail: ${fail}\nRadius: ${radius}  •  Frames: ${frames}`,
          buttons: ['OK']
        });
      }
    }).show();
  }

  // Register actions in the UI
  BARS.defineActions(() => {
    new Action('ik_run_grid_sweep', {
      icon: 'grid_on',
      name: 'IK: Run Grid Sweep (Selected Null)',
      condition: () => Modes.animate,
      click: runGridAction
    });
    new Action('ik_run_circle_sweep', {
      icon: 'change_history',
      name: 'IK: Run Circle Path (Selected Null)',
      condition: () => Modes.animate,
      click: runCircleAction
    });
  });

  // Add to menus (Timeline bar)
  if (BarItems && BarItems.animation_menu) {
    BarItems.animation_menu.children.push('_');
    BarItems.animation_menu.children.push('ik_run_grid_sweep');
    BarItems.animation_menu.children.push('ik_run_circle_sweep');
  }

  console.log('[ik_test_runner] Ready: use “IK: Run Grid Sweep / Run Circle Path” from the Animation menu.');
})();
