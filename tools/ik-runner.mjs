// ik-runner.mjs (fixed)
// npm i three
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

// ---------- CLI ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith('--')) { out[k] = v; i++; }
      else out[k] = true;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const DEBUG = String(args.debug || 'false') === 'true';

const MODE  = String(args.mode || 'auto').toLowerCase(); // auto|eval|display
const SIZE  = +args.size || 12;
const STEPS = Math.max(2, parseInt(args.steps || '20', 10));
const EPS   = +args.eps || 0.5;
const OUT   = args.out || './ik_results.json';

const CODE_PATH = typeof args.code === 'string' ? args.code : './candidate.js';
const fullPath  = path.resolve(process.cwd(), CODE_PATH);
if (!fs.existsSync(fullPath)) {
  console.error(`Could not find --code file: ${fullPath}`);
  process.exit(1);
}
const codeText = fs.readFileSync(fullPath, 'utf8');

// ---------- Utils ----------
function* grid3(size, steps) {
  const half = size / 2;
  const step = size / (steps - 1);
  for (let iz = 0; iz < steps; iz++) {
    const z = -half + iz * step;
    for (let iy = 0; iy < steps; iy++) {
      const y = -half + iy * step;
      for (let ix = 0; ix < steps; ix++) {
        const x = -half + ix * step;
        yield { x, y, z, i: [ix, iy, iz], step: [step, step, step] };
      }
    }
  }
}

// ---------- Robust displayIK extractor ----------
function extractDisplayIK(source) {
  const startRe = /(^|[^$\w])displayIK\s*\(/g;
  let m;
  while ((m = startRe.exec(source))) {
    let i = startRe.lastIndex; // after '('
    // match parameter parens
    let depth = 1;
    while (i < source.length && depth > 0) {
      const c = source[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    if (depth !== 0) continue; // malformed; try next match
    // skip whitespace/comments to the opening '{'
    function skipWSComm(j) {
      while (j < source.length) {
        const c = source[j];
        if (/\s/.test(c)) { j++; continue; }
        if (c === '/' && source[j + 1] === '/') { // line comment
          j += 2; while (j < source.length && source[j] !== '\n') j++;
          continue;
        }
        if (c === '/' && source[j + 1] === '*') { // block comment
          j += 2;
          while (j < source.length && !(source[j] === '*' && source[j + 1] === '/')) j++;
          j += 2;
          continue;
        }
        break;
      }
      return j;
    }
    i = skipWSComm(i);
    if (source[i] !== '{') continue;

    // brace-match body, skipping strings/comments/template literals
    let j = i + 1;
    let braceDepth = 1;
    while (j < source.length && braceDepth > 0) {
      const c = source[j++];
      if (c === '{') { braceDepth++; continue; }
      if (c === '}') { braceDepth--; continue; }

      // strings
      if (c === '"' || c === "'") {
        const quote = c;
        while (j < source.length) {
          const d = source[j++];
          if (d === '\\') { j++; continue; }
          if (d === quote) break;
        }
        continue;
      }
      // template literal
      if (c === '`') {
        let inTpl = true, brace = 0;
        while (j < source.length && inTpl) {
          const d = source[j++];
          if (d === '\\') { j++; continue; }
          if (d === '`') break;
          if (d === '$' && source[j] === '{') { j++; brace++;
            while (j < source.length && brace > 0) {
              const e = source[j++];
              if (e === '{') brace++;
              else if (e === '}') brace--;
              else if (e === '"' || e === "'") { // strings inside ${}
                const q = e;
                while (j < source.length) {
                  const f = source[j++]; if (f === '\\') { j++; continue; }
                  if (f === q) break;
                }
              } else if (e === '`') { // nested template? rare, handle simply
                while (j < source.length) {
                  const g = source[j++]; if (g === '\\') { j++; continue; }
                  if (g === '`') break;
                }
              }
            }
          }
        }
        continue;
      }
      // comments
      if (c === '/' && source[j] === '/') { // //
        j++; while (j < source.length && source[j] !== '\n') j++;
        continue;
      }
      if (c === '/' && source[j] === '*') { // /* */
        j++;
        while (j < source.length && !(source[j] === '*' && source[j + 1] === '/')) j++;
        j += 2;
        continue;
      }
    }
    if (braceDepth !== 0) continue;
    const body = source.slice(i + 1, j - 1);
    if (DEBUG) {
      console.log('[extract] found displayIK, body preview:\n' + body.slice(0, 200) + (body.length > 200 ? '…' : ''));
    }
    return body;
  }
  return null;
}

// ---------- Build evaluate() from displayIK body ----------
function buildEvaluateFromDisplayIK(displayIKBody, chainSpec) {
  const safeBody = displayIKBody.replace(/`/g, '\\`'); // protect backticks
  const wrapper = `
    (function(){
      const Reusable = {
        vec1: new THREE.Vector3(), vec2: new THREE.Vector3(), vec3: new THREE.Vector3(),
        quat1: new THREE.Quaternion(), euler1: new THREE.Euler(), euler2: new THREE.Euler()
      };
      Math.radToDeg = Math.radToDeg || (r => r*180/Math.PI);

      class NodeBase {
        constructor(name){ this.name=name; this.uuid=Math.random().toString(36).slice(2);
          this.parent=null; this.children=[]; this.mesh=new THREE.Object3D(); this.origin=[0,0,0]; this.ik_enabled=true; }
        add(child){ child.parent=this; this.children.push(child); this.mesh.add(child.mesh); return child; }
        isChildOf(anc){ let c=this.parent; while(c){ if(c===anc) return true; c=c.parent; } return false; }
        getWorldCenter(){ return this.mesh.getWorldPosition(new THREE.Vector3()); }
      }
      class Group extends NodeBase { static all=[]; constructor(n){ super(n); Group.all.push(this);} }
      class Locator extends NodeBase { static all=[]; constructor(n){ super(n); Locator.all.push(this);} }
      const FIK = {
        V3: class V3 extends THREE.Vector3 { copy(v){ return super.copy(v); } },
        Bone3D: class Bone3D { constructor(start,end){ this.start=start.clone(); this.end=end.clone(); this.length=this.start.distanceTo(this.end)||1; } }
      };
      class ChainShim { constructor(){ this.bones=[]; this.lastTargetLocation=new FIK.V3(1e9,0,0);} addBone(b){ this.bones.push(b);} clear(){ this.bones.length=0; this.lastTargetLocation.set(1e9,0,0);} }
      class SolverShim {
        constructor(){ this.chains=[new ChainShim()]; this.meshChains=[[]]; this._target=new THREE.Vector3(); }
        add(chain, target){ this.chains[0]=chain; this._target.copy(target); }
        update(){
          const bones=this.chains[0].bones; if(!bones.length) return;
          let base=bones[0].start.clone();
          for(let i=0;i<bones.length;i++){
            const b=bones[i]; const len=b.length||b.start.distanceTo(b.end)||1;
            const dir=new THREE.Vector3().subVectors(this._target, base).normalize();
            const end=base.clone().addScaledVector(dir, len);
            b.start.copy(base); b.end.copy(end); base.copy(end);
          }
        }
        clear(){ this.chains[0].clear(); }
      }

      const spec = ${JSON.stringify(chainSpec || {
        bones: [
          { name:'pla_left_arm', length:5.5, limits:{min:[-60,-90,-120], max:[180,90,120]} },
          { name:'plfa_left_forearm', length:5.7, limits:{min:[0,-90,0],   max:[150,90,0], hinge:'x'} }
        ],
        target:{ name:'pli_left_item' }, nullIsLocator:true
      })};

      const root=new Group('root'); const bones=[];
      let prev = root;
      for (let i=0;i<spec.bones.length;i++){
        const b=spec.bones[i]; const g=new Group(b.name);
        g.origin=[0, i===0?0:-spec.bones[i-1].length, 0];
        g.mesh.position.set(0, i===0?0:-spec.bones[i-1].length, 0);
        g.limits=b.limits||null; bones.push(g); prev.add(g); prev=g;
      }
      const target=new Group(spec.target?.name||'target'); prev.add(target);
      target.mesh.position.set(0, -(spec.bones.at(-1).length||1), 0);
      const source=bones[0];

      const null_object = spec.nullIsLocator!==false ? new Locator('ik_handle') : new Group('ik_handle');
      null_object.ik_source = source.uuid; null_object.ik_target = target.uuid;

      // Expose to user's code
      globalThis.Group = Group;
      globalThis.Locator = Locator;
      globalThis.FIK = FIK;
      globalThis.Reusable = Reusable;
      globalThis.THREE = THREE;

      function clampEulerToLimits(e, lim){
        if (!lim || !lim.min || !lim.max) return false;
        const toR = d=>d*Math.PI/180;
        const before = new THREE.Vector3(e.x,e.y,e.z);
        e.x = Math.max(toR(lim.min[0]), Math.min(toR(lim.max[0]), e.x));
        e.y = Math.max(toR(lim.min[1]), Math.min(toR(lim.max[1]), e.y));
        e.z = Math.max(toR(lim.min[2]), Math.min(toR(lim.max[2]), e.z));
        return (Math.abs(before.x-e.x)>1e-6)||(Math.abs(before.y-e.y)>1e-6)||(Math.abs(before.z-e.z)>1e-6);
      }

      const HOST = {
        chain: new ChainShim(),
        solver: new SolverShim(),
        __ik_constrained_hit: false,
        getElement(){ return null_object; },
        clampRotation(bone){ if (!bone) return; if (clampEulerToLimits(bone.mesh.rotation, bone.limits)) this.__ik_constrained_hit = true; }
      };

      // ---- user displayIK pasted here ----
      function displayIK(get_samples) {
${safeBody}
      }

      HOST.displayIK = displayIK;

      function worldPos(obj){ return obj.mesh.getWorldPosition(new THREE.Vector3()); }

      return function evaluate(p, ctx) {
        // reset pose
        for (const b of bones){ b.mesh.rotation.set(0,0,0); b.mesh.updateMatrixWorld(); }
        HOST.__ik_constrained_hit = false;

        // place null handle
        const o = worldPos(source);
        null_object.mesh.position.set(o.x + p.x, o.y + p.y, o.z + p.z);
        null_object.mesh.updateMatrixWorld(true);

        HOST.displayIK.call(HOST, false);

        const tip = worldPos(target);
        const handle = null_object.mesh.getWorldPosition(new THREE.Vector3());
        const dist = tip.distanceTo(handle);
        const constrained = !(dist <= (ctx?.epsilon ?? 0.5)) && !!HOST.__ik_constrained_hit;
        return { distance: dist, constrained };
      };
    })();
  `;
  try {
    const factory = new Function('THREE', wrapper);
    const out = factory(THREE);
    if (typeof out !== 'function') throw new Error('wrapper did not return a function');
    return out;
  } catch (e) {
    if (DEBUG) {
      console.error('[compile] Failed to build evaluate() from displayIK:', e.message);
    }
    return null;
  }
}

// ---------- Optional pure evaluate(p,ctx) loader ----------
function tryLoadEvaluate(codeText) {
  try {
    const fn = new Function('THREE', `${codeText}\nif (typeof evaluate !== 'function') throw 0; return evaluate;`);
    return fn(THREE);
  } catch {
    return null;
  }
}

// ---------- Build evaluator ----------
let evaluate = null;
if (MODE === 'eval' || MODE === 'auto') {
  evaluate = tryLoadEvaluate(codeText);
  if (DEBUG) console.log('[mode eval] evaluate():', !!evaluate);
}
if (!evaluate) {
  const body = extractDisplayIK(codeText);
  if (body) {
    if (DEBUG) console.log('[mode display] attempting shim build…');
    evaluate = buildEvaluateFromDisplayIK(body, null);
    if (evaluate) console.log('Mode: displayIK shim (extracted from whole file)');
  }
}
if (!evaluate) {
  console.error('Could not build an evaluator from the file (no evaluate(), no displayIK).');
  process.exit(1);
}

// ---------- Sweep ----------
let total=0, reachable=0, unreachable=0, blocked=0, sum=0, errors=0, firstErr=null;
for (const p of grid3(SIZE, STEPS)) {
  total++;
  try {
    const out = evaluate(p, { epsilon: EPS });
    const d = Number(out?.distance);
    if (!Number.isFinite(d)) { errors++; if (!firstErr) firstErr = out?.error || 'NaN distance'; continue; }
    sum += d;
    if (d <= EPS) reachable++;
    else { unreachable++; if (out?.constrained) blocked++; }
  } catch (e) {
    errors++; if (!firstErr) firstErr = e?.message || String(e);
  }
}
const summary = {
  config: { size: SIZE, steps: STEPS, epsilon: EPS, mode: MODE },
  totals: { samples: total, errors },
  rates: {
    reachable: total ? reachable/total : 0,
    unreachable: total ? unreachable/total : 0,
    constraint_blocked: total ? blocked/total : 0
  },
  mean_distance: total ? sum/total : NaN,
  error_example: firstErr || null
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.table({
  samples: total,
  errors,
  'reach %': ((summary.rates.reachable)*100).toFixed(2),
  'unreach %': ((summary.rates.unreachable)*100).toFixed(2),
  'blocked %': ((summary.rates.constraint_blocked)*100).toFixed(2),
  'mean dist': summary.mean_distance.toFixed(4)
});
console.log(`Saved: ${OUT}`);
