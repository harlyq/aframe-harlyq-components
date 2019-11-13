import { aframeHelper, domHelper } from "harlyq-helpers"

AFRAME.registerComponent("toy", {
  schema: {
    routeEvents: { default: "controllerconnected, controllerdisconnected, gripdown, gripup, gripchanged, trackpaddown, trackpadup, triggerdown, triggerup" },
    debug: { default: false }
  },

  init() {
    this.invGrabMatrix = new THREE.Matrix4()
    this.grabHand = undefined
    this.routeEvents = []
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.onRouteEvent = this.onRouteEvent.bind(this)

    const system = this.el.sceneEl.systems["grab-system"]
    system.registerTarget(this.el)
  },

  play() {
    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
    this.addRouteListeners()
  },

  pause() {
    this.removeRouteListeners()
    this.el.removeEventListener("grabend", this.onGrabEnd)
    this.el.removeEventListener("grabstart", this.onGrabStart)
  },

  update(oldData) {
    const data = this.data

    if (oldData.routeEvents !== data.routeEvents) {
      this.routeEvents = data.routeEvents.split(",").map(x => x.trim())
    }
  },

  tick() {
    if (!this.grabHand) {
      this.el.sceneEl.removeBehavior(this)
      return
    }

    this.stickToHand()
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
  })(),

  sendEvent(el, type, detail) {
    if (this.data.debug) {
      aframeHelper.log(this, `send '${type}' to '${domHelper.getDebugName(el)}'`)
    }
    el.emit(type, detail)
  },

  addRouteListeners() {
    if (this.grabHand) {
      for (let type of this.routeEvents) {
        this.grabHand.addEventListener(type, this.onRouteEvent)
      }  
    }
  },

  removeRouteListeners() {
    if (this.grabHand) {
      for (let type of this.routeEvents) {
        this.grabHand.removeEventListener(type, this.onRouteEvent)
      }  
    }
  },

  onGrabStart(event) {
    if (this.data.debug) {
      aframeHelper.log(this, `${event.type}`)
    }

    this.removeRouteListeners()

    this.grabHand = event.detail.hand
    const hand3D = this.grabHand.object3D
    const self3D = this.el.object3D

    this.invGrabMatrix.getInverse(hand3D.matrixWorld).multiply(self3D.matrixWorld)

    this.addRouteListeners()

    this.el.sceneEl.addBehavior(this)
  },

  onGrabEnd(event) {
    if (this.data.debug) {
      aframeHelper.log(this, `${event.type}`)
    }

    if (this.grabHand === event.detail.hand) {
      this.removeRouteListeners()
  
      this.grabHand = undefined
    }
  },

  onRouteEvent(event) {
    this.sendEvent(this.el, event.type, { ...event.detail, hand: this.grabHand })
  },
})
