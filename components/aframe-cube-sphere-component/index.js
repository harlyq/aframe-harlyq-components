AFRAME.registerComponent("cube-sphere", {
  schema: {
    radius: { default: 1 },
    segments: { default: 16 },
  },

  update() {
    this.createMesh()
  },

  createMesh() {
    const segments = this.data.segments
    const geo = new THREE.BoxBufferGeometry(1, 1, 1, segments, segments, segments)
    const position = geo.getAttribute("position")
    const normal = geo.getAttribute("normal")
    const CUBE_COLORS = ["red", "green", "blue", "yellow", "orange", "purple"]
    const newPos = new THREE.Vector3()

    for (let i = 0; i < position.count; i++) {
      const i3 = i*3
      newPos.fromArray(position.array, i3)
      newPos.normalize()
      newPos.toArray(position.array, i3)
      newPos.toArray(normal.array, i3)
    }
    position.needsUpdate = true
    normal.needsUpdate = true

    const mesh = new THREE.Mesh( geo, CUBE_COLORS.map( color => new THREE.MeshBasicMaterial( { color } ) ) )
    this.el.setObject3D("mesh", mesh)
  },
})