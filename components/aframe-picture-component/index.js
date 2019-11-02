const WHITE_TEXTURE = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat)

AFRAME.registerComponent("picture", {
  dependencies: ['material '],

  schema: {
    src: { type: 'string' },
    side: { oneOf: ['front', 'back', 'double'], default: 'double' },
  },

  init() {
    this.geo = undefined
    this.mesh = undefined
    this.material = undefined

    this.onMaterialTextureLoaded = this.onMaterialTextureLoaded.bind(this)
    this.el.addEventListener("materialtextureloaded", this.onMaterialTextureLoaded)
  },

  remove() {
    this.el.removeEventListener("materialtextureloaded", this.onMaterialTextureLoaded)
  },

  update(oldData) {
    const data = this.data

    if (!this.mesh) {
      this.createMesh()
    }

    if (data.src !== oldData.src) {
      this.el.setAttribute("material", "src", data.src)
      this.el.setAttribute("material", "side", data.side)
    }
  },

  createMesh() {
    this.geo = new THREE.PlaneBufferGeometry()
    this.material = new THREE.MeshStandardMaterial( { side: THREE.DoubleSide } )
    this.mesh = new THREE.Mesh(this.geo, this.material)
    this.el.setObject3D("mesh", this.mesh)
  },

  resizeMesh(imageWidth, imageHeight) {
    const maxLength = Math.max(imageWidth, imageHeight)
    const positions = this.geo.getAttribute("position")
    const w_2 = .5*imageWidth/maxLength
    const h_2 = .5*imageHeight/maxLength
    positions.setXYZ(0, -w_2,  h_2, 0)
    positions.setXYZ(1,  w_2,  h_2, 0)
    positions.setXYZ(2, -w_2, -h_2, 0)
    positions.setXYZ(3,  w_2, -h_2, 0)
    positions.needsUpdate = true
  },

  onMaterialTextureLoaded(event) {
    const image = event.detail.src
    if (event.target === this.el && image && image.height > 0 && image.width > 0) {
      this.resizeMesh(image.width, image.height)
    }
  }
})