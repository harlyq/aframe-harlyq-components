
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
    rotate: { type: "number" },
    pivot: { type: "vec2", default: {x:.5, y:.5} },
    meshName: { default: "mesh" },
    wrapS: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase},
    wrapT: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase},
    maps: { type: "string", default: "map" },
    textureFrame: { type: "vec2", default: {x:1, y:1} },
    frame: { default: 0 },
  },

  multiple: true,

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.onMaterialTextureLoaded = this.onMaterialTextureLoaded.bind(this)

    this.el.addEventListener("object3dset", this.onObject3DSet)
    this.el.addEventListener("materialtextureloaded", this.onMaterialTextureLoaded)
  },

  remove() {
    this.el.removeEventListener("materialtextureloaded", this.onMaterialTextureLoaded)
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update(oldData) {
    const data = this.data

    if (oldData.rotate !== data.rotate) {
      this.rotate = THREE.Math.degToRad(data.rotate)
    }

    if (oldData.wrapS !== data.wrapS || oldData.wrapT !== data.wrapT) {
      this.wrapS = WRAPPING_MAP[data.wrapS] || THREE.RepeatWrapping
      this.wrapT = WRAPPING_MAP[data.wrapT] || THREE.RepeatWrapping
    }

    if (oldData.maps !== data.maps) {
      this.maps = data.maps.split(",").map(x => x.trim())
      this.cloneMaps()
    }

    this.updateUVs()
  },

  onObject3DSet(e) {
    if (e.target === this.el && e.detail.type === this.data.meshName) {
      this.cloneMaps()
      this.updateUVs()
    }
  },

  onMaterialTextureLoaded(e) {
    if (e.target === this.el) {
      this.cloneMaps()
      this.updateUVs()
    }
  },

  updateUVs() {
    const data = this.data
    const repeat = data.repeat
    const rotate = this.rotate
    const pivot = data.pivot
    const wrapS = this.wrapS
    const wrapT = this.wrapT
    const textureFrame = data.textureFrame
    const frame = Math.trunc( data.frame )
    const frameX = frame % textureFrame.x / textureFrame.x
    const frameY = 1 - Math.floor( frame / textureFrame.x ) / textureFrame.y
    const offsetX = data.offset.x + frameX - pivot.x + pivot.x/textureFrame.x
    const offsetY = data.offset.y + frameY - pivot.y - ( 1 - pivot.y )/textureFrame.y

    function setElements(map) {
      if (map) {
        map.wrapS = wrapS
        map.wrapT = wrapT
        map.offset.set(offsetX, offsetY)
        map.repeat.copy(repeat).divide(textureFrame)
        map.center.copy(pivot)
        map.rotation = rotate
        // map.needsUpdate = true
      }
    }

    const mesh = this.el.getObject3D(this.data.meshName)
    if (mesh && mesh.material) {
      for (let map of this.maps) {
        setElements(mesh.material[map])
      }
    }
  },

  // by default a single texture is assigned to each image file, so if we have
  // multiple uv-transforms that use the same image we need to make a copy of the texture
  cloneMaps() {
    const mesh = this.el.getObject3D(this.data.meshName)
    if (mesh && mesh.material && this.maps) {
      for (let map of this.maps) {
        const texture = mesh.material[map]
        if (texture) {
          mesh.material[map] = texture.clone()
          mesh.material[map].needsUpdate = true
        }
      }
    }
  }
})
