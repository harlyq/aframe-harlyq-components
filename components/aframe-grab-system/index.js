import { aframeHelper, domHelper, extent, overlap, threeHelper } from "harlyq-helpers"

const IDLE = Symbol("idle")
const HOVER = Symbol("hover")
const GRAB = Symbol("grab")

// state of each hand is either (events are shown in braces)
// IDLE -(hoverstart)-> HOVER -(hoverend)-> IDLE
// IDLE -(hoverstart)-> HOVER -(hoverend, grabstart)-> GRAB -(grabend)-> IDLE

AFRAME.registerSystem("grab-system", {
  schema: {
    hands: { type: "selectorAll", default: "[hand-controls], [oculus-touch-controls], [vive-controls], [windows-motion-controls]" },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
    debug: { default: false },
  },

  init() {
    this.grabEvents = new Set()
    this.onGrabEvent = this.onGrabEvent.bind(this)
    this.targets = []
    this.hands = []
  },

  remove() {
    this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) )
  },

  update(oldData) {
    const data = this.data

    if (oldData.hands !== data.hands) {
      this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) )
      this.hands = data.hands ? data.hands.map(el => ( { el, target: undefined, name: IDLE } ) ) : []
      this.grabEvents.forEach( type => this.addHandListeners(type, this.onGrabEvent) )
      if (data.debug) {
        aframeHelper.log(this, `found ${this.hands.length} hands`)
      }
    }
  },

  tick() {
    for (let hand of this.hands) {
      if (hand.name !== GRAB) {
        this.checkHover(hand)
      }
    }
  },

  checkHover(hand) {
    const target = this.findOverlapping(hand.el, this.targets)
    this.transition(hand, { name: (target ? HOVER : IDLE), target })
  },

  registerTarget(el, customObj3D, customGrabStart, customGrabEnd) {
    const index = this.targets.findIndex(target => target.el === el)
    if (index === -1) {
      const data = this.data
      const grabStart = customGrabStart || data.grabStart
      const grabEnd = customGrabEnd || data.grabEnd
      const obj3D = customObj3D || el.object3D
      this.targets.push({ el, obj3D, grabStart, grabEnd })

      this.grabEvents.add(grabStart)
      this.grabEvents.add(grabEnd)
      this.addHandListeners(grabStart, this.onGrabEvent)
      this.addHandListeners(grabEnd, this.onGrabEvent)

      if (data.debug) {
        aframeHelper.log(this, `registered: ${domHelper.getDebugName(el)}, grabStart: ${grabStart}, grabEnd: ${grabEnd}`)
      }
    }
  },

  unregisterTarget(el, customObj3D) {
    const obj3D = customObj3D || el.object3D
    const index = this.targets.findIndex(target => target.el === el && target.obj3D === obj3D)
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
      const target3D = target.obj3D  
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

      if (!isOverlapping) {
        continue
      }

      const score = extent.volume( target3D.boundingBox )
      if (score < minScore) {
        minScore = score
        overlapping = target
      }
    }

    return overlapping
  },

  transition(state, action) {
    const oldState = state.name

    switch (oldState) {
      case IDLE:
        if (action.name === HOVER) {
          this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D })
          state.name = HOVER
          state.target = action.target
        }
        break

      case HOVER:
        if (action.name === IDLE) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D })
          state.name = IDLE
          state.target = undefined
        } else if (action.name === GRAB) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D })
          this.sendEvent(state.target.el, "grabstart", { hand: state.el, obj3D: state.target.obj3D })
          state.name = GRAB
        } else if (action.name === HOVER && action.target !== state.target) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D })
          this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D })
          state.target = action.target
        }
        break

      case GRAB:
        if (action.name === IDLE) {
          this.sendEvent(state.target.el, "grabend", { hand: state.el, obj3D: state.target.obj3D })
          state.name = IDLE
          state.target = undefined
        }
        break
    }

    return state
  },

  // grabStart and grabEnd may be bound to the same event e.g. gripdown on vive
  // so we need to deduce the state of the grab
  onGrabEvent(event) {
    const hand = this.hands.find(hand => hand.el === event.target)
    if (hand) {
      if (hand.name === GRAB && hand.target && hand.target.grabEnd === event.type && hand.target.el) {
        this.transition(hand, {name: IDLE})
      } else if (hand.name === HOVER && hand.target && hand.target.el && hand.target.grabStart === event.type) {
        this.transition(hand, {name: GRAB})
      }
    }
  },
})
