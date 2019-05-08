AFRAME.registerComponent("tool", {
  schema: {
    debug: { default: false },
    handPosition: { type: "vec3" },
    handRotation: { type: "vec3" },
  },

  init() {
    this.handA = undefined
    this.onToolEquipped = this.onToolEquipped.bind(this)
    this.onToolDropped = this.onToolDropped.bind(this)
  },

  play() {
    this.el.addEventListener("toolequipped", this.onToolEquipped)
    this.el.addEventListener("tooldropped", this.onToolDropped)
  },

  pause() {
    this.el.removeEventListener("toolequipped", this.onToolEquipped)
    this.el.removeEventListener("tooldropped", this.onToolDropped)
  },

  tick() {
    // if (!this.handA) {
    //   this.el.sceneEl.removeBehavior(this)
    //   return
    // }

    // const object3D = this.el.object3D
    // const handA3D = this.handA.object3D
    // object3D.position.copy(handA3D.position)
    // object3D.quaternion.copy(handA3D.quaternion)

    // console.log( AFRAME.utils.coordinates.stringify(this.el.getAttribute("position")) )
  },

  onToolEquipped(e) {
    const data = this.data
    this.handA = e.detail.hand
    // this.el.sceneEl.addBehavior(this)

    this.el.setAttribute("position", data.handPosition)
    this.el.setAttribute("rotation", data.handRotation)
    this.el.flushToDOM()

    this.handA.appendChild(this.el)
  },

  onToolDropped(e) {
    this.handA = undefined
    const worldPosition = new THREE.Vector3()
    const worldQuaternion = new THREE.Quaternion()
    const worldEuler = new THREE.Euler(0, 0, 0, "YXZ")
    const object3D = this.el.object3D
    const radToDeg = THREE.Math.radToDeg

    object3D.getWorldPosition(worldPosition)
    object3D.getWorldQuaternion(worldQuaternion)
    worldEuler.setFromQuaternion(worldQuaternion, "YXZ")

    // set components directly because they are re-applied when we reparent
    this.el.setAttribute("position", worldPosition)
    this.el.setAttribute("rotation", `${radToDeg(worldEuler.x)} ${radToDeg(worldEuler.y)} ${radToDeg(worldEuler.z)}`)
    this.el.flushToDOM()

    this.el.sceneEl.appendChild(this.el)
  },
})