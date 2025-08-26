const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Provide THREE globally for fabrik.js
const THREE = require('three');
global.THREE = THREE;

// Load fabrikIter into global scope
const code = fs.readFileSync(path.join(__dirname, '../js/animations/fabrik.js'), 'utf8') + '\nthis.fabrikIter = fabrikIter;';
vm.runInThisContext(code);

function testReachableTarget() {
  const bones = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 0),
    new THREE.Vector3(10, 0, 0),
  ];
  // Reachable target within total bone length (10 units)
  const target = new THREE.Vector3(8, 6, 0);
  fabrikIter(bones, target);
  assert(bones[2].distanceTo(target) < 1e-3);
}

function testPolePlane() {
  const bones = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(5, 0, 0),
    new THREE.Vector3(10, 0, 0),
  ];
  const target = new THREE.Vector3(10, 10, 0);
  const pole = new THREE.Vector3(0, 10, 10);
  fabrikIter(bones, target, pole);
  const root = bones[0];
  const mid = bones[1];
  const normal = target.clone().sub(root).cross(pole.clone().sub(root)).normalize();
  const midVec = mid.clone().sub(root);
  const dist = Math.abs(midVec.dot(normal));
  assert(dist < 1e-3);
}

testReachableTarget();
testPolePlane();
console.log('fabrik solver test passed');
