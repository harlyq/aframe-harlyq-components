import { aframeHelper } from "harlyq-helpers"

// @ts-ignore
const COLOR_FLOATS_PER_VERTEX = 3
const VERTICES_PER_TRIANGLE = 3

function parseIntArray(str) {
  return typeof str === "string" ? str.split(",").map(s => parseInt(s, 10)) : str
}

AFRAME.registerComponent("face-color", {
  schema: {
    color: { type: "color" },
    faces: { type: "array", parse: parseIntArray },
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
    this.applyingFaceColors = false
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update() {
    if (this.isFirstFrame) {
      this.applyFaceColors()
      this.isFirstFrame = false
    } else {
      // if only one of the vertex color components on an element is updated i.e. via the 
      // Inspector, then need to update all of them in-order so that the colors are applied
      // correctly
      const selfComponents = this.el.components
      for (let name in selfComponents) {
        if (name.indexOf("face-color") === 0) {
          selfComponents[name].applyFaceColors()
        }
      }
    }
  },

  onObject3DSet(e) {
    if (e.target === this.el && e.detail.type === this.data.meshName) {
      this.applyFaceColors()
    }
  },

  applyFaceColors() {
    const data = this.data
    const mesh = this.el.getObject3D(data.meshName)

    if (mesh && !this.applyingFaceColors) {
      let geometry = mesh.geometry
      let rebuildMesh = false

      const materialColor = mesh.material.color
      if (materialColor.r < .3 && materialColor.g < .3 && materialColor.b < .3) {
        aframeHelper.warn("material color is very dark, face-color will also be dark")
      }

      if (geometry.isInstancedBufferGeometry) {
        aframeHelper.warn("face-color does not support InstancedBufferGeometry")
        return
      }

      this.applyingFaceColors = true // don't reapply colors if we are in the process of applying colors

      if (geometry.isGeometry) {
        geometry = new THREE.BufferGeometry().copy(geometry)
        rebuildMesh = true
      }

      if (geometry.index) {
        geometry = geometry.toNonIndexed()
        rebuildMesh = true
      }

      if (!geometry.getAttribute("color")) {
        const whiteColors = new Float32Array(geometry.getAttribute("position").count*COLOR_FLOATS_PER_VERTEX).fill(1)
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX))
      }

      // if (!geometry.getAttribute("color")) {
      //   this.allocateVertexColors(geometry, mesh.material.color)
      // }

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
      
      for (let i = 0, n = colors.count, faceIndex = 0; i < n; i += VERTICES_PER_TRIANGLE, faceIndex++) {
        let paintTriangle = false

        if (data.faces.length > 0 && !data.faces.includes(faceIndex)) {
          paintTriangle = false
        } else {
          paintTriangle = true

          // if any vertex in the triangle fails, then DO NOT paint any of the vertices for this triangle
          for (let j = 0; j < VERTICES_PER_TRIANGLE; j++) {
            const k = i + j
            const x = positions.getX(k)
            const y = positions.getY(k)
            const z = positions.getZ(k)
            if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
              paintTriangle = false
              break
            }

            const slope = Math.abs(normals.getY(k)) // dot(normal,UP)
            if (slope < minSlope || slope > maxSlope) {
              paintTriangle = false
              break
            }  
          }
        } 

        if (paintTriangle) {
          for (let j = 0; j < VERTICES_PER_TRIANGLE; j++) {
            colors.setXYZ(i+j, col.r, col.g, col.b)
          }
        }
      }

      colors.needsUpdate = true

      const material = mesh.material
      material.vertexColors = THREE.VertexColors
      // material.color.setRGB(1,1,1)

      if (rebuildMesh) {
        console.info(`face-color rebuilding mesh '${data.meshName}'`)
        const newMesh = new THREE.Mesh(geometry, material)
        this.el.setObject3D(data.meshName, newMesh)
      }

      this.applyingFaceColors = false
    }
  },

  // allocateVertexColors(geometry, defaultColor) {
  //   const positions = geometry.getAttribute("position")
  //   const newColors = new Float32Array(positions.count*COLOR_FLOATS_PER_VERTEX)

  //   for (let i = 0; i < positions.count; i++) {
  //     const j = i*COLOR_FLOATS_PER_VERTEX
  //     newColors[j] = defaultColor.r
  //     newColors[j+1] = defaultColor.g
  //     newColors[j+2] = defaultColor.b
  //   }

  //   geometry.setAttribute("color", new THREE.Float32BufferAttribute(newColors, COLOR_FLOATS_PER_VERTEX))
  // },
})