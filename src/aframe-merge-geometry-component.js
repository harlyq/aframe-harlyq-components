// remix of https://github.com/supermedium/superframe/tree/master/components/geometry-merger
AFRAME.registerComponent('merge-geometry', {
	schema: {
		preserveOriginal: {default: false}
	},

	init: function () {
		var self = this;

		var geometry = new THREE.Geometry();

		this.el.object3D.traverse(function (mesh) {
			if (mesh.type !== 'Mesh') { return; }

			var meshGeometry = mesh.geometry.isBufferGeometry ? new THREE.Geometry().fromBufferGeometry(mesh.geometry) : mesh.geometry

			// Merge. Use parent's matrix due to A-Frame's <a-entity>(Group-Mesh) hierarchy.
			mesh.parent.updateMatrix();
			geometry.merge(meshGeometry, mesh.parent.matrix);

			// Remove mesh if not preserving.
			if (!self.data.preserveOriginal) { 
				mesh.parent.remove(mesh); 
			}
		});

		const mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry));
		this.el.setObject3D('mesh', mesh);
	}
});
