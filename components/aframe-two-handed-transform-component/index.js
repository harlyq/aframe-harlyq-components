AFRAME.registerSystem("two-handed-transform", {
  schema: {
    left: { type: "selector" },
    right: { type: "selector" },
    startEvent: { default: "gripdown" },
    endEvent: { default: "gripup"},
    target: { type: "selector" },
    enable: { default: true },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)

    this.isEnabled = false

    this.left = { hand: undefined, active: false, startPosition: new THREE.Vector3() }
    this.right = { hand: undefined, active: false, startPosition: new THREE.Vector3() }
    this.target = { object3D: undefined, startMatrix: new THREE.Matrix4(), startPosition: new THREE.Vector3(), handGap: new THREE.Vector3(), handPivot: new THREE.Vector3(), rotationPivot: new THREE.Vector3() }
  },

  update(oldData) {
    const data = this.data

    this.left.hand = data.left
    this.left.active = false
    this.right.hand = data.right
    this.right.active = false

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

  tick() {
    if (this.left.active !== this.right.active) {
      this.oneHanded(this.left.active ? this.left : this.right)
    } else if (this.left.active && this.right.active) {
      this.twoHanded()
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
      this.deactivate(this.left)
    } else if (e.target == this.right.hand) {
      this.deactivate(this.right)
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
    this.captureStartPositions()
  },

  deactivate(side) {
    side.active = false
    this.captureStartPositions()
  },

  captureStartPositions: (function() {
    const inverseTargetWorldMatrix = new THREE.Matrix4()
    const leftPositionWorld = new THREE.Vector3()
    const rightPositionWorld = new THREE.Vector3()

    return function captureStartPositions() {
      const target3D = this.data.target ? this.data.target.object3D : undefined
      this.target.object3D = target3D

      if (target3D) {
        if (this.left.active) {
          this.left.startPosition.copy(this.left.hand.object3D.position)
        }
        if (this.right.active) {
          this.right.startPosition.copy(this.right.hand.object3D.position)
        }
  
        this.target.startMatrix.copy(target3D.matrix)
        this.target.startPosition.copy(target3D.position)
  
        if (this.right.active && this.left.active) {
          this.left.hand.object3D.getWorldPosition(leftPositionWorld)
          this.right.hand.object3D.getWorldPosition(rightPositionWorld)
          this.target.handGap.copy(rightPositionWorld).sub(leftPositionWorld)
          this.target.handPivot.copy(this.right.hand.object3D.position).add(this.left.hand.object3D.position).multiplyScalar(0.5)

          // the rotationPivot is in target local space
          inverseTargetWorldMatrix.getInverse(this.target.object3D.matrixWorld)
          this.target.rotationPivot.copy(rightPositionWorld).add(leftPositionWorld).multiplyScalar(0.5)
          this.target.rotationPivot.applyMatrix4(inverseTargetWorldMatrix)
        }
      } else {
        console.warn(`unable to find Object3D for '${this.data.target}'`)
      }
    }
  
  })(),

  oneHanded: (function() {
    const tempPosition = new THREE.Vector3()

    return function oneHanded(side) {
      const target3D = this.target.object3D
      if (target3D) {
        target3D.position.copy( tempPosition.copy(side.hand.object3D.position).sub(side.startPosition).add(this.target.startPosition) )
      }
    }
  })(),

  twoHanded: (function() {
    const leftPosition = new THREE.Vector3()
    const rightPosition = new THREE.Vector3()
    const newHandGap = new THREE.Vector3()
    const newPosition = new THREE.Vector3()
    const newTranslate = new THREE.Vector3()
    const flatNewHandGap = new THREE.Vector3()
    const flatRigHandGap = new THREE.Vector3()
    const rightRigHandGap = new THREE.Vector3()
    const newMatrix = new THREE.Matrix4()

    return function twoHanded() {
      const target3D = this.target.object3D
      if (target3D) {
        leftPosition.copy(this.left.hand.object3D.position)
        rightPosition.copy(this.right.hand.object3D.position)
        newHandGap.copy(rightPosition).sub(leftPosition)

        const scale = newHandGap.length()/this.target.handGap.length()

        flatNewHandGap.copy(newHandGap).y = 0
        flatRigHandGap.copy(this.target.handGap).y = 0
        rightRigHandGap.set(-flatRigHandGap.z, 0, flatRigHandGap.x)
        const angle = flatNewHandGap.angleTo(flatRigHandGap)*( rightRigHandGap.dot(flatNewHandGap) > 0 ? -1 : 1 )

        newTranslate.copy(rightPosition).add(leftPosition).multiplyScalar(0.5).sub(this.target.handPivot)

        const c = Math.cos(angle)
        const s = Math.sin(angle)
        const px = this.target.rotationPivot.x, pz = this.target.rotationPivot.z

        newMatrix.set(
          c*scale  ,0     ,s*scale ,-c*scale*(px) - s*scale*(pz) + px,
          0        ,scale ,0       ,0,
          -s*scale ,0     ,c*scale , s*scale*(px) - c*scale*(pz) + pz,
          0        ,0     ,0       ,1)
  
        newMatrix.premultiply(this.target.startMatrix)
        newMatrix.decompose(newPosition, target3D.quaternion, target3D.scale)

        // position is applied independently because we don't want it to be influenced by the scaling in the startMatrix
        newPosition.add(newTranslate)
        target3D.position.copy(newPosition)
      }
    }
  })(),
})