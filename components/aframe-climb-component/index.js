import { domHelper } from "harlyq-helpers"

AFRAME.registerComponent("climb", {
  schema: {
    cameraRig: { type: "selector" },
    enabled: { default: true },
    debug: { default: false },
  },

  init() {
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)

    this.grab = { hand: undefined, target: undefined, position: new THREE.Vector3() }
  },

  tick: (function() {
    let deltaPosition = new THREE.Vector3()

    return function tick() {
      const data = this.data
      if (data.enabled && this.grab.hand && this.grab.target) {
        const rig = data.cameraRig ? data.cameraRig.object3D : this.el.object3D
    
        if (rig) {
          this.grab.hand.object3D.getWorldPosition(deltaPosition).sub(this.grab.position)
          rig.position.sub(deltaPosition)
        }
      }
    }
  })(),

  play() {
    this.addListeners()
  },

  pause() {
    this.removeListeners()
  },

  addListeners() {
    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
  },

  removeListeners() {
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
  },

  onGrabStart(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, 'onGrabStart', domHelper.getDebugName( e.detail.hand ), domHelper.getDebugName( e.detail.object ) )
    }
    this.grab.hand = e.detail.hand
    this.grab.target = e.detail.object
    this.grab.hand.object3D.getWorldPosition(this.grab.position)
  },

  onGrabEnd(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, 'onGrabEnd', domHelper.getDebugName( e.detail.hand ) )
    }
    if (e.detail.hand === this.grab.hand) {
      this.grab.hand = undefined
    }
  },
})
