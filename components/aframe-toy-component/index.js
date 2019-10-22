import { aframeHelper, domHelper, overlap } from "harlyq-helpers"

// a list of events that are common amongst most types of tracked-controls
const PIPED_EVENTS = ["buttondown", "buttonup", "touchstart", "touchend", "buttonchanged", "axismoved", "controllerconnected", "controllerdisconnected",
  "gripdown", "gripup", "gripchanged", "trackpaddown", "trackpadup", "trackpadchanged", "triggerdown", "triggerup", "triggerchanged"]

AFRAME.registerComponent("toy", {
  schema: {
    controls: { type: "selectorAll" },
    debug: { default: false },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
  },

  init() {
    this.onPipedEvent = this.onPipedEvent.bind(this)
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.onGrabberObject3DSet = this.onGrabberObject3DSet.bind(this)
    this.toyBound = new THREE.Box3()
    this.grabbers = []

    this.el.addEventListener("object3dset", this.onObject3DSet)
    this.calculateBounds(this.toyBound, this.el)
  },

  remove() {
    this.destroyGrabbers()
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update(oldData) {
    const data = this.data

    if (oldData.controls !== data.controls) {      
      this.destroyGrabbers()
      this.createGrabbers(data.controls)
    }
  },

  tick() {
    for (let grabber of this.grabbers) {
      if (!grabber.isGrabbing) {
        this.checkProximity(grabber)
      }
    }
  },

  addGrabListeners(el) {
    const data = this.data
    el.addEventListener(data.grabStart, this.onGrabStart)
    el.addEventListener(data.grabEnd, this.onGrabEnd)
  },

  removeGrabListeners(el) {
    const data = this.data
    el.removeEventListener(data.grabStart, this.onGrabStart)
    el.removeEventListener(data.grabEnd, this.onGrabEnd)
  },

  addPipedListeners(el) {
    for (let type of PIPED_EVENTS) {
      el.addEventListener(type, this.onPipedEvent)
    }
  },

  removePipedListeners(el) {
    for (let type of PIPED_EVENTS) {
      el.removeEventListener(type, this.onPipedEvent)
    }
  },

  calculateBounds(outBounds, el) {
    const obj3D = el.object3D
    const mesh = obj3D.getObjectByProperty("isMesh", true)
    const geometry = mesh ? mesh.geometry : undefined

    outBounds.makeEmpty()

    if (geometry) {
      geometry.computeBoundingBox()
      outBounds.copy(geometry.boundingBox)

      if (this.data.debug) {
        const debug3D = new THREE.Box3Helper(outBounds, "yellow" )
        obj3D.add(debug3D)
      }
    }

    return outBounds
  },

  checkProximity(grabber) {
    if (!grabber.bound.isEmpty() && !this.toyBound.isEmpty()) {
      const isNear = overlap.boxWithBox(this.toyBound.min, this.toyBound.max, this.el.object3D.matrixWorld.elements, grabber.bound.min, grabber.bound.max, grabber.el.object3D.matrixWorld.elements)
      const wasNear = grabber.isNear
      grabber.isNear = isNear
      if (wasNear && !isNear) {
        if (this.data.debug) {
          aframeHelper.log(this, `far from '${domHelper.getDebugName(grabber.el)}'`)
        }
        
        this.el.emit("toyfar", { control: grabber.el })
        this.removeGrabListeners(grabber.el)
      } else if (isNear && !wasNear) {
        if (this.data.debug) {
          aframeHelper.log(this, `near to '${domHelper.getDebugName(grabber.el)}'`)
        }

        this.addGrabListeners(grabber.el)
        this.el.emit("toynear", { control: grabber.el })
      }
    }
  },

  createGrabbers(controls) {
    for (let el of controls) {
      el.addEventListener("object3dset", this.onGrabberObject3DSet)
    }

    this.grabbers = controls.map( el => ( { el, bound: this.calculateBounds(new THREE.Box3(), el) ,isNear: false, isGrabbing: false } ) )
  },

  destroyGrabbers() {
    for (let grabber of this.grabbers) {
      grabber.el.removeEventListener("object3dset", this.onGrabberObject3DSet)

      if (grabber.isGrabbing) {
        this.removePipedListeners(grabber.el)
      }
      if (grabber.isNear) {
        this.removeGrabListeners(grabber.el)
      }
    }
    this.grabbers = []
  },

  onPipedEvent(event) {
    this.el.emit(event.type, event.detail, false)
  },

  onGrabStart(event) {
    const grabber = this.grabbers.find(grabber => grabber.el === event.target)
    if (grabber) {
      if (this.data.debug) {
        aframeHelper.log(this, `toygrabbed by '${domHelper.getDebugName(grabber.el)}'`)
      }

      grabber.isGrabbing = true
      this.addPipedListeners(grabber.el)
      this.el.emit("toygrabbed", { control: grabber.el })
    }
  },

  onGrabEnd(event) {
    const grabber = this.grabbers.find(grabber => grabber.el === event.target)
    if (grabber) {
      if (this.data.debug) {
        aframeHelper.log(this, `toydropped by '${domHelper.getDebugName(grabber.el)}'`)
      }

      this.removePipedListeners(grabber.el)
      grabber.isGrabbing = false
      this.el.emit("toydropped", { control: grabber.el })
    }
  },

  onObject3DSet(event) {
    this.calculateBounds(this.toyBound, this.el)
  },

  onGrabberObject3DSet(event) {
    const grabber = this.grabbers.find(grabber => grabber.el === event.target)
    if (grabber) {
      this.calculateBounds(grabber.bound, grabber.el)      
    }
  },
})