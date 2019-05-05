// remix of https://github.com/supermedium/superframe/tree/master/components/geometry-merger
AFRAME.registerComponent("merge-geometry", {
	dependencies: ['material'],

	schema: {
		keepColor: {default: true},
		keepOriginal: {default: false},
	},

	init() {
		this.mergeGeometry()

		// TODO re-merge if there is a setobject3d on any of the children
	},

	mergeGeometry() {
		const self = this;
		const geometry = new THREE.Geometry();
		const invSelfMatrixWorld = new THREE.Matrix4()
		const object3D = this.el.object3D

		object3D.updateMatrixWorld(true)
		invSelfMatrixWorld.getInverse(object3D.matrixWorld)

		object3D.traverse(function (mesh) {
			if (mesh.type !== "Mesh") { return; }

			const meshGeometry = mesh.geometry.isBufferGeometry ? new THREE.Geometry().fromBufferGeometry(mesh.geometry) : mesh.geometry

			if (self.data.keepColor) {
				const materialColor = Array.isArray(mesh.material) ? mesh.material[0].color : mesh.material.color
				meshGeometry.faces.forEach(face => {
					if (face.vertexColors.length === 3) {
						face.vertexColors[0].multiply(materialColor)
						face.vertexColors[1].multiply(materialColor)
						face.vertexColors[2].multiply(materialColor)
					} else {
						face.color.multiply(materialColor)
					}
				})
			}

			// Use the world matrices as we want to capture all transforms from this.el down
			const matrixRelative = mesh.matrixWorld.clone().premultiply(invSelfMatrixWorld)
			geometry.merge(meshGeometry, matrixRelative)

			// Remove mesh if not preserving.
			if (!self.data.keepOriginal) { 
				mesh.parent.remove(mesh)
			}
		});

		const mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry))
		this.el.setObject3D("mesh", mesh)

		// the setObject3D will trigger the material component to setup the material, so
		// we can force it to show vertex colors
		if (self.data.keepColor) {
			const material = this.el.getObject3D("mesh").material
			material.vertexColors = THREE.VertexColors
		}
	}
});
