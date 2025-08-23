class PoleVector extends OutlinerElement {
    constructor(data, uuid) {
        super(data, uuid);
        for (var key in PoleVector.properties) {
            PoleVector.properties[key].reset(this);
        }
        if (data) {
            this.extend(data);
        }
    }
    get origin() {
        return this.position;
    }
    extend(object) {
        if (object.from) this.position.V3_set(object.from);
        for (var key in PoleVector.properties) {
            PoleVector.properties[key].merge(this, object);
        }
        this.sanitizeName();
        Merge.boolean(this, object, 'export');
        return this;
    }
    getUndoCopy() {
        var copy = new PoleVector(this);
        copy.uuid = this.uuid;
        copy.type = this.type;
        delete copy.parent;
        return copy;
    }
    getSaveCopy() {
        let save = {};
        for (var key in PoleVector.properties) {
            PoleVector.properties[key].copy(this, save);
        }
        save.export = this.export ? undefined : false;
        save.uuid = this.uuid;
        save.type = 'pole_vector';
        return save;
    }
    getWorldCenter(with_animation) {
        var pos = new THREE.Vector3();
        var q = Reusable.quat1.set(0, 0, 0, 1);
        if (this.parent instanceof Group) {
            THREE.fastWorldPosition(this.parent.mesh, pos);
            this.parent.mesh.getWorldQuaternion(q);
            var offset2 = Reusable.vec2.fromArray(this.parent.origin).applyQuaternion(q);
            pos.sub(offset2);
        }
        let offset;
        if (with_animation && Animation.selected) {
            offset = Reusable.vec3.copy(this.mesh.position);
            if (this.parent instanceof Group) {
                offset.x += this.parent.origin[0];
                offset.y += this.parent.origin[1];
                offset.z += this.parent.origin[2];
            }
        } else {
            offset = Reusable.vec3.fromArray(this.position);
        }
        offset.applyQuaternion(q);
        pos.add(offset);

        return pos;
    }
    init() {
        if (!(this.parent instanceof Group) && !(this.parent instanceof NullObject)) {
            this.addTo(Group.first_selected);
        }
        super.init();
        return this;
    }
}

PoleVector.prototype.addTo = function(parent, index) {
    OutlinerElement.prototype.addTo.call(this, parent, index);
    const bone = Group.all.find(g => g.rotation_pole_uuid === this.uuid);
    if (bone) {
        bone.rotation_pole_parent_uuid = this.parent && this.parent.uuid;
    }
    return this;
};
PoleVector.prototype.title = 'Pole Vector';
PoleVector.prototype.type = 'pole_vector';
PoleVector.prototype.icon = 'fa-bullseye';
PoleVector.prototype.movable = true;
PoleVector.prototype.rotatable = false;
PoleVector.prototype.visibility = true;
PoleVector.prototype.buttons = [
    Outliner.buttons.export,
    Outliner.buttons.locked,
    Outliner.buttons.visibility,
];
PoleVector.prototype.needsUniqueName = true;
PoleVector.prototype.menu = new Menu([
    ...Outliner.control_menu_group,
    new MenuSeparator('pole'),
    {
        id: 'hide_pole',
        name: 'Hide Pole',
        icon: 'fa-eye-slash',
        click(clicked) {
            const poles = PoleVector.selected.length ? PoleVector.selected.slice() : [clicked];
            Undo.initEdit({elements: poles});
            poles.forEach(p => {
                const bone = Group.all.find(g => g.rotation_pole_uuid === p.uuid);
                if (bone && bone.rotation_pole_enabled === false) return;
                p.visibility = false;
                p.preview_controller.updateVisibility(p);
                if (bone) {
                    bone.rotation_pole_enabled = false;
                    if (!bone.rotation_hinge_lock) {
                        bone.rotation_pole_uuid = undefined;
                    }
                }
            });
            Undo.finishEdit('Hide pole vector');
            if (Modes.animate && !this._runningPreview) {
                this._runningPreview = true;
                Animator.preview();
                this._runningPreview = false;
            }
        }
    },
    {
        id: 'reset_pole_to_joint',
        name: 'Reset Pole to Joint',
        icon: 'fa-undo',
        click(clicked) {
            const poles = PoleVector.selected.length ? PoleVector.selected.slice() : [clicked];
            Undo.initEdit({elements: poles});
            poles.forEach(p => {
                const bone = Group.all.find(g => g.rotation_pole_uuid === p.uuid);
                if (bone && bone.rotation_pole_enabled !== false && bone.mesh) {
                    const pos = bone.mesh.getWorldPosition(new THREE.Vector3());
                    if (p.parent && p.parent.mesh) {
                        p.parent.mesh.worldToLocal(pos);
                        pos.divide(p.parent.mesh.scale);
                    }
                    p.position.V3_set(pos);
                    p.preview_controller.updateTransform(p);
                }
            });
            Undo.finishEdit('Reset pole vector');
            if (Modes.animate) Animator.preview();
        }
    },
    {
        id: 'toggle_pole_auto_reset',
        name: 'Auto Reset Pole',
        icon: 'fa-sync',
        click(clicked) {
            const poles = PoleVector.selected.length ? PoleVector.selected.slice() : [clicked];
            const bones = poles.map(p => Group.all.find(g => g.rotation_pole_uuid === p.uuid)).filter(Boolean);
            if (!bones.length) return;
            Undo.initEdit({groups: bones});
            bones.forEach(b => b.rotation_pole_auto_reset = !b.rotation_pole_auto_reset);
            Undo.finishEdit('Toggle pole auto reset');
            if (Modes.animate) Animator.preview();
        }
    },
    new MenuSeparator('manage'),
    'rename',
    'toggle_visibility',
    'delete'
]);

new Property(PoleVector, 'string', 'name', {default: 'pole_vector'});
new Property(PoleVector, 'vector', 'position');
new Property(PoleVector, 'boolean', 'visibility', {default: true});
new Property(PoleVector, 'boolean', 'locked');

OutlinerElement.registerType(PoleVector, 'pole_vector');

(function() {
    const baseColor = new THREE.Color(0xff00ff);
    new NodePreviewController(PoleVector, {
        setup(element) {
            const geometry = new THREE.ConeGeometry(0.3, 0.6, 8);
            geometry.translate(0, -0.3, 0); // tip at origin
            const material = new THREE.MeshBasicMaterial({color: baseColor});
            const mesh = new THREE.Mesh(geometry, material);
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(),
                new THREE.Vector3()
            ]);
            const lineMaterial = new THREE.LineBasicMaterial({color: baseColor});
            const line = new THREE.Line(lineGeometry, lineMaterial);
            mesh.add(line);
            mesh.line = line;
            Project.nodes_3d[element.uuid] = mesh;
            mesh.name = element.uuid;
            mesh.type = element.type;
            mesh.isElement = true;
            mesh.visible = element.visibility;
            mesh.rotation.order = 'ZYX';
            this.updateTransform(element);
            this.dispatchEvent('setup', {element});
        },
        updateTransform(element) {
            NodePreviewController.prototype.updateTransform.call(this, element);
            const line = element.mesh.line;
            if (line) {
                const bone = Group.all.find(g => g.rotation_pole_uuid === element.uuid);
                if (bone && bone.mesh) {
                    const pole_pos = element.mesh.getWorldPosition(new THREE.Vector3());
                    const bone_pos = bone.mesh.getWorldPosition(new THREE.Vector3());
                    const joint_local = element.mesh.worldToLocal(bone_pos.clone());
                    line.geometry.setFromPoints([new THREE.Vector3(), joint_local]);

                    const dir = bone_pos.clone().sub(pole_pos).normalize(); // pole→joint
                    element.mesh.quaternion.setFromUnitVectors(
                        new THREE.Vector3(0, -1, 0), dir
                    );
                } else {
                    line.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
                    element.mesh.quaternion.identity();
                }
            }
            if (!this._runningPreview) {
                this._runningPreview = true;
                Animator.preview();
                this._runningPreview = false;
            }
        },
        updateSelection(element) {
            let {mesh} = element;
            const color = element.selected ? gizmo_colors.outline : baseColor;
            mesh.material.color.set(color);
            mesh.material.depthTest = !element.selected;
            mesh.renderOrder = element.selected ? 100 : 0;
            if (mesh.line) {
                mesh.line.material.color.set(color);
                mesh.line.material.depthTest = !element.selected;
                mesh.line.renderOrder = element.selected ? 100 : 0;
            }
            this.dispatchEvent('update_selection', {element});
        },
        remove(element) {
            if (element.mesh && element.mesh.line && element.mesh.line.geometry) {
                element.mesh.line.geometry.dispose();
            }
            NodePreviewController.prototype.remove.call(this, element);
        }
    });
})();
