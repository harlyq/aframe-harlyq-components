// @ts-ignore
const UP_VECTOR = new THREE.Vector3(0,1,0)
const MAX_HISTORY_LENGTH = 3

AFRAME.registerSystem("arm-swinger", {
  schema: {
    left: { type: "selector" },
    right: { type: "selector" },
    startEvent: { default: "gripdown" },
    endEvent: { default: "gripup"},
    cameraRig: { type: "selector" },
    scaling: { default: 1 },
    enable: { default: true },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)
    this.tick = AFRAME.utils.throttleTick(this.tick, 100, this)

    this.newOffset = new THREE.Vector3()
    this.isMoving = false
    this.isEnabled = false
  },

  update(oldData) {
    const data = this.data

    this.left = { hand: data.left, positions: [], forwards: [] }
    this.right = { hand: data.right, positions: [], forwards: [] }

    if (oldData.enable !== data.enable) {
      if (data.enable) {
        this.enable()
      } else {
        this.disable()
      }
    }
  },

  play() {
    if (this.data.enable) {
      this.enable()
    }
  },

  pause() {
    this.disable()
  },

  tick(time, deltaTime) {
    const data = this.data
    const dt = deltaTime*0.001

    let [dLeft, forwardLeft] = this.tickHand(this.left)
    let [dRight, forwardRight] = this.tickHand(this.right)

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
    if (this.data.cameraRig && this.data.cameraRig.object3D && this.isMoving) {
      this.data.cameraRig.object3D.position.add(this.newOffset)
    }
  },

  enable() {
    if (!this.isEnabled) {
      this.addListeners(this.left.hand)
      this.addListeners(this.right.hand)
      this.isEnabled = true
    }
  },

  disable() {
    if (this.isEnabled) {
      this.left.active = false
      this.right.active = false
      this.removeListeners(this.left.hand)
      this.removeListeners(this.right.hand)
      this.isEnabled = false
    }
  },

  onStartEvent(e) {
    if (e.target == this.left.hand) {
      this.activate(this.left)
    } else if (e.target == this.right.hand) {
      this.activate(this.right)
    }
  },

  onEndEvent(e) {
    if (e.target == this.left.hand) {
      this.left.active = false
    } else if (e.target == this.right.hand) {
      this.right.active = false
    }
  },

  addListeners(hand) {
    if (hand) {
      hand.addEventListener(this.data.startEvent, this.onStartEvent)
      hand.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(hand) {
    if (hand) {
      hand.removeEventListener(this.data.startEvent, this.onStartEvent)
      hand.removeEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  activate(side) {
    side.active = true
    side.positions = []
    side.forwards = []
  },

  tickHand(side) {
    if (!side.hand || !side.active) {
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
    const handMatrixWorld = side.hand.object3D.matrixWorld
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