import { aframeHelper, domHelper, extent, instanced, overlap, threeHelper } from "harlyq-helpers"

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
    this.raycaster = new THREE.Raycaster()
    this.raycaster.cache = new Map()
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

  registerTarget(el, customConfig = {}) {
    const data = this.data
    const config = Object.assign( {el, obj3D: el.object3D, grabStart: data.grabStart, grabEnd: data.grabEnd, instanceIndex: -1 }, customConfig )
    const index = this.targets.findIndex(target => target.el === el && target.obj3D === config.obj3D && target.instanceIndex === config.instanceIndex)
    if (index === -1) {
      this.targets.push( config )

      this.grabEvents.add(config.grabStart)
      this.grabEvents.add(config.grabEnd)
      this.addHandListeners(config.grabStart, this.onGrabEvent)
      this.addHandListeners(config.grabEnd, this.onGrabEvent)

      if (data.debug) {
        aframeHelper.log(this, `registered: ${domHelper.getDebugName(el)}, grabStart: ${config.grabStart}, grabEnd: ${config.grabEnd}, instanceIndex: ${config.instanceIndex}`)
      }
    }
  },

  unregisterTarget(el, customConfig) {
    const obj3D = customConfig.obj3D || el.object3D
    const instanceIndex = typeof customConfig.instanceIndex !== "undefined" ? customConfig.instanceIndex : -1
    const index = this.targets.findIndex(target => target.el === el && target.obj3D === obj3D && target.instanceIndex === instanceIndex)
    if (index !== -1) {
      this.targets.splice(index)

      if (this.data.debug) {
        aframeHelper.log(this, `unregistered ${domHelper.getDebugName(el)}, instanceIndex: ${instanceIndex}`)
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
  findOverlapping: (function () {
    const instancedMatrixWorld = new THREE.Matrix4()
    const rayOffset = new THREE.Vector3()

    return function findOverlapping(handEl, targets) {
      // ignore overlapping when not in vr-mode, this prevents vr interactions in another
      // broswer window that is in VR triggering interactions in a browser window that is not
      // in vr
      if (!this.el.is('vr-mode')) {
        return undefined
      }

      const data = this.data
      const self = this
  
      let minScore = Number.MAX_VALUE
      let overlapping = undefined
  
      // generate the bounding boxes of hands and targets (this is useful for debugging, even if some are missing)
      const hand3D = handEl.object3D
      if (!hand3D.boundingSphere || !hand3D.boundingBox || hand3D.boundingBox.isEmpty()) {
        threeHelper.generateOrientedBoundingBox(hand3D, data.debug ? 0x00FFFF : undefined) // cyan
      }

      this.raycaster.ray.origin.setFromMatrixPosition(hand3D.matrixWorld)
      this.raycaster.ray.direction.setFromMatrixColumn(hand3D.matrixWorld, 2).negate() // forward
      rayOffset.copy(this.raycaster.ray.direction).multiplyScalar(.1)
      this.raycaster.ray.origin.sub(rayOffset)
      this.raycaster.cache.clear()
  
      for (let target of targets) {
        const target3D = target.obj3D  
        if (!target3D) { 
          continue 
        }
  
        if (!target3D.boundingSphere || !target3D.boundingBox || target3D.boundingBox.isEmpty()) {
          threeHelper.generateOrientedBoundingBox(target3D, data.debug ? 0xFFFF00 : undefined) // yellow
        }
      }
  
      if (hand3D.boundingBox.isEmpty()) {
        return undefined
      }
  
      for (let target of targets) {
        const target3D = target.obj3D  
        if (!target3D) { 
          continue 
        }
  
        if (target3D.boundingBox.isEmpty()) { 
          continue 
        }
  
        const targetMatrixWorld = target.instanceIndex >= 0 ? instanced.calcMatrixWorld(target3D, target.instanceIndex, instancedMatrixWorld) : target3D.matrixWorld
  
        // Bounding box collision check
        const isOverlapping = overlap.boxWithBox(hand3D.boundingBox.min, hand3D.boundingBox.max, hand3D.matrixWorld.elements, target3D.boundingBox.min, target3D.boundingBox.max, targetMatrixWorld.elements)
  
        if (isOverlapping) {
          const score = self.getScore(hand3D, target, targetMatrixWorld)
          if (score < minScore) {
            minScore = score
            overlapping = target
          }
        }
  
      }
  
      return overlapping
    }
  })(),


  transition(state, action) {
    const oldState = state.name

    switch (oldState) {
      case IDLE:
        if (action.name === HOVER) {
          this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D, instanceIndex: action.target.instanceIndex })
          state.name = HOVER
          state.target = action.target
        }
        break

      case HOVER:
        if (action.name === IDLE) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex })
          state.name = IDLE
          state.target = undefined
        } else if (action.name === GRAB) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex })
          this.sendEvent(state.target.el, "grabstart", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex })
          state.name = GRAB
        } else if (action.name === HOVER && (action.target !== state.target)) {
          this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex })
          this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D, instanceIndex: action.target.instanceIndex })
          state.target = action.target
        }
        break

      case GRAB:
        if (action.name === IDLE) {
          this.sendEvent(state.target.el, "grabend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex })
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

  // more negative is better
  getScore: (function() {
    const handPos = new THREE.Vector3()
    const targetPos = new THREE.Vector3()
    const handForward = new THREE.Vector3()
    const handToTarget = new THREE.Vector3()
    const pointOnForward = new THREE.Vector3()

    return function getScore(hand3D, target, targetMatrixWorld) {
      switch (target.score) {
        case "closestforward": {
          handPos.setFromMatrixPosition(hand3D.matrixWorld)
          targetPos.setFromMatrixPosition(targetMatrixWorld)
          handForward.setFromMatrixColumn(hand3D.matrixWorld, 2) // controller points in the -z direction
          handToTarget.subVectors(targetPos, handPos)
          handForward.normalize()
  
          // prefer targets that are in front of the controller origin, and closer to the forward axis
          const scalar = handForward.dot(handToTarget)
          pointOnForward.copy(handForward).multiplyScalar(scalar)
          const score = pointOnForward.sub(handToTarget).length()
          return scalar < 0 ? score : score*10 // prefer targets in front (-ve scalar)
        }
          
        case "raycast": {
          let intersections = this.raycaster.cache.get(target.obj3D)
          if (!intersections) {
            intersections = this.raycaster.intersectObject(target.obj3D, true)
            this.raycaster.cache.set(target.obj3D, intersections)
          }
          return intersections.length > 0 && (target.instanceIndex < 0 || target.instanceIndex === intersections[0].instanceId) ? intersections[0].distance : Infinity
        }

        case "volume":
        default:
          return extent.volume(target.obj3D.boundingBox)
      }
    }
  })(),
})
