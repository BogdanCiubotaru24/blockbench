// tools/verify_ik_setup.js
const fs = require('fs');
const path = require('path');

const reqFiles = [
  'js/animations/ik_constraints.js',
  'js/animations/ik_patch_template.js',
  'js/animations/ik_install_hook.js',
  'index.html'
];

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function has(str, re) { return re.test(str); }

function report(ok, msg) {
  console.log((ok ? '✅' : '❌') + ' ' + msg);
  if (!ok) process.exitCode = 1;
}

let allOK = true;

// 1) Files exist
for (const f of reqFiles) {
  const ok = fs.existsSync(path.join(process.cwd(), f));
  allOK &&= ok;
  report(ok, `found ${f}`);
}

// 2) index.html contains the three scripts after THREE and before your IK solver
const index = read('index.html') || '';
const hasConstraints = index.includes('js/animations/ik_constraints.js');
const hasPatch = index.includes('js/animations/ik_patch_template.js');
const hasInstaller = index.includes('js/animations/ik_install_hook.js');
report(hasConstraints, 'index.html loads ik_constraints.js');
report(hasPatch, 'index.html loads ik_patch_template.js');
report(hasInstaller, 'index.html loads ik_install_hook.js');

// Rough ordering check (THREE first, then our files)
const posThree = Math.min(
  ...['three.min.js','three.module.js','/three.js','THREE']
    .map(s => index.indexOf(s))
    .filter(i => i >= 0)
);
const posConstr = index.indexOf('ik_constraints.js');
const posPatch  = index.indexOf('ik_patch_template.js');
const posInst   = index.indexOf('ik_install_hook.js');
if (posThree >= 0 && posConstr >= 0) {
  report(posThree < posConstr, 'THREE is loaded before ik_constraints.js');
}

// 3) The runtime files look correct
const constraintsJS = read('js/animations/ik_constraints.js') || '';
report(has(constraintsJS, /window\.IKConstraints/), 'ik_constraints exposes window.IKConstraints');
report(has(constraintsJS, /clampHinge/), 'ik_constraints defines clampHinge');
report(has(constraintsJS, /clampBall/), 'ik_constraints defines clampBall');
report(has(constraintsJS, /installProjectionHook/), 'ik_constraints defines installProjectionHook');
report(has(constraintsJS, /__project/), 'ik_constraints defines __project');

const installHookJS = read('js/animations/ik_install_hook.js') || '';
report(has(installHookJS, /installProjectionHook\s*\(/), 'ik_install_hook installs a projection hook');
report(has(installHookJS, /type['"]?\s*:\s*['"]hinge['"]/), 'ik_install_hook handles hinge');
report(has(installHookJS, /type['"]?\s*:\s*['"]ball['"]/),  'ik_install_hook handles ball');

// 4) Somewhere in your code, the IK loop calls IKConstraints.__project(...)
function scanForProjectCall(dir) {
  const found = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.js')) {
        const s = read(p);
        if (s && s.includes('IKConstraints.__project(')) found.push(p);
      }
    }
  }
  walk(dir);
  return found;
}

const hitFiles = scanForProjectCall('js');
report(hitFiles.length > 0, `IKConstraints.__project used in IK loop (${hitFiles.length} file(s))`);
if (hitFiles.length) {
  console.log('   ↳ ' + hitFiles.slice(0,5).join('\n     '));
}

// Final result
if (process.exitCode === 1) {
  console.log('\nSome checks failed. See ❌ lines above.');
} else {
  console.log('\nAll checks passed. You’re wired up correctly. 🎉');
}
