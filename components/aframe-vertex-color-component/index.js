import { aframeHelper } from "harlyq-helpers"

// @ts-ignore
const COLOR_FLOATS_PER_VERTEX = 3

function parseIntArray(str) {
  return typeof str === "string" ? str.split(",").map(s => parseInt(s, 10)) : str
}

AFRAME.registerComponent("vertex-color", {
  schema: {
    color: { type: "color" },
    verts: { type: "array", parse: parseIntArray },
    minPosition: { type: "vec3", default: {x:-1e10, y:-1e10, z:-1e10} }, // top left
    maxPosition: { type: "vec3", default: {x:1e10, y:1e10, z:1e10} }, // bottom right
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
        aframeHelper.warn("material color is very dark, vertex-color will also be dark")
      }

      console.assert(geometry.isBufferGeometry, "vertex-color only supports buffer geometry")

      if (!geometry.getAttribute("color")) {
        const whiteColors = new Float32Array(geometry.getAttribute("position").count*COLOR_FLOATS_PER_VERTEX).fill(1)
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX))
      }

      const positions = geometry.getAttribute("position")
      const normals = geometry.getAttribute("normal")
      const colors = geometry.getAttribute("color")

      // data.min/maxPosition are in the range (0,1), but the X and Z vertices use (-.5,.5)
      const minX = data.minPosition.x-.5, minY = data.minPosition.y, minZ = data.minPosition.z-.5
      const maxX = data.maxPosition.x-.5, maxY = data.maxPosition.y, maxZ = data.maxPosition.z-.5
      const col = new THREE.Color(data.color)
      const EPSILON = 0.00001
      const degToRad = THREE.Math.degToRad

      // minSlope will give the largest cos() and vice versa, use EPSILON to counter rounding errors
      const maxSlope = Math.cos(degToRad(Math.max(0, data.minSlope))) + EPSILON
      const minSlope = Math.cos(degToRad(Math.max(0, data.maxSlope))) - EPSILON

      for (let i = 0, n = colors.count; i < n; i++) {

        if (data.verts.length > 0 && !data.verts.includes(i)) {
          continue
        }

        const x = positions.getX(i)
        const y = positions.getY(i)
        const z = positions.getZ(i)
        if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
          continue
        }

        const slope = Math.abs(normals.getY(i)) // dot(normal,UP)
        if (slope < minSlope || slope > maxSlope) {
          continue
        }  

        colors.setXYZ(i, col.r, col.g, col.b)
      }

      colors.needsUpdate = true
    }
  },


})