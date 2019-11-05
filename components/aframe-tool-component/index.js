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
    maxHands: { default: 1 },
    usage: { default: "stayondrop", oneOf: ["respawnOnDrop", "stayOnDrop"], parse: parseToLowerCase },
  },

  init() {
    this.hands = []
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.offsetMatrix = new THREE.Matrix4()
    this.objectMatrixOnEquip = new THREE.Matrix4()
    this.originalScale = new THREE.Vector3()
    this.invRotationMatrix = new THREE.Matrix4()

    const system = this.el.sceneEl.systems["grab-system"]
    system.registerTarget(this.el)
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
      this.offsetMatrix.compose(data.handPosition, quaternion, data.handScale)
      this.invRotationMatrix.makeRotationFromQuaternion(quaternion)
      this.invRotationMatrix.getInverse(this.invRotationMatrix)
    }
  },

  tick: (function() {
    const newMatrix = new THREE.Matrix4()
    const inverseParentMat = new THREE.Matrix4()
    const forwardVector = new THREE.Vector3(0,0,1)
    const secondVector = new THREE.Vector3()
    const secondHandPosition = new THREE.Vector3()
    const firstHandPosition = new THREE.Vector3()
    const twoHandQuaternion = new THREE.Quaternion()
    const twooffsetMatrix = new THREE.Matrix4()

    return function tick() {
      if (this.hands.length === 0) {
        this.el.sceneEl.removeBehavior(this)
        return
      }
  
      const object3D = this.el.object3D
      const hand3D = this.hands[0].object3D

      hand3D.updateMatrixWorld(true)
      object3D.parent.updateMatrixWorld(true)

      // get the inverse each frame in case the parent is moving
      inverseParentMat.getInverse(object3D.parent.matrixWorld)

      if (this.hands.length > 1) {
        const secondHand3D = this.hands[1].object3D
        secondHand3D.updateMatrixWorld(true)
        secondHand3D.getWorldPosition(secondHandPosition)
        hand3D.getWorldPosition(firstHandPosition)
        secondVector.subVectors(firstHandPosition, secondHandPosition).normalize()
        forwardVector.set(0,0,1)
        twoHandQuaternion.setFromUnitVectors(forwardVector, secondVector)
        twooffsetMatrix.makeRotationFromQuaternion(twoHandQuaternion)
        twooffsetMatrix.multiply(this.invRotationMatrix)
        twooffsetMatrix.setPosition(firstHandPosition)
        newMatrix.copy(this.offsetMatrix).premultiply(twooffsetMatrix).premultiply(inverseParentMat)
      } else {
        newMatrix.copy(this.offsetMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
      }

      newMatrix.decompose(object3D.position, object3D.quaternion, object3D.scale)
      object3D.scale.multiply(this.originalScale)
    }
  })(),

  onGrabStart(e) {
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const data = this.data

    this.hands.length = Math.min(data.maxHands - 1, this.hands.length)
    this.hands.push(e.detail.hand)
    this.objectMatrixOnEquip.copy(this.el.object3D.matrix)
    this.el.object3D.matrix.decompose(position, quaternion, this.originalScale)
    this.el.sceneEl.addBehavior(this)
  },

  onGrabEnd(e) {
    const data = this.data
    const object3D = this.el.object3D
    const handIndex = this.hands.indexOf(e.detail.hand)

    if (handIndex !== -1) {
      this.hands.splice(handIndex, 1)

      if (this.hands.length === 0 && data.usage === "respawnondrop") {
        this.objectMatrixOnEquip.decompose(object3D.position, object3D.quaternion, object3D.scale)
      }
    }
  },
})

