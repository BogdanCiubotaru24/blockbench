// js/animations/ik_test_runner.js
(function () {
  if (!window.THREE) return console.warn('[ik_test_runner] THREE missing');

  // ---------- common helpers ----------
  function findSelectedNullAndAnimator() {
    const sel = Outliner?.selected?.[0];
    if (!(sel && sel instanceof NullObject)) {
      Blockbench.showQuickMessage('Select a Null Object (IK controller) in the outliner first.');
      return null;
    }
    let anim = null;
    if (Animation?.selected?.animators) {
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
    const parent = nullObj.mesh.parent || scene;
    const local = worldV3.clone();
    parent.worldToLocal(local);
    nullObj.mesh.position.copy(local);
    nullObj.mesh.updateMatrixWorld();
  }

  function estimateReach(nullObj) {
    // Sum distances between each bone start and end in the chain once
    let approxReach = 0.0;
    try {
      const target = [...Group.all, ...Locator.all].find(n => n.uuid == nullObj.ik_target);
      let current = target?.parent;
      const source = nullObj.ik_source ? [...Group.all].find(n => n.uuid == nullObj.ik_source) : nullObj.parent;
      if (!source || !target) return 1;
      const bones = [];
      while (current && current !== source) { if (current instanceof Group) bones.push(current); current = current.parent; }
      if (nullObj.ik_source && source instanceof Group) bones.push(source);
      bones.reverse();
      for (let i = 0; i < bones.length; i++) {
        const A = bones[i].mesh.getWorldPosition(new THREE.Vector3());
        const B = (bones[i+1] ? bones[i+1].mesh.getWorldPosition(new THREE.Vector3())
                              : new THREE.Vector3().copy(nullObj.getWorldCenter(false)));
        approxReach += A.distanceTo(B);
      }
    } catch {}
    return approxReach || 1;
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

  // ---------- GRID SWEEP (2D, existing) ----------
  function runGridSweep({ anim, nullObj, center, halfSpan = 0.6, steps = 21, okEps = 1e-2 }) {
    const reach = estimateReach(nullObj);
    const span = reach * halfSpan;
    const N = Math.max(3, steps|0);
    const xs = [...Array(N)].map((_,i)=> -span + (2*span)*(i/(N-1)));
    const ys = xs.slice();
    const z = center.z;

    const rows = [];
    rows.push(['ix','iy','x','y','z','posErr','ok'].join(','));
    let pass = 0, fail = 0;

    const origPos = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const p = new THREE.Vector3(center.x + xs[ix], center.y + ys[iy], z);
        setNullWorldPosition(nullObj, p);

        const res = anim.displayIK(true);
        const m = (res && res.__metrics) || { posErr: Number.POSITIVE_INFINITY };
        const ok = (m.posErr <= okEps);

        rows.push([ix,iy,p.x.toFixed(6),p.y.toFixed(6),p.z.toFixed(6), m.posErr.toFixed(6), ok?1:0].join(','));
        if (ok) pass++; else fail++;
      }
    }

    setNullWorldPosition(nullObj, origPos);
    anim.displayIK(false);

    return { csv: rows.join('\n'), pass, fail, reach, N };
  }

  // ---------- CIRCLE SWEEP (existing) ----------
  function runCircleSweep({ anim, nullObj, center, radius, frames = 180, okEps = 1e-2 }) {
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
      const m = (res && res.__metrics) || { posErr: Number.POSITIVE_INFINITY };
      const ok = (m.posErr <= okEps);

      rows.push([i, p.x.toFixed(6), p.y.toFixed(6), p.z.toFixed(6), m.posErr.toFixed(6), ok?1:0].join(','));
      if (ok) pass++; else fail++;
    }

    setNullWorldPosition(nullObj, origPos);
    anim.displayIK(false);

    return { csv: rows.join('\n'), pass, fail };
  }

  // ---------- NEW: CUBE SWEEP (3D, async & UI-friendly) ----------
async function runCubeSweepAsync({ anim, nullObj, center, halfSpan = 0.6, steps = 11, okEps = 1e-2, onProgress }) {
  const reach = estimateReach(nullObj);
  const span = reach * halfSpan;
  const N = Math.max(3, steps|0);

  const axis = [...Array(N)].map((_,i)=> -span + (2*span)*(i/(N-1)));
  const rows = [];
  rows.push(['ix','iy','iz','x','y','z','posErr','ok'].join(','));

  let pass = 0, fail = 0;
  const origPos = nullObj.mesh.getWorldPosition(new THREE.Vector3());
  const total = N * N * N;
  let done = 0;

  // small helper to keep UI responsive
  const yieldUI = () => new Promise(requestAnimationFrame);

  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const p = new THREE.Vector3(center.x + axis[ix], center.y + axis[iy], center.z + axis[iz]);
        setNullWorldPosition(nullObj, p);

        // yield every ~64 samples so dialog/buttons/status can update
        if ((done & 63) === 0) await yieldUI();

        const res = anim.displayIK(true);
        const m = (res && res.__metrics) || { posErr: Number.POSITIVE_INFINITY };
        const ok = (m.posErr <= okEps);

        rows.push([ix,iy,iz,
          p.x.toFixed(6), p.y.toFixed(6), p.z.toFixed(6),
          m.posErr.toFixed(6), ok ? 1 : 0
        ].join(','));

        if (ok) pass++; else fail++;
        done++;
        if (onProgress && (done % Math.max(1, Math.floor(total/100)) === 0)) onProgress(done/total);
      }
    }
  }

  // restore pose
  setNullWorldPosition(nullObj, origPos);
  anim.displayIK(false);

  return { csv: rows.join('\n'), pass, fail, reach, N, total };
}

  // ---------- UI actions ----------
  function runGridAction() {
    const ctx = findSelectedNullAndAnimator(); if (!ctx) return;
    const { nullObj, anim } = ctx;
    const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    new Dialog({
      id: 'ik_grid_sweep',
      title: 'IK Grid Sweep (2D)',
      width: 360,
      form: {
        steps:  { label: 'Samples per axis', type: 'number', value: 21, min: 5,  max: 121, step: 2 },
        span:   { label: 'Half-span (% of reach)', type: 'number', value: 60, min: 10, max: 120, step: 5 },
        eps:    { label: 'OK threshold (ε)', type: 'number', value: 0.01, step: 0.001 }
      },
      onConfirm(form) {
        const steps = Math.max(5, Math.min(121, parseInt(form.steps)));
        const halfSpan = Math.max(0.1, Math.min(1.2, (parseFloat(form.span)||60) / 100));
        const okEps = Math.max(1e-6, parseFloat(form.eps)||1e-2);
        const { csv, pass, fail, reach, N } = runGridSweep({ anim, nullObj, center, halfSpan, steps, okEps });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveCSV(`ik_grid_${stamp}_N${N}_reach${reach.toFixed(3)}.csv`, csv);
        Blockbench.showMessageBox({
          title: 'IK Grid Sweep',
          message: `Pass: ${pass}  •  Fail: ${fail}\nReach≈ ${reach.toFixed(3)}  •  Samples: ${steps}×${steps}`,
          buttons: ['OK']
        });
      }
    }).show();
  }

  function runCircleAction() {
    const ctx = findSelectedNullAndAnimator(); if (!ctx) return;
    const { nullObj, anim } = ctx;
    const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    new Dialog({
      id: 'ik_circle_sweep',
      title: 'IK Circle Path',
      width: 360,
      form: {
        radius: { label: 'Radius (model units)', type: 'number', value: 0.4, step: 0.05 },
        frames: { label: 'Frames', type: 'number', value: 180, min: 32, max: 720, step: 1 },
        eps:    { label: 'OK threshold (ε)', type: 'number', value: 0.01, step: 0.001 }
      },
      onConfirm(form) {
        const radius = parseFloat(form.radius) || 0.4;
        const frames = Math.max(16, Math.min(720, parseInt(form.frames)));
        const okEps  = Math.max(1e-6, parseFloat(form.eps)||1e-2);
        const { csv, pass, fail } = runCircleSweep({ anim, nullObj, center, radius, frames, okEps });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveCSV(`ik_circle_${stamp}_R${radius.toFixed(3)}_F${frames}.csv`, csv);
        Blockbench.showMessageBox({
          title: 'IK Circle Path',
          message: `Pass: ${pass}  •  Fail: ${fail}\nRadius: ${radius}  •  Frames: ${frames}`,
          buttons: ['OK']
        });
      }
    }).show();
  }

  function runCubeAction() {
    const ctx = findSelectedNullAndAnimator(); if (!ctx) return;
    const { nullObj, anim } = ctx;
    const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

    new Dialog({
      id: 'ik_cube_sweep',
      title: 'IK Cube Sweep (3D)',
      width: 380,
      form: {
        steps:  { label: 'Samples per axis (N)', type: 'number', value: 11, min: 5,  max: 41,  step: 2 },
        span:   { label: 'Half-span (% of reach)', type: 'number', value: 60, min: 10, max: 120, step: 5 },
        eps:    { label: 'OK threshold (ε)', type: 'number', value: 0.01, step: 0.001 }
      },
      async onConfirm(form) {
        const steps = Math.max(5, Math.min(41, parseInt(form.steps)));      // 11 → 1331 samples (fast); 21 → 9261 (heavier)
        const halfSpan = Math.max(0.1, Math.min(1.2, (parseFloat(form.span)||60) / 100));
        const okEps = Math.max(1e-6, parseFloat(form.eps)||1e-2);

        // Precompute sample count so progress text works before sweep resolves
        const N = Math.max(3, steps|0);
        const totalSamples = N * N * N;

        // simple progress nudges (UI stays responsive)
        let lastPct = -1;
        const result = await runCubeSweepAsync({
          anim, nullObj, center, halfSpan, steps, okEps,
          onProgress: (pct) => {
            const p = Math.floor(pct*100);
            if (p !== lastPct) {
              Blockbench.setStatusBarText(`Cube sweep: ${p}% (${totalSamples} pts)`);
              lastPct = p;
            }
          }
        });
        Blockbench.setStatusBarText('');

        const { csv, pass, fail, reach, total } = result;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        saveCSV(`ik_cube_${stamp}_N${N}_reach${reach.toFixed(3)}.csv`, csv);
        Blockbench.showMessageBox({
          title: 'IK Cube Sweep',
          message: `Pass: ${pass}  •  Fail: ${fail}\nReach≈ ${reach.toFixed(3)}  •  Samples: ${N}×${N}×${N} = ${total}`,
          buttons: ['OK']
        });
      }
    }).show();
  }

  // ---------- register actions & add to menus ----------
  BARS.defineActions(() => {
    new Action('ik_run_grid_sweep', {
      icon: 'grid_on',
      name: 'IK: Run Grid Sweep (2D)',
      condition: () => Modes.animate,
      click: runGridAction
    });
    new Action('ik_run_circle_sweep', {
      icon: 'change_history',
      name: 'IK: Run Circle Path (2D)',
      condition: () => Modes.animate,
      click: runCircleAction
    });
    new Action('ik_run_cube_sweep', {
      icon: 'view_in_ar',
      name: 'IK: Run Cube Sweep (3D)',
      condition: () => Modes.animate,
      click: runCubeAction
    });
  });

  // Put actions in both Animation and Tools menus for easy discovery
  try {
    const menus = [BarItems?.animation_menu, BarItems?.tools_menu].filter(Boolean);
    for (const m of menus) {
      if (!Array.isArray(m.children)) continue;
      m.children.push('_');
      ['ik_run_grid_sweep','ik_run_circle_sweep','ik_run_cube_sweep'].forEach(id => {
        if (!m.children.includes(id)) m.children.push(id);
      });
    }
  } catch {}

  console.log('[ik_test_runner] Ready: Grid / Circle / Cube sweep are available (menus & search).');
})();
