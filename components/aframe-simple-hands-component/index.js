// Copyright 2019 harlyq
// MIT license

import { proximity } from "harlyq-helpers"
import { extent } from "harlyq-helpers"
import { threeHelper } from "harlyq-helpers"

const TOO_MANY_ENTITIES_WARNING = 100

/**
 * Based on donmccurdy/aframe-extras/sphere-collider.js
 *
 * Implement bounding sphere collision detection for entities
 */
AFRAME.registerComponent("simple-hands", {
  schema: {
    grabSelector: { default: "" },
    toolSelector: { default: "" },
    offset: { type: "vec3" },
    radius: { default: 0.05 },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
    toolStart: { default: "triggerdown" },
    toolEnd: { default: "gripdown" },
    watch: { default: true },
    bubble: { default: true },
    debug: { default: false },
  },

  init() {
    this.observer = null
    this.state = {}
    this.grabEls = []
    this.toolEls = []
    this.sphereDebug = undefined
    
    this.onSceneChanged = this.onSceneChanged.bind(this)
    this.onGrabStartEvent = this.onGrabStartEvent.bind(this)
    this.onGrabEndEvent = this.onGrabEndEvent.bind(this)
    this.onToolStartEvent = this.onToolStartEvent.bind(this)
    this.onToolEndEvent = this.onToolEndEvent.bind(this)

    this.setState("hover")
  },

  remove() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }

    this.pause()
  },

  play() {
    const sceneEl = this.el.sceneEl
    const data = this.data

    this.el.addEventListener(data.grabStart, this.onGrabStartEvent);
    this.el.addEventListener(data.grabEnd, this.onGrabEndEvent);
    this.el.addEventListener(data.toolStart, this.onToolStartEvent);
    this.el.addEventListener(data.toolEnd, this.onToolEndEvent);
  },

  pause() {
    const data = this.data
    this.el.removeEventListener(data.grabStart, this.onGrabStartEvent);
    this.el.removeEventListener(data.grabEnd, this.onGrabEndEvent);
    this.el.removeEventListener(data.toolStart, this.onToolStartEvent);
    this.el.removeEventListener(data.toolEnd, this.onToolEndEvent);
  },

  /**
   * Update list of entities to test for collision.
   */
  update(oldData) {
    const data = this.data

    if (oldData.grabSelector !== data.grabSelector || oldData.toolSelector !== data.toolSelector) {
      this.gatherElements()
    }

    if (!AFRAME.utils.deepEqual(data.offset, oldData.offset) || data.radius !== oldData.radius) {

      if (data.debug) {
        if (this.sphereDebug) {
          this.el.object3D.remove( this.sphereDebug )
        }
        let sphereGeo = new THREE.SphereBufferGeometry(data.radius, 6, 6)
        sphereGeo.translate(data.offset.x, data.offset.y, data.offset.z)
        let wireGeo = new THREE.WireframeGeometry(sphereGeo)
        this.sphereDebug = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({color: 0xffff00}) )
        this.el.object3D.add(this.sphereDebug)
      }
  
    }

    if (oldData.watch !== data.watch && data.watch) {
      this.observer = new MutationObserver(this.onSceneChanged)
      this.observer.observe(this.el.sceneEl, {childList: true, subtree: true})
    }
  },

  tick() {
    if (this.state.name === "hover") {
      this.updateHover(this.state)
    }
  },

  setState(newState) {
    if (this.state.name !== newState) {
      this.state.name = newState
    }
  },

  findOverlapping: (function () {
    const obj3DPosition = new THREE.Vector3()

    return function findOverlapping(handPosition, handRadius, els, debugColor) {
      let minScore = Number.MAX_VALUE
      let overlappingEl = undefined
    
      for (let el of els) {
        if (!el.isEntity || !el.object3D) { 
          continue 
        }
  
        let obj3D = el.object3D  
        if (!obj3D.boundingSphere || !obj3D.boundingBox || obj3D.boundingBox.isEmpty()) {
          this.generateOrientedBoundingBox(obj3D, debugColor)
        }
  
        if (obj3D.boundingBox.isEmpty()) { 
          continue 
        }
  
        // Bounding sphere collision detection
        obj3DPosition.copy(obj3D.boundingSphere.center).applyMatrix4(obj3D.matrixWorld)
        const radius = obj3D.boundingSphere.radius*Math.max(obj3D.scale.x, obj3D.scale.y, obj3D.scale.z)
        const distance = handPosition.distanceTo(obj3DPosition)

        if (distance > radius + handRadius) {
          continue
        }
  
        // Bounding box collision check
        const distanceToBox = proximity.pointToBox(handPosition, obj3D.boundingBox.min, obj3D.boundingBox.max, obj3D.matrixWorld.elements)
        // console.log("box", el.id, distanceToBox)

        if (distanceToBox > handRadius) {
          continue
        }

        const score = extent.volume( obj3D.boundingBox )
        // console.log("score", el.id, score)
        if (score < minScore) {
          minScore = score
          overlappingEl = el
        }
      }
  
      return overlappingEl
    }

  })(),

  gatherElements() {
    const data = this.data

    const grabEls = data.grabSelector ? this.el.sceneEl.querySelectorAll(data.grabSelector) : undefined
    this.grabEls = grabEls ? grabEls : []

    if (this.grabEls.length > TOO_MANY_ENTITIES_WARNING) {
      console.warn(`many entities in grabSelector (${this.grabEls.length}), performance may be affected`)
    }

    const toolEls = data.toolSelector ? this.el.sceneEl.querySelectorAll(data.toolSelector) : undefined
    this.toolEls = toolEls ? toolEls : []

    if (this.toolEls.length > TOO_MANY_ENTITIES_WARNING) {
      console.warn(`many entities in toolSelector (${this.toolEls.length}), performance may be affected`)
    }

    // if (this.toolEls.length === 0 && this.grabEls.length === 0) {
    //   console.warn(`no tool or grab selected`)
    // }
  },

  generateOrientedBoundingBox(obj3D, debugColor) {
    // cache boundingBox and boundingSphere
    obj3D.boundingBox = obj3D.boundingBox || new THREE.Box3()
    obj3D.boundingSphere = obj3D.boundingSphere || new THREE.Sphere()
    threeHelper.setOBBFromObject3D(obj3D.boundingBox, obj3D)

    if (!obj3D.boundingBox.isEmpty()) {
      obj3D.boundingBox.getBoundingSphere(obj3D.boundingSphere)

      if (debugColor) {
        obj3D.boundingBoxDebug = new THREE.Box3Helper(obj3D.boundingBox, debugColor)
        obj3D.boundingBoxDebug.name = "simpleHandsDebug"
        obj3D.add(obj3D.boundingBoxDebug)
      }
    }
  },

  updateHover: (function() {
    const handOffset = new THREE.Vector3()
    const yellow = new THREE.Color('yellow')
    const blue = new THREE.Color('blue')

    return function updateHover(state) {
      const data = this.data
      const handObject3D = this.el.object3D
      const handRadius = data.radius
      let newHoverEl = undefined
      let newHoverType = undefined
      
      handOffset.copy(data.offset).applyMatrix4(handObject3D.matrixWorld)

      // prefer tools to grab targets
      newHoverEl = this.findOverlapping(handOffset, handRadius, this.toolEls, data.debug ? blue : undefined)
      newHoverType = "tool"
      if (!newHoverEl) {
        newHoverEl = this.findOverlapping(handOffset, handRadius, this.grabEls, data.debug ? yellow : undefined)
        newHoverType = "grab"
      }

      // if (newHoverEl) console.log("closest", newHoverEl.id)

      if (state.target && state.target !== newHoverEl) {
        this.sendEvent(state.target, "hoverend")
      }
      if (newHoverEl && newHoverEl !== state.target) {
        this.sendEvent(newHoverEl, "hoverstart")
      } 
      state.target = newHoverEl
      state.targetType = newHoverEl ? newHoverType : undefined
    }
  })(),

  sendEvent(targetEl, eventName) {
    const bubble = this.data.bubble
    if (this.data.debug) {
      console.log(eventName, targetEl.id)
    }

    targetEl.emit(eventName, { hand: this.el }, bubble)
    this.el.emit(eventName, { hand: this.el, target: targetEl }, bubble)
  },

  onSceneChanged() {
    this.gatherElements()
  },

  onGrabStartEvent(e) {
    if (this.state.name === "hover" && this.state.target && this.state.targetType === "grab") {
      this.sendEvent(this.state.target, "hoverend")
      this.setState("grab")
      this.sendEvent(this.state.target, "grabstart")
    }
  },

  onGrabEndEvent(e) {
    if (this.state.name === "grab" && this.state.target) {
      this.sendEvent(this.state.target, "grabend")
      this.setState("hover")
      this.state.target = undefined
    }
  },

  onToolStartEvent(e) {
    if (this.state.name === "hover" && this.state.target && this.state.targetType === "tool") {
      this.sendEvent(this.state.target, "hoverend")
      this.setState("tool")
      this.sendEvent(this.state.target, "toolequipped")
    }
  },

  onToolEndEvent(e) {
    if (this.state.name === "tool" && this.state.target) {
      this.sendEvent(this.state.target, "tooldropped")
      this.setState("hover")
      this.state.target = undefined
    }
  },
})


