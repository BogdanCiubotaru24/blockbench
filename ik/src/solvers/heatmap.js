// Generate a CSV heatmap of solve error over a grid of targets
const fs = require('fs');
const path = require('path');
const THREE = require('three');
const { TwoBoneChain } = require('./ccd2');

const outDir = path.join(__dirname, '../../out');
fs.mkdirSync(outDir, { recursive: true }); // ensure /out exists

// Unique filename each run to avoid EBUSY when a viewer locks the file
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = path.join(outDir, `heatmap_${stamp}.csv`);

const L1 = 1.0, L2 = 0.7;
const reach = L1 + L2;
const chain = new TwoBoneChain(L1, L2, {
  axis0: new THREE.Vector3(0,0,1),
  axis1: new THREE.Vector3(0,0,1),
  lim0: { min: -Math.PI*0.9, max: Math.PI*0.9 },
  lim1: { min: 0, max: Math.PI*0.95 }
});

const minX = -reach, maxX = reach, minY = -reach, maxY = reach;
const steps = 60;
let rows = [];
rows.push("x,y,err,iters,ok");

for (let iy = 0; iy <= steps; iy++) {
  for (let ix = 0; ix <= steps; ix++) {
    const x = minX + (maxX - minX) * (ix/steps);
    const y = minY + (maxY - minY) * (iy/steps);
    const target = new THREE.Vector3(x,y,0);
    // Reset chain pose
    chain.q0.set(0,0,0,1);
    chain.q1.set(0,0,0,1);
    const { ok, err, iters } = chain.solve(target, { maxIters: 120, tol: 1e-2 });
    rows.push([x.toFixed(4), y.toFixed(4), err.toFixed(6), iters, ok?1:0].join(','));
  }
}

fs.writeFileSync(outPath, rows.join('\n'), { encoding: 'utf8', flag: 'w' });
console.log("Wrote heatmap CSV:", outPath);
