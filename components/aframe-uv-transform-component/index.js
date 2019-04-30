
// @ts-ignore
function toLowerCase(str) { return str.toLowerCase() }

const WRAPPING_MAP = {
  "repeat": THREE.RepeatWrapping,
  "clamptoedge": THREE.ClampToEdgeWrapping,
  "mirroredrepeat": THREE.MirroredRepeatWrapping,
}

AFRAME.registerComponent("uv-transform", {
  schema: {
    offset: { type: "vec2" },
    repeat: { type: "vec2", default: {x:1, y:1} },
    rotation: { type: "number" },
    center: { type: "vec2", default: {x:.5, y:.5} },
    meshName: { default: "mesh" },
    wrapS: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase},
    wrapT: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase},
    maps: { type: "string", default: "map" }
  },

  multiple: true,

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this)

    this.el.addEventListener("object3dset", this.onObject3DSet)
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update(oldData) {
    const data = this.data

    if (oldData.rotation !== data.rotation) {
      this.rotation = THREE.Math.degToRad(data.rotation)
    }

    if (oldData.wrapS !== data.wrapS || oldData.wrapT !== data.wrapT) {
      this.wrapS = WRAPPING_MAP[data.wrapS] || THREE.RepeatWrapping
      this.wrapT = WRAPPING_MAP[data.wrapT] || THREE.RepeatWrapping
    }

    if (oldData.maps !== data.maps) {
      this.maps = data.maps.split(",").map(x => x.trim())
    }

    this.updateUVs()
  },

  onObject3DSet(e) {
    if (e.target === this.el && e.detail.type === this.data.meshName) {
      this.updateUVs()
    }
  },

  updateUVs() {
    const data = this.data
    const offset = data.offset
    const repeat = data.repeat
    const rotation = this.rotation
    const center = data.center
    const wrapS = this.wrapS
    const wrapT = this.wrapT

    function setElements(map) {
      if (map) {
        map.wrapS = wrapS
        map.wrapT = wrapT
        map.offset.copy(offset)
        map.repeat.copy(repeat)
        map.center.copy(center)
        map.rotation = rotation
      }
    }

    const mesh = this.el.getObject3D(this.data.meshName)
    if (mesh && mesh.material) {
      for (let map of this.maps) {
        setElements(mesh.material[map])
      }
    }
  }
})
