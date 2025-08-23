const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
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

  global.Blockbench = { on(){}, events:{}, dispatchEvent(){}, isMobile:false, showMessageBox(){} };
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
  global.THREE = { Object3D: function(){ this.add = ()=>{}; }, LineSegments:function(){}, Vector3:function(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}, BufferGeometry:function(){ this.setFromPoints=()=>{}; }, LineBasicMaterial:function(){}, Quaternion:function(){}, };

  global.Vue = { nextTick(fn){ fn(); } };

  global.Dialog = function(options){
    return {
      content_vue: null,
      options,
      show(){},
      hide(){},
      build(){
        const data = options.component?.data ? options.component.data() : {};
        const comp = { ...data };
        comp.$set = (obj,key,val) => { obj[key] = val; };
        const methods = options.component?.methods || {};
        Object.keys(methods).forEach(k => {
          comp[k] = methods[k].bind(comp);
        });
        this.content_vue = comp;
      },
    };
  };

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

  const groupCode = fs.readFileSync(path.join(__dirname, '../js/outliner/group.js'), 'utf8')
    .split('\n').slice(0,730).join('\n') + '\nthis.Group = Group;';
  vm.runInThisContext(groupCode);

  const dialogCode = fs.readFileSync(path.join(__dirname, '../js/animations/rotation_limit_dialog.js'), 'utf8') + '\nthis.RotationLimitDialog = RotationLimitDialog;';
  vm.runInThisContext(dialogCode);
}

setup();

const g1 = new Group();
const g2 = new Group();
RotationLimitDialog.open(g1);
RotationLimitDialog.content_vue.load([g1, g2]);

RotationLimitDialog.content_vue.values[g1.uuid].enabled = true;
RotationLimitDialog.content_vue.values[g1.uuid].min = [-10,-20,-30];
RotationLimitDialog.content_vue.values[g1.uuid].max = [10,20,30];
RotationLimitDialog.content_vue.apply(g1);

RotationLimitDialog.content_vue.values[g2.uuid].enabled = true;
RotationLimitDialog.content_vue.values[g2.uuid].min = [-40,-50,-60];
RotationLimitDialog.content_vue.values[g2.uuid].max = [40,50,60];
RotationLimitDialog.content_vue.apply(g2);

assert.deepStrictEqual(g1.rotation_limit_min, [-10,-20,-30]);
assert.deepStrictEqual(g1.rotation_limit_max, [10,20,30]);
assert.deepStrictEqual(g2.rotation_limit_min, [-40,-50,-60]);
assert.deepStrictEqual(g2.rotation_limit_max, [40,50,60]);
assert.notStrictEqual(g1.rotation_limit_min, g2.rotation_limit_min);

console.log('rotation limit dialog test passed');

