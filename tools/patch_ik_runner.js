// tools/patch_ik_runner.js
// Usage: node tools/patch_ik_runner.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'js', 'animations', 'ik_test_runner.js');

function read(file) {
  if (!fs.existsSync(file)) throw new Error('File not found: ' + file);
  return fs.readFileSync(file, 'utf8');
}
function write(file, content) {
  const bak = file + '.bak.' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(bak, content, 'utf8');
  console.log('Backup written:', bak);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Patched:', file);
}

// naive brace matcher (good enough for this file)
function findFunctionBlock(src, fnName) {
  const sig = new RegExp(`function\\s+${fnName}\\s*\\(`);
  const m = sig.exec(src);
  if (!m) return null;
  const start = m.index;
  const braceStart = src.indexOf('{', m.index);
  if (braceStart < 0) return null;

  let i = braceStart, depth = 0;
  while (i < src.length) {
    const ch = src[i++];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { start, end: i }; // slice [start, end)
    }
  }
  return null;
}

// 1) ensure busy flag near top
function ensureBusyFlag(src) {
  if (src.includes('__cubeSweepBusy')) return src;
  const iifeOpen = src.indexOf('(function');
  if (iifeOpen === -1) return src;
  const firstBrace = src.indexOf('{', iifeOpen);
  if (firstBrace === -1) return src;
  const insertAt = firstBrace + 1;
  const inject = `\n  // async cube sweep guard\n  let __cubeSweepBusy = false;\n`;
  console.log('Injecting __cubeSweepBusy guard');
  return src.slice(0, insertAt) + inject + src.slice(insertAt);
}

const ASYNC_SWEEP = `
/* ---------- NEW: CUBE SWEEP (3D, async & UI-friendly) ---------- */
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

  const yieldUI = () => new Promise(requestAnimationFrame);

  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const p = new THREE.Vector3(center.x + axis[ix], center.y + axis[iy], center.z + axis[iz]);
        setNullWorldPosition(nullObj, p);

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

  setNullWorldPosition(nullObj, origPos);
  anim.displayIK(false);

  return { csv: rows.join('\\n'), pass, fail, reach, N, total };
}
`.trim() + '\n';

const NEW_RUN_CUBE_ACTION = `
function runCubeAction() {
  const ctx = findSelectedNullAndAnimator(); if (!ctx) return;
  const { nullObj, anim } = ctx;
  const center = nullObj.mesh.getWorldPosition(new THREE.Vector3());

  let dlg;
  dlg = new Dialog({
    id: 'ik_cube_sweep',
    title: 'IK Cube Sweep (3D)',
    width: 380,
    form: {
      steps:  { label: 'Samples per axis (N)', type: 'number', value: 11, min: 5,  max: 41,  step: 2 },
      span:   { label: 'Half-span (% of reach)', type: 'number', value: 60, min: 10, max: 120, step: 5 },
      eps:    { label: 'OK threshold (ε)', type: 'number', value: 0.01, step: 0.001 }
    },
    async onConfirm(form) {
      try {
        if (dlg && typeof dlg.hide === 'function') dlg.hide();

        if (__cubeSweepBusy) {
          Blockbench.showQuickMessage('Cube sweep already running…');
          return;
        }
        __cubeSweepBusy = true;

        const steps   = Math.max(5, Math.min(41, parseInt(form.steps)));
        const halfSpan= Math.max(0.1, Math.min(1.2, (parseFloat(form.span)||60)/100));
        const okEps   = Math.max(1e-6, parseFloat(form.eps)||1e-2);

        let lastPct = -1;
        const { csv, pass, fail, reach, N, total } = await runCubeSweepAsync({
          anim, nullObj, center, halfSpan, steps, okEps,
          onProgress: (pct) => {
            const p = Math.floor(pct * 100);
            if (p !== lastPct) { Blockbench.setStatusBarText(\`Cube sweep: \${p}% of \${total} pts\`); lastPct = p; }
          }
        });
        Blockbench.setStatusBarText('');

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file  = \`ik_cube_\${stamp}_N\${N}_reach\${reach.toFixed(3)}.csv\`;
        saveCSV(file, csv);

        Blockbench.showMessageBox({
          title: 'IK Cube Sweep',
          message: \`Pass: \${pass}  •  Fail: \${fail}\\nReach≈ \${reach.toFixed(3)}  •  Samples: \${N}×\${N}×\${N} = \${total}\\nSaved: \${file}\`,
          buttons: ['OK']
        });
      } catch (err) {
        console.error(err);
        Blockbench.setStatusBarText('');
        Blockbench.showMessageBox({ title: 'IK Cube Sweep', message: 'Failed. See console for details.', buttons: ['OK'] });
      } finally {
        __cubeSweepBusy = false;
      }
    }
  });
  dlg.show();
}
`.trim() + '\n';

function ensureAsyncSweep(src) {
  if (src.includes('function runCubeSweepAsync')) return src;
  // Try to insert right after existing runCubeSweep
  const blk = findFunctionBlock(src, 'runCubeSweep');
  if (blk) {
    console.log('Inserting runCubeSweepAsync after runCubeSweep');
    return src.slice(0, blk.end) + '\n\n' + ASYNC_SWEEP + src.slice(blk.end);
  }
  // Fallback: append near the end
  console.log('runCubeSweep not found; appending runCubeSweepAsync at end');
  return src + '\n\n' + ASYNC_SWEEP;
}

function replaceRunCubeAction(src) {
  const blk = findFunctionBlock(src, 'runCubeAction');
  if (!blk) {
    console.log('runCubeAction() not found; no replacement done');
    return src;
  }
  console.log('Replacing runCubeAction() with async version');
  return src.slice(0, blk.start) + NEW_RUN_CUBE_ACTION + src.slice(blk.end);
}

(function main() {
  let content = read(FILE);
  content = ensureBusyFlag(content);
  content = ensureAsyncSweep(content);
  content = replaceRunCubeAction(content);
  write(FILE, content);
})();
