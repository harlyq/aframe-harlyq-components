AFRAME.registerComponent('texture-updater', {
  schema: {
    maps: { default: "map" },
    meshName: { default: "mesh" },
  },

  update() {
    this.maps = this.data.maps.split(",").map(x => x.trim())
  },

  tick() {
    const mesh = this.el.getObject3D(this.data.meshName)
    if (mesh && mesh.material) {
      for (let map of this.maps) {
        if (mesh.material[map]) {
          mesh.material[map].needsUpdate = true
        }
      }
    }
  },
})