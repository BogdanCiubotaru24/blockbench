const Vue = globalThis.Vue || require('vue');

var RotationLimitDialog = new Dialog({
    id: 'ik_limits_editor',
    title: 'IK Rotation Limits',
    width: 560,
    singleButton: true,
    component: {
        data() {
            return {
                groups: [],
                values: {}
            };
        },
        methods: {
            load(groups) {
                groups = (groups || []).filter(g => g instanceof Group);
                if (!groups.length) {
                    Blockbench.showMessageBox({title:'Select a bone', message:'Please select a bone to edit rotation limits.'});
                    RotationLimitDialog.hide();
                    return;
                }
                this.groups = groups;
                this.values = {};
                groups.forEach(g => {
                    this.$set(this.values, g.uuid, {
                        enabled: !!g.rotation_limit_enabled,
                        min: Array.isArray(g.rotation_limit_min) ? g.rotation_limit_min.slice() : [-180, -180, -180],
                        max: Array.isArray(g.rotation_limit_max) ? g.rotation_limit_max.slice() : [180, 180, 180],
                        hinge_lock: !!g.rotation_hinge_lock,
                        hinge_axis: Math.min(2, Math.max(0, Math.floor(g.rotation_hinge_axis || 0))),
                        pole_enabled: !!g.rotation_pole_enabled,
                        pole_auto_reset: !!g.rotation_pole_auto_reset
                    });
                });
            },
            axisName(i) {
                return ['X','Y','Z'][i];
            },
            apply(g) {
                const v = this.values[g.uuid];
                if (!v) return;
                const axis = Math.min(2, Math.max(0, Math.floor(v.hinge_axis || 0)));
                if (!v.hinge_lock) v.pole_enabled = false;
                const prevPole = g.rotation_pole_enabled;
                Undo.initEdit({groups: [g]});
                g.rotation_limit_enabled = !!v.enabled;
                g.rotation_limit_min = v.min.slice();
                g.rotation_limit_max = v.max.slice();
                g.rotation_hinge_lock = !!v.hinge_lock;
                g.rotation_hinge_axis = axis;
                g.rotation_pole_enabled = !!v.pole_enabled;
                g.rotation_pole_auto_reset = !!v.pole_auto_reset;
                Undo.finishEdit('Set IK rotation limits');
                Canvas.updateAllBones([g]);
                if (prevPole !== g.rotation_pole_enabled) {
                    if (g.rotation_pole_enabled) {
                        const pole_parent = g.parent instanceof Group ? g.parent : g;
                        let pole = new PoleVector({name: g.name + '_pole'}).addTo(pole_parent).init();
                        pole.createUniqueName();
                        g.rotation_pole_parent_uuid = pole.parent.uuid;
                        const axisVec = axis === 0 ? new THREE.Vector3(1,0,0) : axis === 1 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(0,0,1);
                        const axisWorld = axisVec.clone().applyQuaternion(g.mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
                        const posWorld = g.mesh.getWorldPosition(new THREE.Vector3()).add(axisWorld.multiplyScalar(6));
                        if (pole.parent && pole.parent.mesh) pole.parent.mesh.worldToLocal(posWorld);
                        pole.position.V3_set(posWorld);
                        pole.preview_controller.updateTransform(pole);
                        g.rotation_pole_uuid = pole.uuid;
                        pole.select();
                    } else {
                        const pole = g.rotation_pole_uuid && PoleVector.all.find(p => p.uuid === g.rotation_pole_uuid);
                        if (pole) pole.remove();
                        g.rotation_pole_uuid = undefined;
                        g.rotation_pole_parent_uuid = undefined;
                    }
                }
            }
        },
        template: `
            <div class="ik_limits_editor">
                <div v-for="g in groups" :key="g.uuid" class="ik_limit_bone">
                    <h3>{{ g.name || 'Bone' }}</h3>
                    <label class="checkbox"><input type="checkbox" v-model="values[g.uuid].enabled" @change="apply(g)"> Enable Limits</label>
                    <div class="ik_limit_axis" v-for="i in 3" :key="i">
                        <label>Min {{ axisName(i-1) }}<input type="number" v-model.number="values[g.uuid].min[i-1]" @change="apply(g)"></label>
                        <label>Max {{ axisName(i-1) }}<input type="number" v-model.number="values[g.uuid].max[i-1]" @change="apply(g)"></label>
                    </div>
                    <label class="checkbox"><input type="checkbox" v-model="values[g.uuid].hinge_lock" @change="apply(g)"> Hinge Lock</label>
                    <select v-model.number="values[g.uuid].hinge_axis" @change="apply(g)" v-if="values[g.uuid].hinge_lock">
                        <option :value="0">X</option>
                        <option :value="1">Y</option>
                        <option :value="2">Z</option>
                    </select>
                    <label class="checkbox" v-if="values[g.uuid].hinge_lock"><input type="checkbox" v-model="values[g.uuid].pole_enabled" @change="apply(g)"> Pole Vector</label>
                    <label class="checkbox" v-if="values[g.uuid].pole_enabled"><input type="checkbox" v-model="values[g.uuid].pole_auto_reset" @change="apply(g)"> Auto Reset Pole</label>
                </div>
            </div>
        `
    }
});

RotationLimitDialog.open = function(clicked_group) {
    let groups = Group.all.filter(g => g.selected);
    if (!groups.length && clicked_group) groups = [clicked_group];
    if (!groups.length) {
        Blockbench.showMessageBox({title:'Select a bone', message:'Please select a bone to edit rotation limits.'});
        return;
    }
    if (!this.content_vue) this.build();
    Vue.nextTick(() => this.content_vue.load(groups));
    this.show();
};

