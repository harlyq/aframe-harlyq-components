// @ts-ignore
const UP_VECTOR = new THREE.Vector3(0,1,0)
const MAX_HISTORY_LENGTH = 3

AFRAME.registerComponent("arm-swinger", {
  schema: {
    handSelectors: { type: "selectorAll" },
    startEvent: { default: "gripdown" },
    endEvent: { default: "gripup"},
    cameraRig: { type: "selector" },
    scaling: { default: 1 },
    enabled: { default: true },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)
    this.tick = AFRAME.utils.throttleTick(this.tick, 100, this)

    this.newOffset = new THREE.Vector3()
    this.isMoving = false
    this.isEnabled = false

    this.sides = []
  },

  update(oldData) {
    const data = this.data

    if (oldData.handSelectors !== data.handSelectors) {
      this.sides.length = 0

      if (data.handSelectors) {
        for (let handEl of data.handSelectors) {
          this.sides.push( { handEl, active: false, positions: [], forwards: [] } )
        }
      }
    }

    if (oldData.enabled !== data.enabled) {
      if (data.enabled) {
        this.enable()
      } else {
        this.disable()
      }
    }
  },

  play() {
    if (this.data.enabled) {
      this.enable()
    }
  },

  pause() {
    this.disable()
  },

  tick(time, deltaTime) {
    const data = this.data
    const dt = deltaTime*0.001

    let [dLeft, forwardLeft] = this.sides.length > 0 ? this.tickSide(this.sides[0]) : [undefined, undefined]
    let [dRight, forwardRight] = this.sides.length > 1 ? this.tickSide(this.sides[1]) : [undefined, undefined]

    this.isMoving = false
    if (forwardLeft || forwardRight) {
      this.newOffset.set(0,0,0)
      let d = 0

      if (forwardLeft) {
        this.newOffset.add(forwardLeft)
        d = Math.max(d, dLeft)
      }

      if (forwardRight) {
        this.newOffset.add(forwardRight)
        d = Math.max(d, dRight)
      }

      this.newOffset.y = 0
      this.newOffset.normalize().multiplyScalar(-data.scaling*d*dt)
      this.isMoving = true
    }
  },

  tock() {
    // positioning the camera in the tock because the tick is throttled
    const data = this.data

    const cameraRig3D = data.cameraRig ? data.cameraRig.object3D : this.el.object3D
    if ( this.isMoving && cameraRig3D ) {
      cameraRig3D.position.add( this.newOffset )
    }
  },

  enable() {
    if (!this.isEnabled) {
      for (let side of this.sides) {
        this.addListeners(side.handEl)
      }
      this.isEnabled = true
    }
  },

  disable() {
    if (this.isEnabled) {
      for (let side of this.sides) {
        this.deactivate(side)
        this.removeListeners(side.handEl)
      }
      this.isEnabled = false
    }
  },

  onStartEvent(e) {
    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.activate(side)
      }
    }
  },

  onEndEvent(e) {
    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.deactivate(side)
      }
    }
  },

  addListeners(handEl) {
    if (handEl) {
      handEl.addEventListener(this.data.startEvent, this.onStartEvent)
      handEl.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(handEl) {
    if (handEl) {
      handEl.removeEventListener(this.data.startEvent, this.onStartEvent)
      handEl.removeEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  activate(side) {
    side.active = true
    side.positions.length = 0
    side.forwards.length = 0
  },

  deactivate(side) {
    side.active = false
  },

  tickSide(side) {
    if (!side.active) {
      return [undefined, undefined]
    }

    let position
    let forward
    if (side.positions.length >= MAX_HISTORY_LENGTH) {
      position = side.positions.shift() // reuse the matrix from the first entry
      forward = side.forwards.shift()
    } else {
      position = new THREE.Vector3()
      forward = new THREE.Vector3()
    }
    const handMatrixWorld = side.handEl.object3D.matrixWorld
    side.positions.push( position.setFromMatrixPosition(handMatrixWorld) )
    side.forwards.push( forward.setFromMatrixColumn(handMatrixWorld, 0).cross(UP_VECTOR) )

    let distance = 0
    const n = side.positions.length
    for (let i = 1; i < n; i++) {
      distance += side.positions[i].distanceTo(side.positions[i-1])
    }

    // console.log("distance", distance.toFixed(2), "forward", forward.x.toFixed(2), forward.y.toFixed(2), forward.z.toFixed(2))
    return [distance, forward]
  }  

})