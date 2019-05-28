import { proximity, extent, threeHelper, domHelper } from "harlyq-helpers"

const TOO_MANY_ENTITIES_WARNING = 100

// inspired by donmccurdy/aframe-extras/sphere-collider.js
AFRAME.registerComponent("simple-hands", {
  schema: {
    grabSelectors: { default: "" },
    toolSelectors: { default: "" },
    colliderOffset: { type: "vec3" },
    colliderRadius: { default: 0.05 },
    handSelectors: { default: "" },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
    toolEquip: { default: "triggerdown" },
    toolDrop: { default: "gripdown" },
    watch: { default: true },
    bubbles: { default: false },
    debug: { default: false },
  },

  init() {
    this.observer = null
    this.sides = []

    this.grabEls = []
    this.toolEls = []
    
    this.onSceneChanged = this.onSceneChanged.bind(this)
    this.onGrabStartEvent = this.onGrabStartEvent.bind(this)
    this.onGrabEndEvent = this.onGrabEndEvent.bind(this)
    this.onToolEquipEvent = this.onToolEquipEvent.bind(this)
    this.onToolDropEvent = this.onToolDropEvent.bind(this)
    this.onSceneLoaded = this.onSceneLoaded.bind(this)

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
    for (let side of this.sides) {
      this.addListeners(side)
    }
  },

  pause() {
    for (let side of this.sides) {
      this.removeListeners(side)
    }
  },

  addListeners(side) {
    if (side.hand && !side.hasListeners) {
      const data = this.data
      side.hand.addEventListener(data.grabStart, this.onGrabStartEvent);
      side.hand.addEventListener(data.grabEnd, this.onGrabEndEvent);
      side.hand.addEventListener(data.toolEquip, this.onToolEquipEvent);
      side.hand.addEventListener(data.toolDrop, this.onToolDropEvent);
      side.hasListeners = true
    }
  },

  removeListeners(side) {
    if (side.hand && side.hasListeners) {
      const data = this.data
      side.hand.removeEventListener(data.grabStart, this.onGrabStartEvent);
      side.hand.removeEventListener(data.grabEnd, this.onGrabEndEvent);
      side.hand.removeEventListener(data.toolEquip, this.onToolEquipEvent);
      side.hand.removeEventListener(data.toolDrop, this.onToolDropEvent);
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
      oldData.handSelectors !== data.handSelectors) {
      this.gatherElements()
    }

    if (!AFRAME.utils.deepEqual(data.colliderOffset, oldData.colliderOffset) || data.colliderRadius !== oldData.colliderRadius) {
      for (let side of this.sides) {
        this.hideColliderDebug( side )
        this.showColliderDebug( side )
      }
    }
  },

  tick() {
    for ( let side of this.sides ) {
      if ( side.mode === "hover" && side.hand ) {
        this.updateHover( side )
      }
    }
  },

  setMode( side, mode ) {
    if ( side.mode !== mode ) {
      side.mode = mode
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
          threeHelper.generateOrientedBoundingBox(obj3D, debugColor)
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

    this.grabEls = data.grabSelectors ? sceneEl.querySelectorAll( data.grabSelectors ) : []

    if ( this.grabEls.length > TOO_MANY_ENTITIES_WARNING ) {
      console.warn( `many entities in grabSelectors (${ this.grabEls.length }), performance may be affected` )
    }

    this.toolEls = data.toolSelectors ? sceneEl.querySelectorAll( data.toolSelectors ) : []

    if ( this.toolEls.length > TOO_MANY_ENTITIES_WARNING ) {
      console.warn( `many entities in toolSelectors (${ this.toolEls.length }), performance may be affected` )
    }

    const handEls = data.handSelectors ? sceneEl.querySelectorAll( data.handSelectors ) : []
    this.setSides( Array.from( handEls ) )
  },

  setSides( handEls ) {
    for ( let i = 0; i < this.sides.length; ) {
      const side = this.sides[ i ]

      if ( !handEls.includes( side.hand ) ) {
        this.removeListeners( side )
        this.hideColliderDebug( side )
        this.sides.splice( i, 1 )
      } else {
        i++
      }
    }

    for ( let el of handEls ) {
      if ( !this.sides.find( side => side.hand === el ) ) {
        const newSide = { hand: el, mode: "hover", }
        this.sides.push( newSide )
        this.addListeners( newSide )
        this.removeListeners( newSide )
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
        this.sendTwoEvents("hoverend", side.hand, side.target)
      }
      if (newHoverEl && newHoverEl !== side.target) {
        this.sendTwoEvents("hoverstart", side.hand, newHoverEl)
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
    return this.sides.find( side => side.hand === el )
  },

  sendTwoEvents(name, handEl, targetEl) {
    const bubbles = this.data.bubbles
    if (this.data.debug) {
      console.log( name, domHelper.getDebugName( targetEl) )
    }

    targetEl.emit(name, { hand: handEl, object: targetEl }, bubbles)
    this.el.emit(name, { hand: handEl, object: targetEl }, bubbles)
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
    if (this.sides.length === 0) { 
      console.warn(`unable to find any hand elements (${data.handSelectors})`)
    }
    if (this.grabEls.length === 0 && this.toolEls.length === 0) {
      console.warn(`no grab (${data.grabSelectors}) or tool (${data.toolSelectors}) elements`)
    }
  },

  onSceneChanged(mutations) {
    domHelper.applyNodeMutations(this.grabEls, mutations, this.data.grabSelectors)
    domHelper.applyNodeMutations(this.toolEls, mutations, this.data.toolSelectors)

    // assume no need to check hands for add/remove
  },

  onGrabStartEvent(e) {
    const side = this.determineSide(e.target)
    if (side && side.mode === "hover" && side.target && side.targetType === "grab") {
      this.sendTwoEvents("hoverend", side.hand, side.target)
      this.setMode(side, "grab")
      this.sendTwoEvents("grabstart", side.hand, side.target)
    }
  },

  onGrabEndEvent(e) {
    const side = this.determineSide(e.target)
    if (side.mode === "grab" && side.target) {
      this.sendTwoEvents("grabend", side.hand, side.target)
      this.setMode(side, "hover")
      side.target = undefined
    }
  },

  onToolEquipEvent(e) {
    const side = this.determineSide(e.target)
    if (side.mode === "hover" && side.target && side.targetType === "tool") {
      this.sendTwoEvents("hoverend", side.hand, side.target)
      this.setMode(side, "tool")
      this.sendTwoEvents("toolequip", side.hand, side.target)
    }
  },

  onToolDropEvent(e) {
    const side = this.determineSide(e.target)
    if (side.mode === "tool" && side.target) {
      this.sendTwoEvents("tooldrop", side.hand, side.target)
      this.setMode(side, "hover")
      side.target = undefined
    }
  },
})


