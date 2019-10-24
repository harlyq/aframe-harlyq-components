import { aframeHelper } from "harlyq-helpers"

AFRAME.registerComponent("toy", {
  schema: {
    debug: { default: true }
  },

  init() {
    const system = this.el.sceneEl.systems["grab-system"]
    system.registerTarget(this.el, 1)
    this.invGrabMatrix = new THREE.Matrix4()
    this.grabHand = undefined
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)

    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
  },

  remove() {
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
  },

  tick() {
    if (!this.grabHand) {
      this.el.sceneEl.removeBehavior(this)
      return
    }

    this.stickToHand()
  },

  onGrabStart(event) {
    if (this.data.debug) {
      aframeHelper.log(this, `${event.type}`)
    }

    this.grabHand = event.detail.hand
    const hand3D = this.grabHand.object3D
    const self3D = this.el.object3D

    this.invGrabMatrix.getInverse(hand3D.matrixWorld).multiply(self3D.matrixWorld)

    this.el.sceneEl.addBehavior(this)
  },

  onGrabEnd(event) {
    if (this.data.debug) {
      aframeHelper.log(this, `${event.type}`)
    }

    if (this.grabHand === event.detail.hand) {
      this.grabHand = undefined
    }
  },

  stickToHand: (function() {
    const invParentMatrix = new THREE.Matrix4()
    const newMatrix = new THREE.Matrix4()

    return function stickToHand() {
      const hand3D = this.grabHand.object3D
      const self3D = this.el.object3D

      invParentMatrix.getInverse(self3D.parent.matrixWorld)
      newMatrix.multiplyMatrices(hand3D.matrixWorld, this.invGrabMatrix) // determine new hover3D world matrix
      newMatrix.premultiply(invParentMatrix) // convert to a local matrix
      newMatrix.decompose(self3D.position, self3D.quaternion, self3D.scale)
    }  
  })()
})
