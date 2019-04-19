AFRAME.registerComponent("vertex-color", {
  schema: {
    color: { type: "color" },
    minVertex: { type: "vec3", default: {x:0, y:0, z:0} }, // top left
    maxVertex: { type: "vec3", default: {x:1, y:1, z:1} }, // bottom right
    minSlope: { type: "int", default: 0 }, // absolute slope
    maxSlope: { type: "int", default: 90 }, // absolute slope
    meshName: { default: "mesh" },
  },
  multiple: true,

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.el.addEventListener("object3dset", this.onObject3DSet)
    this.isFirstFrame = true
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update() {
    if (this.isFirstFrame) {
      this.applyVertexColors()
      this.isFirstFrame = false
    } else {
      // if only one of the vertex color components on an element is updated i.e. via the 
      // inspector, then need to update all of them in-order so the colors are applied
      // correctly
      const selfComponents = this.el.components
      for (let name in selfComponents) {
        if (name.indexOf("vertex-color") === 0) {
          selfComponents[name].applyVertexColors()
        }
      }
    }
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
      const materialColor = mesh.material.color

      material.vertexColors = THREE.VertexColors
      if (materialColor.r < .3 && materialColor.g < .3 && materialColor.b < .3) {
        console.warn("material color is very dark, vertex-color will also be dark")
      }

      console.assert(geometry.isBufferGeometry, "vertex-color only supports buffer geometry")

      const positions = geometry.getAttribute("position")
      const normals = geometry.getAttribute("normal")
      let colors = geometry.getAttribute("color")

      if (positions.count > 0 && !colors) {
        const whiteColors = new Float32Array(positions.count*3).fill(1)
        geometry.addAttribute("color", new THREE.Float32BufferAttribute(whiteColors, 3))
        colors = geometry.getAttribute("color")
      }

      // data.min/maxVertex are in the range (0,1), but the X and Z vertices use (-.5,.5)
      const minX = data.minVertex.x-.5, minY = data.minVertex.y, minZ = data.minVertex.z-.5
      const maxX = data.maxVertex.x-.5, maxY = data.maxVertex.y, maxZ = data.maxVertex.z-.5
      const col = new THREE.Color(data.color)
      const EPSILON = 0.00001
      const degToRad = THREE.Math.degToRad

      // minSlope will give the largest cos() and vice versa, use EPSILON to counter rounding errors
      const maxSlope = Math.cos(degToRad(Math.max(0, data.minSlope))) + EPSILON
      const minSlope = Math.cos(degToRad(Math.max(0, data.maxSlope))) - EPSILON
      const vertsPerTriangle = geometry.getIndex() ? 1 : 3

      for (let i = 0, n = colors.count; i < n; i += vertsPerTriangle) {
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

      colors.needsUpdate = true
    }
  },


})