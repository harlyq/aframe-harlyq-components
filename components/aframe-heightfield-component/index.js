const VERTS_PER_POINT = 6

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
    numRows: { type: "int", default: 32 },
    numCols: { type: "int", default: 32 },
    heightScale: { default: .2 },
    channels: { default: "rgb", oneOf: Object.keys(CHANNEL_MULTIPLIERS) },
  },

  init() {
    this.onLoaded = this.onLoaded.bind(this)
    this.loadTextureCallback = this.loadTextureCallback.bind(this)
    this.geometry = undefined
    this.image = undefined
  },

  update(oldData) {
    const data = this.data

    if (oldData.src !== data.src) {
      this.loadTexture(data.src)
    } else if (oldData.numRows !== data.numRows || oldData.numCols !== data.numCols) {
      this.createHeightfield(this.image)
    } else if (oldData.heightScale !== data.heightScale || oldData.channels !== data.channels) {
      this.updateHeightfield(this.image)
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

    const numRows = this.data.numRows
    const numCols = this.data.numCols

    // const geometry = new THREE.PlaneBufferGeometry(1, 1, numCols - 1, numRows - 1)
    const numPoints = numCols*numRows*VERTS_PER_POINT
    const geometry = new THREE.BufferGeometry()
    const vertices = new Float32Array(numPoints*3)
    const normals = new Float32Array(numPoints*3)
    const uvs = new Float32Array(numPoints*2)

    // (x,y)a--b  triangles are *bad* and *cda*
    //      |\ |  vertices are *badcda*
    //      | \|  indices are 0-2=b, 3-5=a, 6-8=d, 9-11=c, 12-14=d, 15-17=a
    //      c--d  ax=3,15 az=5,17 bx=0 bz=2 cx=9 cz=11 dx=6,12 dz=8,14

    // we go to (num... - 1) because the second to last row/column will generate vertices for the last row/column
    for (let z = 0; z < numRows - 1; z++) {
      for (let x = 0; x < numCols - 1; x++) {
        const i = (z*numCols + x)*VERTS_PER_POINT*3
        const minU = x/numCols, maxU = (x+1)/numCols
        const minV = z/numRows, maxV = (z+1)/numRows

        vertices[i+3] = vertices[i+9] = vertices[i+15] = minU - .5 // ax,cx
        vertices[i+2] = vertices[i+5] = vertices[i+17] = minV - .5 // az,bz
        vertices[i+0] = vertices[i+6] = vertices[i+12] = maxU - .5 // bx,dx
        vertices[i+8] = vertices[i+11] = vertices[i+14] = maxV - .5 // cz,dz

        uvs[i+2] = uvs[i+6] = uvs[i+10] = minU
        uvs[i+1] = uvs[i+3] = uvs[i+11] = minV
        uvs[i+0] = uvs[i+4] = uvs[i+8] = maxU
        uvs[i+5] = uvs[i+7] = uvs[i+9] = maxV

        // if ((x + z) % 3 === 0) {
        //   // switch to *baccdb*
        //   vertices[i+6] = minU - .5
        //   vertices[i+15] = maxU - .5
        // }
      }
    }

    geometry.addAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.addAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.addAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

    const oldMesh = this.el.getObject3D("mesh")
    this.mesh = new THREE.Mesh(geometry, oldMesh ? oldMesh.material : new THREE.MeshBasicMaterial())
    this.el.setObject3D("mesh", this.mesh)

    this.updateHeightField(this.image)
  },

  updateHeightField(image) {
    if (this.el.getObject3D("mesh") !== this.mesh) {
      return // another component replaced the mesh
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

    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvasWidth, canvasHeight).data
    const numRows = this.data.numRows
    const numCols = this.data.numCols

    const positions = this.mesh.geometry.getAttribute("position")
    const multiplier = CHANNEL_MULTIPLIERS[this.data.channels] || CHANNEL_MULTIPLIERS["rgb"]
    const heightScale = this.data.heightScale

    // sample the heights
    const RGBA_PER_POINT = 4
    const dx = (canvasWidth-1)/(numCols-1)
    const dz = (canvasHeight-1)/(numRows-1)
    const heights = new Float32Array(numRows*numCols)
    const midHeights = new Float32Array(numRows*numCols)

    for (let z = 0; z < numRows; z++) {
      for (let x = 0; x < numCols; x++) {
        const j = (Math.floor(x*dx) + Math.floor(z*dz)*canvasWidth)*RGBA_PER_POINT
        heights[x + z*numCols] = (pixels[j]*multiplier[0] + pixels[j+1]*multiplier[1] + pixels[j+2]*multiplier[2] + pixels[j+3]*multiplier[3])*heightScale
      }
    }

    // heights at the midpoints, use to tell which direction to angle the triangle patch
    for (let z = 0; z < numRows; z++) {
      for (let x = 0; x < numCols; x++) {
        const j = (Math.floor((x + .5)*dx) + Math.floor((z + .5)*dz)*canvasWidth)*RGBA_PER_POINT
        midHeights[x + z*numCols] = (pixels[j]*multiplier[0] + pixels[j+1]*multiplier[1] + pixels[j+2]*multiplier[2] + pixels[j+3]*multiplier[3])*heightScale
      }
    }

    for (let z = 0; z < numRows - 1; z++) {
      for (let x = 0; x < numCols - 1; x++) {
        const j = x + z*numCols
        const k = j*VERTS_PER_POINT
        const heightA = heights[j]
        const heightB = heights[j+1]
        const heightC = heights[j+numCols]
        const heightD = heights[j+numCols+1]
        const midHeight = midHeights[j]
        const minU = x/numCols
        const maxU = (x+1)/numCols

        positions.setY(k, heightB)
        positions.setY(k+1, heightA)
        positions.setY(k+3, heightC)
        positions.setY(k+4, heightD)

        // cut the square in the direction which is closest to the midpoint, this lessens the
        // ridged values artefact
        if (Math.abs((heightA + heightD)*.5 - midHeight) > Math.abs((heightC + heightB)*.5 - midHeight)) {
          // switch to *baccdb*
          positions.setX(k+2, minU - .5)
          positions.setY(k+2, heightC)
          positions.setX(k+5, maxU - .5)
          positions.setY(k+5, heightB)
        } else {
          // output as *badcda*
          positions.setX(k+2, maxU - .5)
          positions.setY(k+2, heightD)
          positions.setX(k+5, minU - .5)
          positions.setY(k+5, heightA)
        }
      }
    }

    // for (let i = 0; i < pixels.length; i += 4) {
    //   positions.setZ(i/4, height*heightScale)
    // }

    this.mesh.geometry.computeVertexNormals()

    positions.needsUpdate = true
  },
})