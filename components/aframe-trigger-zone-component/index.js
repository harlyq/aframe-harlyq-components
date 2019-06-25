import { aframeHelper, domHelper, overlap, threeHelper } from "harlyq-helpers"

AFRAME.registerComponent("trigger-zone", {
  schema: {
    triggerSelectors: { default: "" },
    watch: { default: false },
    debug: { default: false },
    tickMS: { default: 100 },
    bubbles: { default: false },
    enabled: { default: true },
    test: { default: "overlap", oneOf: ["overlap", "within"]},
  },

  multiple: true,

  init() {
    this.firstTime = true
    this.debugShape = undefined
    this.overlapping = []
    this.triggerElements = []
    this.observer = undefined
    this.onSceneLoaded = this.onSceneLoaded.bind(this)
    this.onSceneChanged = this.onSceneChanged.bind(this)

    this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded)
  },

  remove() {
    this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded)

    if (this.observer) {
      this.observer.disconnect()
      this.observer = undefined
    }

    this.hideDebugShape()
  },

  update(oldData) {
    const data = this.data

    // don't perform these operations on the first update as we'll do them in onSceneLoaded() when all the other nodes are present
    if (!this.firstTime && oldData.triggerSelectors !== data.triggerSelectors) {
      this.gatherElements()
    }

    if (!this.firstTime && (oldData.watch !== data.watch || oldData.enabled !== data.enabled) ) {
      this.setupWatch()
    }

    if (oldData.tickMS !== data.tickMS) {
      this.tick = AFRAME.utils.throttleTick(this.tick, data.tickMS, this)
    }

    if (oldData.debug !== data.debug || oldData.enabled !== data.enabled) {
      this.showDebugShape()
    }

    this.firstTime = false
  },

  tick() {
    if (this.triggerElements.length > 0 && this.data.enabled) {
      this.checkForEnterLeave()
    }
  },

  gatherElements() {
    const data = this.data
    this.triggerElements = data.triggerSelectors ? Array.from(document.querySelectorAll(data.triggerSelectors)) : []

    if (data.debug) {
      console.log(`gathering ${this.triggerElements.length} elements`)
    }

    if (this.triggerElements.length === 0) {
      aframeHelper.warn(`no trigger elements using '${data.triggerSelectors}' for trigger-zone`)
    }
  },

  checkForEnterLeave() {
    const elements = this.findOverlapping(this.triggerElements, "cyan")

    for (let overlapping of this.overlapping) {
      if (!elements.includes(overlapping)) {
        this.sendTwoEvents("trigger-zone-leave", overlapping)
      }
    }

    for (let newEl of elements) {
      if (!this.overlapping.includes(newEl)) {
        this.sendTwoEvents("trigger-zone-enter", newEl)
      }
    }

    this.overlapping = elements
  },

  findOverlapping: (function () {
    const obj3DPosition = new THREE.Vector3()
    const zonePosition = new THREE.Vector3()
    const zoneScale_2 = new THREE.Vector3()
    const BOX_MIN_EXTENTS = new THREE.Vector3(-.5,-.5,-.5)
    const BOX_MAX_EXTENTS = new THREE.Vector3(.5,.5,.5)

    return function findOverlapping(els, debugColor) {
      let overlappingEls = []
      const object3D = this.el.object3D

      object3D.updateMatrixWorld(true)
      object3D.getWorldPosition(zonePosition)
      object3D.getWorldScale(zoneScale_2).multiplyScalar(0.5)
      const zoneRadius = Math.hypot(zoneScale_2.x, zoneScale_2.y, zoneScale_2.z)

      for (let el of els) {
        if (!el.isEntity || !el.object3D) {
          continue
        }

        let el3D = el.object3D
        if (!el3D.boundingSphere || !el3D.boundingBox || el3D.boundingBox.isEmpty()) {
          threeHelper.generateOrientedBoundingBox(el3D, debugColor)
        }

        if (el3D.boundingBox.isEmpty()) {
          continue
        }

        // Bounding sphere collision detection
        obj3DPosition.copy(el3D.boundingSphere.center).applyMatrix4(el3D.matrixWorld)
        const radius = el3D.boundingSphere.radius*Math.max(el3D.scale.x, el3D.scale.y, el3D.scale.z)
        const distance = zonePosition.distanceTo(obj3DPosition)

        if (distance > radius + zoneRadius) {
          continue
        }

        // Bounding box collision check
        let isOverlapping = false
        if (this.data.test === "overlap") {
          isOverlapping = overlap.boxWithBox(el3D.boundingBox.min, el3D.boundingBox.max, el3D.matrixWorld.elements, BOX_MIN_EXTENTS, BOX_MAX_EXTENTS, object3D.matrixWorld.elements)
        } else {
          isOverlapping = overlap.boxWithinBox(el3D.boundingBox.min, el3D.boundingBox.max, el3D.matrixWorld.elements, BOX_MIN_EXTENTS, BOX_MAX_EXTENTS, object3D.matrixWorld.elements)
        }

        if (isOverlapping) {
          overlappingEls.push(el)
        }
      }

      return overlappingEls
    }

  })(),

  sendTwoEvents(name, to) {
    if (this.data.debug) {
      console.log(name, domHelper.getDebugName(this.el), domHelper.getDebugName(to))
    }

    const bubbles = this.data.bubbles
    this.el.emit(name, { zoneTarget: to, zoneSource: this.el }, bubbles)
    to.emit(name, { zoneTarget: to, zoneSource: this.el }, bubbles)
  },

  setupWatch() {
    if (this.data.watch && this.data.enabled) {
      this.observer = this.observer ? this.observer : new MutationObserver(this.onSceneChanged)
      this.observer.observe(this.el.sceneEl, {childList: true, subtree: true})
    } else if (this.observer) {
      this.observer.disconnect()
    }
  },

  showDebugShape() {
    this.hideDebugShape()

    const geometry = new THREE.BoxBufferGeometry()
    const wireframe = new THREE.WireframeGeometry(geometry)
    this.debugShape = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: this.data.enabled ? "blue" : "grey" }))
    this.el.object3D.add(this.debugShape)
  },

  hideDebugShape() {
    if (this.debugShape) {
      this.el.object3D.remove(this.debugShape)
      this.debugShape = undefined
    }
  },

  onSceneLoaded(e) {
    this.gatherElements()
    this.setupWatch()
  },

  onSceneChanged(mutations) {
    domHelper.applyNodeMutations(this.triggerElements, mutations, this.data.triggerSelectors)
  },
})

