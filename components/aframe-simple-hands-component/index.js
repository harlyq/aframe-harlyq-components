// Copyright 2019 harlyq
// MIT license

import { proximity } from "harlyq-helpers"
import { extent } from "harlyq-helpers"
import { threeHelper } from "harlyq-helpers"

/**
 * Based on donmccurdy/aframe-extras/sphere-collider.js
 *
 * Implement bounding sphere collision detection for entities
 */
AFRAME.registerComponent("simple-hands", {
  schema: {
    objects: {default: ""},
    offset: {type: "vec3"},
    radius: {default: 0.05},
    watch: {default: true},
    bubble: {default: true},
    debug: {default: false},
  },

  init() {
    this.observer = null
    this.els = []
    this.hoverEl = undefined
    this.grabEl = undefined
    this.sphereDebug = undefined
    
    this.onTriggerUp = this.onTriggerUp.bind(this)
    this.onTriggerDown = this.onTriggerDown.bind(this)
  },

  remove() {
    this.pause()
  },

  play() {
    const sceneEl = this.el.sceneEl

    if (this.data.watch) {
      this.observer = new MutationObserver(this.update.bind(this, null))
      this.observer.observe(sceneEl, {childList: true, subtree: true})
    }

    this.el.addEventListener("triggerdown", this.onTriggerDown);
    this.el.addEventListener("triggerup", this.onTriggerUp);
  },

  pause() {
    this.el.removeEventListener("triggerdown", this.onTriggerDown);
    this.el.removeEventListener("triggerup", this.onTriggerUp);

    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  },

  /**
   * Update list of entities to test for collision.
   */
  update(oldData) {
    const data = this.data
    let objectEls

    // Push entities into list of els to intersect.
    if (data.objects) {
      objectEls = this.el.sceneEl.querySelectorAll(data.objects)
    } else {
      // If objects not defined, intersect with everything.
      objectEls = this.el.sceneEl.children
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

    // Convert from NodeList to Array
    this.els = Array.prototype.slice.call(objectEls)
  },

  tick: (function () {
    let obj3DPosition = new THREE.Vector3()
    let handOffset = new THREE.Vector3()

    return function () {
      const data = this.data
      const handObject3D = this.el.object3D
      const handRadius = data.radius

      let newHoverEl = undefined

      if (!this.grabEl) {

        let minScore = Number.MAX_VALUE
  
        handOffset.copy(data.offset).applyMatrix4(handObject3D.matrixWorld)

        for (let el of this.els) {
          if (!el.isEntity || !el.object3D) { 
            continue 
          }
  
          let obj3D = el.object3D  
          if (!obj3D.boundingSphere || !obj3D.boundingBox || obj3D.boundingBox.isEmpty()) {
            this.generateOrientedBoundingBox(obj3D, data.debug)
          }
  
          if (obj3D.boundingBox.isEmpty()) { 
            continue 
          }
  
          // Bounding sphere collision detection
          obj3DPosition.copy(obj3D.boundingSphere.center).applyMatrix4(obj3D.matrixWorld)
          const radius = obj3D.boundingSphere.radius*Math.max(obj3D.scale.x, obj3D.scale.y, obj3D.scale.z)
          const distance = handOffset.distanceTo(obj3DPosition)
          if (distance < radius + handRadius) {

            // Bounding box collision check
            const distanceToBox = proximity.pointToBox(handOffset, obj3D.boundingBox.min, obj3D.boundingBox.max, obj3D.matrixWorld.elements)
            // console.log("box", el.id, distanceToBox)

            if (distanceToBox < handRadius) {
              const score = extent.volume( obj3D.boundingBox )
              // console.log("score", el.id, score)
              if (score < minScore) {
                minScore = score
                newHoverEl = el
              }
            }
          }
        }

        // if (newHoverEl) console.log("closest", newHoverEl.id)
      }

      if (this.hoverEl && this.hoverEl !== newHoverEl) {
        this.sendEvent(this.hoverEl, "hoverend")
      }
      if (newHoverEl && newHoverEl !== this.hoverEl) {
        this.sendEvent(newHoverEl, "hoverstart")
      } 
      this.hoverEl = newHoverEl
    }
  })(),

  generateOrientedBoundingBox(obj3D, debug) {
    // cache boundingBox and boundingSphere
    obj3D.boundingBox = obj3D.boundingBox || new THREE.Box3()
    obj3D.boundingSphere = obj3D.boundingSphere || new THREE.Sphere()
    threeHelper.setOBBFromObject3D(obj3D.boundingBox, obj3D)

    if (!obj3D.boundingBox.isEmpty()) {
      obj3D.boundingBox.getBoundingSphere(obj3D.boundingSphere)

      if (debug) {
        let tempBox = new THREE.Box3()
        tempBox.copy(obj3D.boundingBox)
        obj3D.boundingBoxDebug = new THREE.Box3Helper(tempBox)
        obj3D.boundingBoxDebug.name = "simpleHandsDebug"
        obj3D.add(obj3D.boundingBoxDebug)
      }
    }
  },

  sendEvent(targetEl, eventName) {
    const bubble = this.data.bubble
    // console.log(eventName, targetEl.id)
    targetEl.emit(eventName, {hand: this.el}, bubble)
    this.el.emit(eventName, {target: targetEl}, bubble)
  },

  onTriggerDown(e) {
    if (this.hoverEl) {
      this.grabEl = this.hoverEl
      this.sendEvent(this.grabEl, "grabstart")
    }
  },

  onTriggerUp(e) {
    if (this.grabEl) {
      this.sendEvent(this.grabEl, "grabend")
      this.grabEl = undefined
    }
  }
})


