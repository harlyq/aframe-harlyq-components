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

    this.left = { hand: data.left, history: [], forward: [] }
    this.right = { hand: data.right, history: [], forward: [] }
    this.rig = data.cameraRig && data.cameraRig.object3D ? data.cameraRig : undefined

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

    const t = time*0.001
    const dt = deltaTime*0.001

    let [dLeft, forwardLeft] = this.tickHand(t, this.left)
    let [dRight, forwardRight] = this.tickHand(t, this.right)

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
    // positioning the camera in the tock produces smoother movement
    if (this.rig && this.isMoving) {
      this.rig.object3D.position.add(this.newOffset)
    }
  },

  enable() {
    if (!this.isEnabled) {
      this.addListeners(this.left)
      this.addListeners(this.right)
      this.isEnabled = true
    }
  },

  disable() {
    if (this.isEnabled) {
      this.left.active = false
      this.right.active = false
      this.removeListeners(this.left)
      this.removeListeners(this.right)
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

  addListeners(side) {
    if (side.hand) {
      side.hand.addEventListener(this.data.startEvent, this.onStartEvent)
      side.hand.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(side) {
    if (side.hand) {
      side.hand.removeEventListener(this.data.startEvent, this.onStartEvent)
      side.hand.removeEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  activate(side) {
    side.active = true
    side.history = []
    side.forward = []
  },

  tickHand: (function() {
    const UP_VECTOR = new THREE.Vector3(0,1,0)
    const tempVecA = new THREE.Vector3()
    const tempVecB = new THREE.Vector3()

    return function tickHand(t, side) {
      if (!side.hand || !side.active) {
        return [undefined, undefined]
      }
  
      let matrix
      let forward
      if (side.history.length > MAX_HISTORY_LENGTH) {
        matrix = side.history.shift() // reuse the matrix from the first entry
        forward = side.forward.shift()
      } else {
        matrix = new THREE.Matrix4()
        forward = new THREE.Vector3()
      }
      side.history.push( matrix.copy(side.hand.object3D.matrixWorld) )
      side.forward.push( forward.setFromMatrixColumn(matrix, 0).cross(UP_VECTOR) )

      let distance = 0
      const n = side.history.length
      for (let i = Math.max(1, n - 3); i < n; i++) {
        tempVecA.setFromMatrixPosition(side.history[i])
        tempVecB.setFromMatrixPosition(side.history[i-1])
        distance += tempVecA.distanceTo(tempVecB)
      }

      // console.log(t.toFixed(1), "distance", distance.toFixed(2), "forward", forward.x.toFixed(2), forward.y.toFixed(2), forward.z.toFixed(2))
      return [distance, forward]
    }  
  })(),

})