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
        if (Array.isArray(mesh.material)) {
          for (let material of mesh.material) {
            if (material[map] && typeof material[map] === "object") {
              material[map].needsUpdate = true
            }
          }
        } else if (mesh.material[map] && typeof mesh.material[map] === "object") {
          mesh.material[map].needsUpdate = true
        }
      }
    }
  },
})