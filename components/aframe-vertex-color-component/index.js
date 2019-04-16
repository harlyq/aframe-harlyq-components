AFRAME.registerComponent("vertex-color", {
  schema: {
    color: { type: "color" },
    start: { type: "int", default: 0 },
    end: { type: "int", default: -1 },
    meshName: { default: "mesh" }
  },
  multiple: true,

  update() {
    const data = this.data
    const mesh = this.el.getObject3D(data.meshName)
    if (mesh) {
      const geometry = mesh.geometry
      const material = mesh.material
      material.vertexColors = THREE.VertexColors

      console.assert(!geometry.isGeometry, "vertex-color does not support standard geometry")

      let positions = geometry.getAttribute("position")
      let colors = geometry.getAttribute("color")
      if (positions.count > 0 && !colors) {
        const whiteColors = new Float32Array(positions.count*3).fill(1)
        geometry.addAttribute("color", new THREE.Float32BufferAttribute(whiteColors, 3))
        colors = geometry.getAttribute("color")
      }

      const start = Math.max(0, data.start)
      const end = Math.max( Math.min(start, positions.count - 1), data.end < 0 ? colors.count + data.end : data.end)
      const col = new THREE.Color(data.color)
      for (let i = start; i <= end; i++) {
        colors.setXYZ(i, col.r, col.g, col.b)
      }
    }
  }
})