import { proximity, extent, threeHelper } from "harlyq-helpers"

const TOO_MANY_ENTITIES_WARNING = 100

// inspired by donmccurdy/aframe-extras/sphere-collider.js
AFRAME.registerComponent("simple-hands", {
  schema: {
    grabSelectors: { default: "" },
    toolSelectors: { default: "" },
    colliderOffset: { type: "vec3" },
    colliderRadius: { default: 0.05 },
    leftSelector: { default: "" },
    rightSelector: { default: "" },
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
    this.state = {
      left: {
        name: "hover",
        hand: undefined,
        hasListeners: false,
        colliderDebug: undefined,
      }, 
      right: {
        name: "hover",
        hand: undefined,
        hasListeners: false,
        colliderDebug: undefined,
      } 
    }

    this.grabEls = []
    this.toolEls = []
    
    this.onSceneChanged = this.onSceneChanged.bind(this)
    this.onGrabStartEvent = this.onGrabStartEvent.bind(this)
    this.onGrabEndEvent = this.onGrabEndEvent.bind(this)
    this.onToolStartEvent = this.onToolStartEvent.bind(this)
    this.onToolEndEvent = this.onToolEndEvent.bind(this)
    this.onSceneLoaded = this.onSceneLoaded.bind(this)

    this.setMode(this.state.left, "hover")
    this.setMode(this.state.right, "hover")

    this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded)
  },

  remove() {
    this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded)
    this.hideColliderDebug()

    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  },

  play() {
    this.addListeners(this.state.left)
    this.addListeners(this.state.right)
  },

  pause() {
    this.removeListeners(this.state.left)
    this.removeListeners(this.state.right)
  },

  addListeners(side) {
    if (side.hand && !side.hasListeners) {
      const data = this.data
      side.hand.addEventListener(data.grabStart, this.onGrabStartEvent);
      side.hand.addEventListener(data.grabEnd, this.onGrabEndEvent);
      side.hand.addEventListener(data.toolStart, this.onToolStartEvent);
      side.hand.addEventListener(data.toolEnd, this.onToolEndEvent);
      side.hasListeners = true
    }
  },

  removeListeners(side) {
    if (side.hand && side.hasListeners) {
      const data = this.data
      side.hand.removeEventListener(data.grabStart, this.onGrabStartEvent);
      side.hand.removeEventListener(data.grabEnd, this.onGrabEndEvent);
      side.hand.removeEventListener(data.toolStart, this.onToolStartEvent);
      side.hand.removeEventListener(data.toolEnd, this.onToolEndEvent);
      side.hasListeners = false
    }
  },

  /**
   * Update list of entities to test for collision.
   */
  update(oldData) {
    const data = this.data

    if (oldData.grabSelectors !== data.grabSelectors || 
      oldData.toolSelectors !== data.toolSelectors || 
      oldData.leftSelector !== data.leftSelector || 
      oldData.rightSelector !== data.rightSelector) {
      this.gatherElements()
    }

    if (!AFRAME.utils.deepEqual(data.colliderOffset, oldData.colliderOffset) || data.colliderRadius !== oldData.colliderRadius) {
      this.hideColliderDebug(this.state.left)
      this.hideColliderDebug(this.state.right)
      this.showColliderDebug(this.state.left)
      this.showColliderDebug(this.state.right)
    }
  },

  tick() {
    if (this.state.left.name === "hover" && this.state.left.hand) {
      this.updateHover(this.state.left)
    }
    if (this.state.right.name === "hover" && this.state.right.hand) {
      this.updateHover(this.state.right)
    }
  },

  setMode(side, newState) {
    if (side.name !== newState) {
      side.name = newState
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
    const sceneEl = this.el.sceneEl

    const grabEls = data.grabSelectors ? sceneEl.querySelectorAll(data.grabSelectors) : undefined
    this.grabEls = grabEls ? grabEls : []

    if (this.grabEls.length > TOO_MANY_ENTITIES_WARNING) {
      console.warn(`many entities in grabSelectors (${this.grabEls.length}), performance may be affected`)
    }

    const toolEls = data.toolSelectors ? sceneEl.querySelectorAll(data.toolSelectors) : undefined
    this.toolEls = toolEls ? toolEls : []

    if (this.toolEls.length > TOO_MANY_ENTITIES_WARNING) {
      console.warn(`many entities in toolSelectors (${this.toolEls.length}), performance may be affected`)
    }

    const leftHand = data.leftSelector ? sceneEl.querySelector(data.leftSelector) : undefined
    const rightHand = data.rightSelector ? sceneEl.querySelector(data.rightSelector) : undefined

    if (leftHand !== this.state.left.hand) {
      this.removeListeners(this.state.left)
      this.hideColliderDebug(this.state.right)
      this.state.left.hand = leftHand
      this.addListeners(this.state.left)
      this.showColliderDebug(this.state.left)
  }

    if (rightHand !== this.state.right.hand) {
      this.removeListeners(this.state.right)
      this.hideColliderDebug(this.state.right)
      this.state.right.hand = rightHand
      this.addListeners(this.state.right)
      this.showColliderDebug(this.state.right)
    }
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

    return function updateHover(side) {
      const data = this.data
      const handObject3D = side.hand.object3D
      const handRadius = data.colliderRadius
      let newHoverEl = undefined
      let newHoverType = undefined
      
      handOffset.copy(data.colliderOffset).applyMatrix4(handObject3D.matrixWorld)

      // prefer tools to grab targets
      newHoverEl = this.findOverlapping(handOffset, handRadius, this.toolEls, data.debug ? blue : undefined)
      newHoverType = "tool"
      if (!newHoverEl) {
        newHoverEl = this.findOverlapping(handOffset, handRadius, this.grabEls, data.debug ? yellow : undefined)
        newHoverType = "grab"
      }

      // if (newHoverEl) console.log("closest", newHoverEl.id)

      if (side.target && side.target !== newHoverEl) {
        this.sendEvent(side.hand, side.target, "hoverend")
      }
      if (newHoverEl && newHoverEl !== side.target) {
        this.sendEvent(side.hand, newHoverEl, "hoverstart")
      } 
      side.target = newHoverEl
      side.targetType = newHoverEl ? newHoverType : undefined
    }
  })(),

  hideColliderDebug(side) {
    if (side.colliderDebug) {
      side.hand.object3D.remove( side.colliderDebug )
    }
  },

  showColliderDebug(side) {
    const data = this.data
    if (side.hand && data.debug) {
      const sphereGeo = new THREE.SphereBufferGeometry(data.colliderRadius, 6, 6)
      sphereGeo.translate(data.colliderOffset.x, data.colliderOffset.y, data.colliderOffset.z)
      const wireGeo = new THREE.WireframeGeometry(sphereGeo)
      side.colliderDebug = new THREE.LineSegments( wireGeo, new THREE.LineBasicMaterial({color: 0xffff00}) )
      side.hand.object3D.add(side.colliderDebug)
    }
  },

  determineSide(el) {
    return (this.state.left.hand === el) ? this.state.left : (this.state.right.hand === el) ? this.state.right : undefined
  },

  sendEvent(handEl, targetEl, eventName) {
    const bubble = this.data.bubble
    if (this.data.debug) {
      console.log(eventName, targetEl.id)
    }

    targetEl.emit(eventName, { hand: handEl }, bubble)
    handEl.emit(eventName, { hand: handEl, target: targetEl }, bubble)
  },

  onSceneLoaded() {
    // only observe once the scene is loaded, this is better than doing it in the update()
    // where we would be spammed by the observer while the scene loads
    this.gatherElements()

    if (this.data.watch) {
      this.observer = new MutationObserver(this.onSceneChanged)
      this.observer.observe(this.el.sceneEl, {childList: true, subtree: true})
    }

    const data = this.data
    if (!this.state.left.hand && !this.state.right.hand) { 
      console.warn(`unable to find left (${data.leftSelector}) or right (${data.rightSelector}) hands`) 
    }
    if (this.grabEls.length === 0 && this.toolEls.length === 0) {
      console.warn(`no grab (${data.grabSelectors}) or tool (${data.toolSelectors}) elements`)
    }
  },

  onSceneChanged() {
    this.gatherElements()
  },

  onGrabStartEvent(e) {
    const side = this.determineSide(e.target)
    if (side && side.name === "hover" && side.target && side.targetType === "grab") {
      this.sendEvent(side.hand, side.target, "hoverend")
      this.setMode(side, "grab")
      this.sendEvent(side.hand, side.target, "grabstart")
    }
  },

  onGrabEndEvent(e) {
    const side = this.determineSide(e.target)
    if (side.name === "grab" && side.target) {
      this.sendEvent(side.hand, side.target, "grabend")
      this.setMode(side, "hover")
      side.target = undefined
    }
  },

  onToolStartEvent(e) {
    const side = this.determineSide(e.target)
    if (side.name === "hover" && side.target && side.targetType === "tool") {
      this.sendEvent(side.hand, side.target, "hoverend")
      this.setMode(side, "tool")
      this.sendEvent(side.hand, side.target, "toolequipped")
    }
  },

  onToolEndEvent(e) {
    const side = this.determineSide(e.target)
    if (side.name === "tool" && side.target) {
      this.sendEvent(side.hand, side.target, "tooldropped")
      this.setMode(side, "hover")
      side.target = undefined
    }
  },
})


