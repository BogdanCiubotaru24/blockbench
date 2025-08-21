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
    init() {
        if (this.parent instanceof Group == false) {
            this.addTo(Group.first_selected);
        }
        super.init();
        return this;
    }
}
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
            const material = new THREE.MeshBasicMaterial({color: baseColor});
            const mesh = new THREE.Mesh(geometry, material);
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
        },
        updateSelection(element) {
            let {mesh} = element;
            mesh.material.color.set(element.selected ? gizmo_colors.outline : baseColor);
            mesh.material.depthTest = !element.selected;
            mesh.renderOrder = element.selected ? 100 : 0;
            this.dispatchEvent('update_selection', {element});
        }
    });
})();
