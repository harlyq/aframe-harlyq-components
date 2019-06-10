import { domHelper } from "harlyq-helpers"

const UNIFORM_SCALE = new THREE.Vector3(1,1,1)
const UP_VECTOR = new THREE.Vector3(0,1,0)

AFRAME.registerComponent("two-handed-transform", {
  schema: {
    left: { type: "selector" },
    right: { type: "selector" },
    startEvent: { default: "gripdown" },
    endEvent: { default: "gripup"},
    target: { type: "selector" },
    enable: { default: true },
    debug: { default: false },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)

    this.isEnabled = false

    this.left = { hand: undefined, active: false, startPosition: new THREE.Vector3() }
    this.right = { hand: undefined, active: false, startPosition: new THREE.Vector3() }
    this.target = { 
      object3D: undefined, 
      startPosition: new THREE.Vector3(), 
      startQuaternion: new THREE.Quaternion(),
      startScale: new THREE.Vector3(),
      handGap: new THREE.Vector3(), 
      startGap: new THREE.Vector3(),
      invPivotMatrix: new THREE.Matrix4(),
    }
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
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onStartEvent", e.type, domHelper.getDebugName(e.target) )
    }

    if (e.target == this.left.hand) {
      this.activate(this.left)
    } else if (e.target == this.right.hand) {
      this.activate(this.right)
    }
  },

  onEndEvent(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onEndEvent", e.type, domHelper.getDebugName(e.target) )
    }

    if (e.target == this.left.hand) {
      this.deactivate(this.left)
    } else if (e.target == this.right.hand) {
      this.deactivate(this.right)
    }
  },

  addListeners(hand) {
    if (hand) {
      if (this.data.debug) {
        console.log( domHelper.getDebugName(this.el), this.attrName, "addListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(hand) )
      }
      hand.addEventListener(this.data.startEvent, this.onStartEvent)
      hand.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(hand) {
    if (hand) {
      if (this.data.debug) {
        console.log( domHelper.getDebugName(this.el), this.attrName, "removeListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(hand) )
      }
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
    const pivotPos = new THREE.Vector3()
    const pivotQuat = new THREE.Quaternion()
    const invHandMatrix = new THREE.Matrix4()

    return function captureStartPositions() {
      const target3D = this.data.target ? this.data.target.object3D : this.el.object3D
      this.target.object3D = target3D

      if (target3D) {
        if (this.left.active) {
          this.left.startPosition.copy(this.left.hand.object3D.position)
        }
        if (this.right.active) {
          this.right.startPosition.copy(this.right.hand.object3D.position)
        }
  
        this.target.startPosition.copy(target3D.position)
        this.target.startQuaternion.copy(target3D.quaternion)
        this.target.startScale.copy(target3D.scale)
  
        if (this.right.active && this.left.active) {
          const left3D = this.left.hand.object3D
          const right3D = this.right.hand.object3D
          this.target.handGap.copy(right3D.position).sub(left3D.position)
          this.calcMatrixFromHands(pivotPos, pivotQuat, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
          invHandMatrix.compose( pivotPos, pivotQuat, UNIFORM_SCALE )
          invHandMatrix.getInverse( invHandMatrix )
          this.target.startGap.copy(right3D.position).applyMatrix4(invHandMatrix).normalize()
          this.target.invPivotMatrix.copy(invHandMatrix).multiply(target3D.matrix)
        }
      } else {
        console.warn(`unable to find Object3D for '${this.data.target}'`)
      }
    }
  
  })(),

  oneHanded: (function() {
    const newTranslate = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    const newEuler = new THREE.Euler(0,0,0,"YXZ")
    const newQuaternion = new THREE.Quaternion()

    return function oneHanded(side) {
      const target3D = this.target.object3D
      if (target3D) {
        newTranslate.copy(side.hand.object3D.position).sub(side.startPosition)

        // const scale = side.hand.object3D.position.distanceTo(side.startPosition)
        // newScale.set(scale, scale, scale)

        target3D.position.copy( newTranslate.add(this.target.startPosition) )
        // target3D.quaternion.copy( newQuaternion.multiply( this.target.startQuaternion ) )
        // target3D.scale.copy( newScale.multiply( this.target.startScale ) )
      }
    }
  })(),

  twoHanded: (function() {
    const firstPosition = new THREE.Vector3()
    const secondPosition = new THREE.Vector3()
    const newHandGap = new THREE.Vector3()
    const rotationGap = new THREE.Vector3()
    const newRotationGap = new THREE.Vector3()
    const newPivot = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    const newQuaternion = new THREE.Quaternion()
    const newMatrix = new THREE.Matrix4()
    const secondQuaternion = new THREE.Quaternion()
    const invNewMatrix = new THREE.Matrix4()

    return function twoHanded() {
      const target3D = this.target.object3D
      if (target3D) {
        const left3D = this.left.hand.object3D
        const right3D = this.right.hand.object3D
        firstPosition.copy(left3D.position)
        secondPosition.copy(right3D.position)
        newHandGap.copy(secondPosition).sub(firstPosition)

        const scale = newHandGap.length() / this.target.handGap.length()
        newScale.set(scale, scale, scale)

        target3D.scale.copy( newScale.multiply( this.target.startScale ) )

        this.calcMatrixFromHands(newPivot, secondQuaternion, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
        newMatrix.compose(newPivot, secondQuaternion, UNIFORM_SCALE)

        invNewMatrix.getInverse(newMatrix)
        newRotationGap.copy(secondPosition).applyMatrix4(invNewMatrix).normalize()
        newQuaternion.setFromUnitVectors(this.target.startGap, newRotationGap)
        secondQuaternion.multiply( newQuaternion )
        newMatrix.compose(newPivot, secondQuaternion, UNIFORM_SCALE)
        
        newMatrix.multiply( this.target.invPivotMatrix )
        newMatrix.decompose(newPivot, secondQuaternion, newScale)

        target3D.position.copy(newPivot)
        target3D.quaternion.copy(secondQuaternion)
      }
    }
  })(),

  calcMatrixFromHands(outPos, outQuat, handAPos, handAQuat, handBPos, handBQuat) {
    outPos.copy(handBPos).sub(handAPos).normalize()
    outQuat.setFromUnitVectors(UP_VECTOR, outPos)

    outPos.copy(handAPos).add(handBPos).multiplyScalar(0.5)
    outQuat.copy(handAQuat).slerp(handBQuat, .5)
  },

})