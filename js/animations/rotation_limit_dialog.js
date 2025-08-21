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
                this.groups = groups;
                this.values = {};
                groups.forEach(g => {
                    this.$set(this.values, g.uuid, {
                        enabled: !!g.rotation_limit_enabled,
                        min: Array.isArray(g.rotation_limit_min) ? g.rotation_limit_min.slice() : [-180, -180, -180],
                        max: Array.isArray(g.rotation_limit_max) ? g.rotation_limit_max.slice() : [180, 180, 180],
                        hinge_lock: !!g.rotation_hinge_lock,
                        hinge_axis: Math.min(2, Math.max(0, Math.floor(g.rotation_hinge_axis || 0)))
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
                Undo.initEdit({groups: [g]});
                g.rotation_limit_enabled = !!v.enabled;
                g.rotation_limit_min = v.min.slice();
                g.rotation_limit_max = v.max.slice();
                g.rotation_hinge_lock = !!v.hinge_lock;
                g.rotation_hinge_axis = axis;
                Undo.finishEdit('Set IK rotation limits');
                Canvas.updateAllBones([g]);
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
                </div>
            </div>
        `
    }
});

RotationLimitDialog.open = function(clicked_group) {
    let groups = Group.all.filter(g => g.selected);
    if (!groups.length) groups = [clicked_group];
    this.content_vue.load(groups);
    this.show();
};

