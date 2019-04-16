const CHANNEL_MULTIPLIERS = {
  "rgb": [1/765, 1/765, 1/765, 0],
  "rgba": [1/765, 1/765, 1/765, 1/765],
  "r": [1/255, 0, 0, 0],
  "g": [0, 1/255, 0, 0],
  "b": [0, 0, 1/255, 0],
  "a": [0, 0, 0, 1/255],
}

AFRAME.registerComponent("heightfield", {
  schema: {
    src: { type: "selector" },
    heightScale: { default: .2 },
    channels: { default: "rgb", oneOf: Object.keys(CHANNEL_MULTIPLIERS) },
  },

  init() {
    this.onLoaded = this.onLoaded.bind(this)
    this.loadTextureCallback = this.loadTextureCallback.bind(this)
    this.geometry = undefined
  },

  update(oldData) {
    const data = this.data

    if (oldData.src !== data.src) {
      this.loadTexture(data.src)
    } else if (oldData.heightScale !== data.heightScale || oldData.channels !== data.channels) {
      this.createHeightfield(this.image)
    }
  },

  loadTexture(name) {
    const materialSystem = this.el.sceneEl.systems["material"]
    materialSystem.loadTexture(name, {src: name}, this.loadTextureCallback)
  },

  loadTextureCallback(texture) {
    if (texture && texture.image && texture.image instanceof HTMLElement) {
      this.createHeightfield(texture.image)
    } else {
      console.warn(`heightfield: unable to access image '${this.data.src}'`)
    }
  },

  onLoaded(evt) {
    this.createHeightfield(evt.target)
  },

  createHeightfield(image) {
    if (this.image !== image) {
      if (this.image) {
        this.image.removeEventListener("loaded", this.onLoaded)
      }
      this.image = image
      if (image) {
        image.addEventListener("loaded", this.onLoaded)
      }
    }

    /** @type { HTMLCanvasElement } */
    let canvas

    if (image instanceof HTMLCanvasElement) {
      canvas = image
    } else {
      // @ts-ignore
      canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      canvas.getContext("2d").drawImage(image, 0, 0)
    }

    const width = canvas.width
    const height = canvas.height
    const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data

    // TODO what if the canvas size changes?
    if (!this.mesh) {
      const geometry = new THREE.PlaneBufferGeometry(1, 1, width - 1, height - 1)
      this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    }

    if (this.el.getObject3D("mesh") !== this.mesh) {
      this.el.setObject3D("mesh", this.mesh)
    }

    const positions = this.mesh.geometry.getAttribute("position")
    const multiplier = CHANNEL_MULTIPLIERS[this.data.channels] || CHANNEL_MULTIPLIERS["rgb"]
    const heightScale = this.data.heightScale

    for (let i = 0; i < pixels.length; i += 4) {
      const height = pixels[i]*multiplier[0] + pixels[i+1]*multiplier[1] + pixels[i+2]*multiplier[2] + pixels[i+3]*multiplier[3]
      positions.setZ(i/4, height*heightScale)
    }

    this.mesh.geometry.computeVertexNormals()

    positions.needsUpdate = true
  },
})