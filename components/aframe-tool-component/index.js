AFRAME.registerComponent("tool", {
  schema: {
    debug: { default: false },
    handPosition: { type: "vec3" },
    handRotation: { type: "vec3" },
  },

  init() {
    this.handA = undefined
    this.onToolEquip = this.onToolEquip.bind(this)
    this.onToolDrop = this.onToolDrop.bind(this)
  },

  play() {
    this.el.addEventListener("toolequip", this.onToolEquip)
    this.el.addEventListener("tooldrop", this.onToolDrop)
  },

  pause() {
    this.el.removeEventListener("toolequip", this.onToolEquip)
    this.el.removeEventListener("tooldrop", this.onToolDrop)
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

  onToolEquip(e) {
    const data = this.data
    this.handA = e.detail.hand
    // this.el.sceneEl.addBehavior(this)

    this.el.setAttribute("position", data.handPosition)
    this.el.setAttribute("rotation", data.handRotation)
    this.el.flushToDOM()

    this.handA.appendChild(this.el)
  },

  onToolDrop(e) {
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