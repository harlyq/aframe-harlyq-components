AFRAME.registerComponent("vertex-color", {
  schema: {
    color: { type: "color" },
    minVertex: { type: "vec3", default: {x:-.5, y:-.5, z:-.5} },
    maxVertex: { type: "vec3", default: {x:.5, y:.5, z:.5} },
    minSlope: { default: 0 },
    maxSlope: { default: 90 },
    meshName: { default: "mesh" },
  },
  multiple: true,

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.el.addEventListener("object3dset", this.onObject3DSet)
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update() {
    this.applyVertexColors()
  },

  onObject3DSet(e) {
    if (e.target === this.el && e.detail.type === this.data.meshName) {
      this.applyVertexColors()
    }
  },

  applyVertexColors() {
    const data = this.data
    const mesh = this.el.getObject3D(data.meshName)
    if (mesh) {
      const geometry = mesh.geometry
      const material = mesh.material
      material.vertexColors = THREE.VertexColors

      console.assert(geometry.isBufferGeometry, "vertex-color only supports buffer geometry")

      const positions = geometry.getAttribute("position")
      const normals = geometry.getAttribute("normal")
      let colors = geometry.getAttribute("color")

      if (positions.count > 0 && !colors) {
        const whiteColors = new Float32Array(positions.count*3).fill(1)
        geometry.addAttribute("color", new THREE.Float32BufferAttribute(whiteColors, 3))
        colors = geometry.getAttribute("color")
      }

      const col = new THREE.Color(data.color)
      const EPSILON = 0.00001
      const minX = data.minVertex.x, minY = data.minVertex.y, minZ = data.minVertex.z
      const maxX = data.maxVertex.x, maxY = data.maxVertex.y, maxZ = data.maxVertex.z
      const degToRad = THREE.Math.degToRad

      // minSlope will give the largest cos() and vice versa, use EPSILON to counter rounding errors
      const maxSlope = Math.cos(degToRad(Math.max(0, data.minSlope))) + EPSILON
      const minSlope = Math.cos(degToRad(Math.max(0, data.maxSlope))) - EPSILON
      const vertsPerTriangle = geometry.getIndex() ? 1 : 3

      for (let i = 0, n = colors.count; i <= n; i += vertsPerTriangle) {
        let paintVertex = true

        // if any vertex in the triangle fails, then don't paint any of the vertices for this triangle
        for (let j = 0; j < vertsPerTriangle; j++) {
          const k = i + j
          const x = positions.getX(k)
          const y = positions.getY(k)
          const z = positions.getZ(k)
          if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
            paintVertex = false
            break
          }

          const slope = Math.abs(normals.getY(k)) // dot(normal,UP)
          if (slope < minSlope || slope > maxSlope) {
            paintVertex = false
            break
          }  
        }

        if (paintVertex) {
          for (let j = 0; j < vertsPerTriangle; j++) {
            colors.setXYZ(i+j, col.r, col.g, col.b)
          }
        }
      }
    }
  },


})