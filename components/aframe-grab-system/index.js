import { aframeHelper, domHelper, extent, overlap, threeHelper } from "harlyq-helpers"

AFRAME.registerSystem("grab-system", {
  schema: {
    hands: { type: "selectorAll" },
    // routeEvents: { default: "buttondown, buttonup, touchstart, touchend, buttonchanged, axismoved, controllerconnected, controllerdisconnected, gripdown, gripup, gripchanged, trackpaddown, trackpadup, trackpadchanged, triggerdown, triggerup, triggerchanged" },
    routeEvents: { default: "controllerconnected, controllerdisconnected, gripdown, gripup, gripchanged, trackpaddown, trackpadup, trackpadchanged, triggerdown, triggerup, triggerchanged" },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
    debug: { default: false },
  },

  init() {
    this.grabEvents = new Set()
    this.onGrabEvent = this.onGrabEvent.bind(this)
    this.onRouteEvent = this.onRouteEvent.bind(this)
    this.targets = []
    this.routeEvents = []
    this.hands = []
  },

  remove() {
    this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) )
    this.routeEvents.forEach( type => this.removeHandListeners(type, this.onRouteEvent) )
  },

  update(oldData) {
    const data = this.data

    if (oldData.routeEvents !== data.routeEvents) {
      this.routeEvents.forEach( type => this.removeHandListeners(type, this.onRouteEvent) )
      this.routeEvents = data.routeEvents.split(",").map(x => x.trim())
      this.routeEvents.forEach( type => this.addHandListeners(type, this.onRouteEvent) )
    }

    if (oldData.hands !== data.hands) {
      this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) )
      this.routeEvents.forEach( type => this.removeHandListeners(type, this.onRouteEvent) )
      this.hands = data.hands.map(el => ( { el, target: undefined, isGrabbing: false, isNear: false } ) )
      this.grabEvents.forEach( type => this.addHandListeners(type, this.onGrabEvent) )
      this.routeEvents.forEach( type => this.addHandListeners(type, this.onRouteEvent) )
      if (data.debug) {
        aframeHelper.log(this, `found ${this.hands.length} hands`)
      }
    }
  },

  tick() {
    for (let hand of this.hands) {
      if (!hand.isGrabbing) {
        this.checkNear(hand)
      }
    }
  },

  checkNear(hand) {
    const prevTarget = hand.target
    hand.target = this.findOverlapping(hand.el, this.targets)
    hand.isNear = !!hand.target

    // if we've lost or changed targets send grabfar on the old target first
    if (prevTarget && prevTarget !== hand.target) {
      this.sendEvent(prevTarget.el, "grabfar", { hand: hand.el })
    }

    // if we've acquired or changed targets send grabnear on the new target second
    if (hand.target && prevTarget !== hand.target) {
      this.sendEvent(hand.target.el, "grabnear", { hand: hand.el })
    }
  },

  registerTarget(el, maxHands, customGrabStart, customGrabEnd) {
    const index = this.targets.findIndex(target => target.el === el)
    if (index === -1) {
      const data = this.data
      const grabStart = customGrabStart || data.grabStart
      const grabEnd = customGrabEnd || data.grabEnd
      this.targets.push({ el, maxHands, grabStart, grabEnd })

      this.grabEvents.add(grabStart)
      this.grabEvents.add(grabEnd)
      this.addHandListeners(grabStart, this.onGrabEvent)
      this.addHandListeners(grabEnd, this.onGrabEvent)

      if (data.debug) {
        aframeHelper.log(this, `registered: ${domHelper.getDebugName(el)}, maxHands: ${maxHands}, grabStart: ${grabStart}, grabEnd: ${grabEnd}`)
      }
    }
  },

  unregisterTarget(el) {
    const index = this.targets.findIndex(target => target.el === el)
    if (index !== -1) {
      this.targets.splice(index)

      if (this.data.debug) {
        aframeHelper.log(this, `unregistered ${domHelper.getDebugName(el)}`)
      }
    }
  },

  addHandListeners(type, callback) {
    for (let hand of this.hands) {
      // addEventListener does nothing if the event is already registered
      hand.el.addEventListener(type, callback)

      if (this.data.debug) {
        aframeHelper.log(this, `add listener '${type}' to ${domHelper.getDebugName(hand.el)}`)
      }
    }
  },

  removeHandListeners(type, callback) {
    for (let hand of this.hands) {
      // removeEventListener does nothing if the event is not registered
      hand.el.removeEventListener(type, callback)

      if (this.data.debug) {
        aframeHelper.log(this, `remove listener '${type}' from ${domHelper.getDebugName(hand.el)}`)
      }
    }
  },

  sendEvent(el, type, detail) {
    if (this.data.debug) {
      aframeHelper.log(this, `send '${type}' to '${domHelper.getDebugName(el)}'`)
    }
    el.emit(type, detail)
  },

  // find the smallest overlapping volume
  findOverlapping(handEl, targets) {
    const data = this.data
    let minScore = Number.MAX_VALUE
    let overlapping = undefined

    const hand3D = handEl.object3D
    if (!hand3D.boundingSphere || !hand3D.boundingBox || hand3D.boundingBox.isEmpty()) {
      threeHelper.generateOrientedBoundingBox(hand3D, data.debug ? 0x00FFFF : undefined) // cyan
    }

    if (hand3D.boundingBox.isEmpty()) {
      return
    }

    for (let target of targets) {
      const el = target.el
      const target3D = el.object3D  
      if (!target3D) { 
        continue 
      }

      if (!target3D.boundingSphere || !target3D.boundingBox || target3D.boundingBox.isEmpty()) {
        threeHelper.generateOrientedBoundingBox(target3D, data.debug ? 0xFFFF00 : undefined) // yellow
      }

      if (target3D.boundingBox.isEmpty()) { 
        continue 
      }

      // Bounding box collision check
      const isOverlapping = overlap.boxWithBox(hand3D.boundingBox.min, hand3D.boundingBox.max, hand3D.matrixWorld.elements, target3D.boundingBox.min, target3D.boundingBox.max, target3D.matrixWorld.elements)
      // console.log("box", el.id, distanceToBox)

      if (!isOverlapping) {
        continue
      }

      const score = extent.volume( target3D.boundingBox )
      // console.log("score", el.id, score)
      if (score < minScore) {
        minScore = score
        overlapping = target
      }
    }

    return overlapping
  },

  // grabStart and grabEnd may be bound to the same event e.g. gripdown on vive
  // so we need to deduce the state of the grab
  onGrabEvent(event) {
    const hand = this.hands.find(hand => hand.el === event.target)
    if (hand) {
      if (hand.isGrabbing && hand.target && hand.target.grabEnd === event.type && hand.target.el) {
        hand.isGrabbing = false
        this.sendEvent(hand.target.el, "grabend", {hand: hand.el})
      } else if (!hand.isGrabbing && hand.isNear && hand.target && hand.target.el && hand.target.grabStart === event.type) {
        hand.isGrabbing = true
        this.sendEvent(hand.target.el, "grabstart", {hand: hand.el})
      }
    }
  },

  onRouteEvent(event) {
    const hand = this.hands.find(hand => hand.el === event.target)
    if (hand && hand.isGrabbing) {
      this.sendEvent(hand.target.el, event.type, { ...event.detail, hand: hand.el })
    }
  }
})
