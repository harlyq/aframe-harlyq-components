import { aframeHelper, domHelper } from "harlyq-helpers"

const UNIFORM_SCALE = new THREE.Vector3(1,1,1)

AFRAME.registerComponent("two-handed-transform", {
  schema: {
    handSelectors: { type: "selectorAll" },
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

    this.sides = []
    this.activeHands = []
    this.target = { 
      object3D: undefined,
      startPosition: new THREE.Vector3(), 
      startQuaternion: new THREE.Quaternion(),
      startScale: new THREE.Vector3(),
      handGap: new THREE.Vector3(), 
      startGap: new THREE.Vector3(),
      invPivotMatrix: new THREE.Matrix4(),
      startWorldPosition: new THREE.Vector3(),
    }
  },

  update(oldData) {
    const data = this.data

    if (data.handSelectors !== oldData.handSelectors) {
      this.sides.length = 0
      if (data.handSelectors) {
        for (let i = 0; i < data.handSelectors.length; i++) {
          this.sides.push( { handEl: data.handSelectors[i], grabPosition: new THREE.Vector3() } )
        }
      }
    }

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
    if (this.activeHands.length === 1) {
      this.oneHanded(this.activeHands[0])
    } else if (this.activeHands.length === 2) {
      this.twoHanded(this.activeHands)
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
      this.activeHands.length = 0
      for (let side of this.sides) {
        this.removeListeners(side.handEl)
      }
      this.isEnabled = false
    }
  },

  onStartEvent(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onStartEvent", e.type, domHelper.getDebugName(e.target) )
    }

    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.activate(side)
      }
    }
  },

  onEndEvent(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onEndEvent", e.type, domHelper.getDebugName(e.target) )
    }

    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.deactivate(side)
      }
    }
  },

  addListeners(handEl) {
    if (handEl) {
      if (this.data.debug) {
        console.log( domHelper.getDebugName(this.el), this.attrName, "addListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(handEl) )
      }
      handEl.addEventListener(this.data.startEvent, this.onStartEvent)
      handEl.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(handEl) {
    if (handEl) {
      if (this.data.debug) {
        console.log( domHelper.getDebugName(this.el), this.attrName, "removeListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(handEl) )
      }
      handEl.removeEventListener(this.data.startEvent, this.onStartEvent)
      handEl.removeEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  activate(side) {
    const i = this.activeHands.indexOf(side)
    if (i === -1) {
      this.activeHands.push(side)
      this.captureStartPositions()
    }
  },

  deactivate(side) {
    const i = this.activeHands.indexOf(side)
    if (i !== -1) {
      this.activeHands.splice(i, 1)
      this.captureStartPositions()
    }
  },

  captureStartPositions: (function() {
    const pivotPos = new THREE.Vector3()
    const pivotQuat = new THREE.Quaternion()
    const invHandMatrix = new THREE.Matrix4()

    return function captureStartPositions() {
      const target3D = this.data.target ? this.data.target.object3D : this.el.object3D
      this.target.object3D = target3D

      if (target3D) {
        for (let side of this.activeHands) {
          side.handEl.object3D.getWorldPosition( side.grabPosition )
        }

        target3D.updateMatrixWorld()
        target3D.getWorldPosition( this.target.startWorldPosition )

        this.target.startPosition.copy(target3D.position)
        this.target.startQuaternion.copy(target3D.quaternion)
        this.target.startScale.copy(target3D.scale)
  
        if (this.activeHands.length >= 2) {
          const left3D = this.activeHands[0].handEl.object3D
          const right3D = this.activeHands[1].handEl.object3D
          this.target.handGap.copy(right3D.position).sub(left3D.position)
          this.calcMatrixFromHands(pivotPos, pivotQuat, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
          invHandMatrix.compose( pivotPos, pivotQuat, UNIFORM_SCALE )
          invHandMatrix.getInverse( invHandMatrix )
          this.target.startGap.copy(right3D.position).applyMatrix4(invHandMatrix).normalize()
          this.target.invPivotMatrix.copy(invHandMatrix).multiply(target3D.matrix)
        }
      } else {
        aframeHelper.warn(`unable to find Object3D for '${this.data.target}'`)
      }
    }
  
  })(),

  oneHanded: (function() {
    const newTranslate = new THREE.Vector3()
    const startGap = new THREE.Vector3()
    const newGap = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    const newEuler = new THREE.Euler(0,0,0,"YXZ")
    const newQuaternion = new THREE.Quaternion()

    return function oneHanded(side) {
      const target3D = this.target.object3D
      if (target3D) {
        const side3D = side.handEl.object3D
        side3D.getWorldPosition(newTranslate).sub(side.grabPosition)

        startGap.copy(side.grabPosition).sub(this.target.startWorldPosition)
        side3D.getWorldPosition(newGap).sub(this.target.startWorldPosition)
        const scale = newGap.length()/startGap.length()
        newScale.set(scale, scale, scale)

        newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize())
        newEuler.setFromQuaternion(newQuaternion, "YXZ")
        newQuaternion.setFromEuler(newEuler)

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
        const left3D = this.activeHands[0].handEl.object3D
        const right3D = this.activeHands[1].handEl.object3D
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
    outPos.copy(handAPos).add(handBPos).multiplyScalar(0.5)
    outQuat.copy(handAQuat).slerp(handBQuat, .5)
  },

})