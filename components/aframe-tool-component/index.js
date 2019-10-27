// @ts-ignore
const radToDeg = THREE.Math.radToDeg
// @ts-ignore
const degToRad = THREE.Math.degToRad
const parseToLowerCase = str => (typeof str === "string") ? str.toLowerCase() : str

AFRAME.registerComponent("tool", {
  dependencies: ["position", "rotation", "scale"],

  schema: {
    debug: { default: false },
    handPosition: { type: "vec3" },
    handRotation: { type: "vec3" },
    handScale: { type: "vec3", default: {x:1, y:1, z:1} },
    usage: { default: "stayondrop", oneOf: ["respawnOnDrop", "stayOnDrop"], parse: parseToLowerCase },
  },

  init() {
    this.handA = undefined
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.handMatrix = new THREE.Matrix4()
    this.objectMatrixOnEquip = new THREE.Matrix4()

    const system = this.el.sceneEl.systems["grab-system"]
    system.registerTarget(this.el, 1)
  },

  play() {
    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
  },

  pause() {
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
  },

  update(oldData) {
    const data = this.data

    if (oldData.handRotation !== data.handRotation || oldData.handPosition !== data.handPosition || oldData.handScale !== data.handScale) {
      const euler = new THREE.Euler().set(degToRad(data.handRotation.x), degToRad(data.handRotation.y), degToRad(data.handRotation.z), "YXZ")
      const quaternion = new THREE.Quaternion().setFromEuler(euler)
      this.handMatrix.compose(data.handPosition, quaternion, data.handScale)
    }
  },

  tick: (function() {
    const newMatrix = new THREE.Matrix4()
    const inverseParentMat = new THREE.Matrix4()

    return function tick() {
      if (!this.handA) {
        this.el.sceneEl.removeBehavior(this)
        return
      }
  
      if (this.handA) {
        const object3D = this.el.object3D
        const hand3D = this.handA.object3D

        hand3D.updateMatrixWorld(true)
        object3D.parent.updateMatrixWorld(true)

        // get the inverse each frame in case the parent is moving
        inverseParentMat.getInverse(object3D.parent.matrixWorld)
        newMatrix.copy(this.handMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
        newMatrix.decompose(object3D.position, object3D.quaternion, object3D.scale)
      }
    }
  })(),

  onGrabStart(e) {
    const data = this.data

    this.handA = e.detail.hand
    this.objectMatrixOnEquip.copy(this.el.object3D.matrix)
    this.el.sceneEl.addBehavior(this)
  },

  onGrabEnd(e) {
    const data = this.data
    const object3D = this.el.object3D

    this.handA = undefined
    if (data.usage === "respawnondrop") {  
      this.objectMatrixOnEquip.decompose(object3D.position, object3D.quaternion, object3D.scale)
    }
  },
})

