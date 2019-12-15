import { randomBytes } from "crypto";

AFRAME.registerComponent("tracer", {
  schema: {
    color: { default: "" },
    duration: { default: 10 },
    interval: { default: 0.1 },
    speedScale: { default: 0.1 },
  },

  // potentially we want to user multiple shaders
  multiple: true,

  init() {
    this.color = new THREE.Color()
    this.geometry = undefined
    this.prevWorldPosition = new THREE.Vector3()
  },

  update(oldData) {
    const data = this.data
    if (oldData.color !== data.color) {
      this.color.set( data.color )
    }

    if (oldData.duration !== data.duration || oldData.interval !== data.interval) {
      this.count = 2*(data.duration / data.interval)
      this.createMesh( new THREE.Color(data.color) )
    }
  },

  tick(timeMS, deltaTimeMS) {
    const dt = deltaTimeMS/1000
    this.drawTrace(dt)
  },

  createMesh() {
    this.geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(this.count*3)
    const colors = new Float32Array(this.count*3)
    const worldPosition = new THREE.Vector3()

    this.el.object3D.getWorldPosition(worldPosition)
    this.prevWorldPosition.copy(worldPosition)

    for (let i = 0; i < this.count; i += 3) {
      positions[i] = worldPosition.x
      positions[i+1] = worldPosition.y
      positions[i+2] = worldPosition.z

      colors[i] = this.color.r
      colors[i+1] = this.color.g
      colors[i+2] = this.color.b
    }

    this.geometry.setAttribute( "position", new THREE.BufferAttribute(positions, 3) )
    this.geometry.setAttribute( "color", new THREE.BufferAttribute(colors, 3) )

    const mesh = new THREE.Mesh(this.geometry)
    mesh.drawMode = THREE.TriangleStripDrawMode

    // mesh is world relative
    this.el.sceneEl.setObject3D("tracer" + Math.random(), mesh)
  },

  drawTrace(dt) {
    const position = this.geometry.getAttribute("position")
    const color = this.geometry.getAttribute("color")

    // shift the attributes 2 vertices
    for (let j = (this.count - 1)*3; j >= 6; j--) {
      position[j] = position[j-6]
      color[j] = color[j-6]
    }

    const topPosition = new THREE.Vector3()
    const worldPosition = new THREE.Vector3()
    const speedPosition = new THREE.Vector3()

    this.el.object3D.updateMatrixWorld()
    this.el.object3D.getWorldPosition(worldPosition)
    
    const speed = speedPosition.subVectors(worldPosition, this.prevWorldPosition).length()
    topPosition.setFromMatrixColumn(this.el.object3D.matrixWorld, 2)
    topPosition.multiplyScalar(speed).add(worldPosition)

    position.setXYZ(0, worldPosition.x, worldPosition.y, worldPosition.z)
    position.setXYZ(1, topPosition.x, topPosition.y, topPosition.z)
    color.setXYZ(0, this.color.r, this.color.g, this.color.b)
    color.setXYZ(1, this.color.r, this.color.g, this.color.b)

    this.prevWorldPosition.copy(worldPosition)
  },
})