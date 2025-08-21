const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup(loadGroup) {
  global.window = global;
  global.Format = { bone_rig: true };
  global.Condition = () => true;
  require(path.join(__dirname, '../js/util/array_util.js'));
  if (!global.Property) {
    const code = fs.readFileSync(path.join(__dirname, '../js/util/property.js'), 'utf8') + '\nthis.Property = Property;';
    vm.runInThisContext(code);
  }
  global.Merge = {
    string(obj,data,key){ if (data[key] !== undefined) obj[key] = data[key]; },
    boolean(obj,data,key){ if (typeof data[key] === 'boolean') obj[key] = data[key]; },
    number(obj,data,key){ if (typeof data[key] === 'number') obj[key] = data[key]; },
    molang(){},
  };
  global.Blockbench = { on(){}, events:{}, dispatchEvent(){}, isMobile:false };
  const selected_groups = [];
  selected_groups.replace = function(arr){ this.splice(0, this.length, ...(arr||[])); };
  selected_groups.empty = function(){ this.length = 0; };
  global.Project = { groups: [], selected_groups };
  Project.groups.replace = function(arr){ this.splice(0,this.length,...(arr||[])); };
  global.selected = [];
  global.elements = [];
  global.tl = ()=>'';
  global.Undo = { initEdit(){}, finishEdit(){}, current_save:{} };
  global.Canvas = { updateAllBones(){}, updatePositions(){} };
  global.THREE = { Object3D: function(){ this.add = ()=>{}; }, LineSegments:function(){}, Vector3:function(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}, BufferGeometry:function(){ this.setFromPoints=()=>{}; }, LineBasicMaterial:function(){}, };
  global.Dialog = function(){ return { show(){}, setFormValues(){}, }; };
  global.NodePreviewController = function(){};
  global.Panel = function(){};
  global.Outliner = { buttons: { autouv:{} }, root: [], updateSelection(){}, control_menu_group: [] };
  global.MenuBar = { addAction(){}, updateName(){}, get(){return {condition:{}};} };
  global.Menus = {};
  global.BAR = {};
  global.TWEEN = { Tween:function(){ this.to=()=>this; this.onUpdate=()=>this; this.start=()=>this; } };
  global.Menu = function(){ return { addAction(){}}};
  global.MenuSeparator = function(){};
  class OutlinerNode { constructor(uuid){ this.uuid=uuid; } init(){} sanitizeName(){} }
  global.OutlinerNode = OutlinerNode;
  if (loadGroup || !global.Group) {
    const groupCode = fs.readFileSync(path.join(__dirname, '../js/outliner/group.js'), 'utf8')
      .split('\n').slice(0,730).join('\n') + '\nthis.Group = Group;';
    vm.runInThisContext(groupCode);
  }
}

function runTest() {
  setup(true);
  const g1 = new Group();
  g1.rotation_limit_enabled = true;
  g1.rotation_limit_min = [-10,-20,-30];
  g1.rotation_limit_max = [10,20,30];
  const g2 = new Group();
  g2.rotation_limit_enabled = true;
  g2.rotation_limit_min = [-40,-50,-60];
  g2.rotation_limit_max = [40,50,60];

  const saved = [g1.compile(true), g2.compile(true)];
  const parsed = JSON.parse(JSON.stringify(saved));
  setup(false);
  const r1 = new Group(parsed[0]);
  const r2 = new Group(parsed[1]);

  assert.deepStrictEqual(r1.rotation_limit_min, [-10,-20,-30]);
  assert.deepStrictEqual(r1.rotation_limit_max, [10,20,30]);
  assert.deepStrictEqual(r2.rotation_limit_min, [-40,-50,-60]);
  assert.deepStrictEqual(r2.rotation_limit_max, [40,50,60]);
  assert.notStrictEqual(r1.rotation_limit_min, r2.rotation_limit_min);
  assert.notStrictEqual(r1.rotation_limit_max, r2.rotation_limit_max);
}

runTest();
console.log('rotation limit serialization test passed');
