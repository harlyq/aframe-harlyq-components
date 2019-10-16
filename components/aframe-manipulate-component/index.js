import { aframeHelper, domHelper } from "harlyq-helpers"

function toLowerCase(x) { return x.toLowerCase() }

AFRAME.registerComponent("manipulate", {
  schema: {
    hands: { type: "selectorAll" },
    oneHanded: { default: "grab" },
    twoHanded: { default: "grab, uniformscale", parse: toLowerCase },
    pivot: { type: "vec3", default: { x:0, y:0, z:0 } },
    startEvent: { default: "triggerdown", parse: toLowerCase },
    endEvent: { default: "triggerup", parse: toLowerCase },
    enabled: { default: true },
    debug: { default: false },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)

    this.isEnabled = false

    this.sides = []
    this.activeSides = []
    this.capture = { 
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

    if (data.hands !== oldData.hands) {
      this.sides.length = 0
      if (data.hands) {
        for (let i = 0; i < data.hands.length; i++) {
          this.sides.push( { handEl: data.hands[i], grabPosition: new THREE.Vector3() } )
        }
      }
    }

    this.oneHanded = this.parseConstraints(data.oneHanded)
    this.twoHanded = this.parseConstraints(data.twoHanded)

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

  tick() {
    if (this.activeSides.length === 1) {
      this.tickOneHanded(this.activeSides[0])
    } else if (this.activeSides.length === 2) {
      this.tickTwoHanded(this.activeSides)
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
      this.activeSides.length = 0
      for (let side of this.sides) {
        this.removeListeners(side.handEl)
      }
      this.isEnabled = false
    }
  },

  onStartEvent(e) {
    if (this.data.debug) {
      console.log( aframeHelper.getComponentDebugName(this), "onStartEvent", e.type, domHelper.getDebugName(e.target) )
    }

    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.activateSide(side)
      }
    }
  },

  onEndEvent(e) {
    if (this.data.debug) {
      console.log( aframeHelper.getComponentDebugName(this), "onEndEvent", e.type, domHelper.getDebugName(e.target) )
    }

    for (let side of this.sides) {
      if (e.target === side.handEl) {
        this.deactivateSide(side)
      }
    }
  },

  addListeners(handEl) {
    if (handEl && ( this.data.startEvent || this.data.endEvent ) ) {
      if (this.data.debug) {
        console.log( aframeHelper.getComponentDebugName(this), "addListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(handEl) )
      }
      handEl.addEventListener(this.data.startEvent, this.onStartEvent)
      handEl.addEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  removeListeners(handEl) {
    if (handEl && ( this.data.startEvent || this.data.endEvent ) ) {
      if (this.data.debug) {
        console.log( aframeHelper.getComponentDebugName(this), "removeListeners", this.data.startEvent, this.data.endEvent, domHelper.getDebugName(handEl) )
      }
      handEl.removeEventListener(this.data.startEvent, this.onStartEvent)
      handEl.removeEventListener(this.data.endEvent, this.onEndEvent)
    }
  },

  activateSide(side) {
    const i = this.activeSides.indexOf(side)
    if (i === -1) {
      this.activeSides.push(side)
      this.captureStartPositions()
    }
  },

  deactivateSide(side) {
    const i = this.activeSides.indexOf(side)
    if (i !== -1) {
      this.activeSides.splice(i, 1)
      this.captureStartPositions()
    }
  },

  captureStartPositions: (function() {
    const pivotPos = new THREE.Vector3()
    const pivotQuat = new THREE.Quaternion()
    const invHandMatrix = new THREE.Matrix4()
    const UNIFORM_SCALE = new THREE.Vector3(1,1,1)

    return function captureStartPositions() {
      const target3D = this.data.target ? this.data.target.object3D : this.el.object3D
      this.capture.object3D = target3D

      if (target3D) {

        for (let side of this.activeSides) {
          side.handEl.object3D.getWorldPosition( side.grabPosition )
        }

        target3D.updateMatrixWorld()
        target3D.getWorldPosition( this.capture.startWorldPosition )

        this.capture.startPosition.copy(target3D.position)
        this.capture.startQuaternion.copy(target3D.quaternion)
        this.capture.startScale.copy(target3D.scale)

        const numActiveSides = this.activeSides.length

        if (numActiveSides >= 2) {
          const left3D = this.activeSides[0].handEl.object3D
          const right3D = this.activeSides[1].handEl.object3D
          this.capture.handGap.copy(right3D.position).sub(left3D.position)
          this.calcMatrixFromHands(pivotPos, pivotQuat, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
          invHandMatrix.compose( pivotPos, pivotQuat, UNIFORM_SCALE )
          invHandMatrix.getInverse( invHandMatrix )
          this.capture.startGap.copy(right3D.position).applyMatrix4(invHandMatrix).normalize()
          this.capture.invPivotMatrix.copy(invHandMatrix).multiply(target3D.matrix)

        } else if (numActiveSides === 1) {
          const hand3D = this.activeSides[0].handEl.object3D
          // hand3D.updateMatrixWorld() 
          this.capture.invPivotMatrix.getInverse(hand3D.matrixWorld).multiply(target3D.matrixWorld)
        }
      } else {
        aframeHelper.warn(`unable to find Object3D for '${this.data.target}'`)
      }
    }
  
  })(),

  tickOneHanded: (function() {
    const newTranslate = new THREE.Vector3()
    const startGap = new THREE.Vector3()
    const newGap = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    // const newEuler = new THREE.Euler(0,0,0,"YXZ")
    // const newQuaternion = new THREE.Quaternion()
    const invParentMatrix = new THREE.Matrix4()
    const newMatrix = new THREE.Matrix4()

    return function oneHanded(side) {
      const target3D = this.capture.object3D
      if (target3D) {
        const hand3D = side.handEl.object3D
        hand3D.updateMatrixWorld()
        target3D.parent.updateMatrixWorld(true)

        startGap.copy(side.grabPosition).sub(this.capture.startWorldPosition)
        hand3D.getWorldPosition(newGap).sub(this.capture.startWorldPosition)

        if (this.oneHanded.uniformScale) {
          const scale = newGap.length()/startGap.length()
          newScale.set(scale, scale, scale)
        }

        if (this.oneHanded.translate) {
          hand3D.getWorldPosition(newTranslate).sub(side.grabPosition)
          target3D.position.copy( newTranslate.add(this.capture.startPosition) )
        }

        // newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize())
        // newEuler.setFromQuaternion(newQuaternion, "YXZ")
        // newQuaternion.setFromEuler(newEuler)

        // target3D.quaternion.copy( newQuaternion.multiply( this.capture.startQuaternion ) )
        // target3D.scale.copy( newScale.multiply( this.capture.startScale ) )

        if (this.oneHanded.grab) {
          invParentMatrix.getInverse(target3D.parent.matrixWorld)
          newMatrix.multiplyMatrices(hand3D.matrixWorld, this.capture.invPivotMatrix) // determine new hover3D world matrix
          newMatrix.premultiply(invParentMatrix) // convert to a local matrix
          newMatrix.decompose(target3D.position, target3D.quaternion, target3D.scale)
        }
      }
    }
  })(),

  tickTwoHanded: (function() {
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
    const UNIFORM_SCALE = new THREE.Vector3(1,1,1)

    return function twoHanded() {
      const target3D = this.capture.object3D
      if (target3D) {
        const left3D = this.activeSides[0].handEl.object3D
        const right3D = this.activeSides[1].handEl.object3D
        firstPosition.copy(left3D.position)
        secondPosition.copy(right3D.position)
        newHandGap.copy(secondPosition).sub(firstPosition)

        if (this.twoHanded.uniformScale) {
          const scale = newHandGap.length() / this.capture.handGap.length()
          newScale.set(scale, scale, scale)
          target3D.scale.copy( newScale.multiply( this.capture.startScale ) )
        }

        if (this.twoHanded.grab) {
          this.calcMatrixFromHands(newPivot, secondQuaternion, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
          newMatrix.compose(newPivot, secondQuaternion, UNIFORM_SCALE)
  
          invNewMatrix.getInverse(newMatrix)
          newRotationGap.copy(secondPosition).applyMatrix4(invNewMatrix).normalize()
          newQuaternion.setFromUnitVectors(this.capture.startGap, newRotationGap)
          secondQuaternion.multiply( newQuaternion )
          newMatrix.compose(newPivot, secondQuaternion, UNIFORM_SCALE)
          
          newMatrix.multiply( this.capture.invPivotMatrix )
          newMatrix.decompose(newPivot, secondQuaternion, newScale)
  
          target3D.position.copy(newPivot)
          target3D.quaternion.copy(secondQuaternion)
        }
      }
    }
  })(),

  calcMatrixFromHands(outPos, outQuat, handAPos, handAQuat, handBPos, handBQuat) {
    outPos.copy(handAPos).add(handBPos).multiplyScalar(0.5)
    outQuat.copy(handAQuat).slerp(handBQuat, .5)
  },

  parseConstraints(str) {
    let constraint = {}
    let list = str.split(",").map( x => x.trim() )
    for (let item of list) {
      switch (item) {
        case "translate": constraint.translate = true; break
        case "translate-x": constraint.translate = true; constraint.translateX = true; break
        case "translate-y": constraint.translate = true; constraint.translateY = true; break
        case "translate-z": constraint.translate = true; constraint.translateZ = true; break
        case "rotate": constraint.rotate = true; break
        case "rotate-x": constraint.rotate = true; constraint.rotateX = true; break
        case "rotate-y": constraint.rotate = true; constraint.rotateY = true; break
        case "rotate-z": constraint.rotate = true; constraint.rotateZ = true; break
        case "scale": constraint.scale = true; break
        case "scale-x": constraint.scale = true; constraint.scaleX = true; break
        case "scale-y": constraint.scale = true; constraint.scaleY = true; break
        case "scale-z": constraint.scale = true; constraint.scaleZ = true; break
        case "uniformscale": constraint.scale = true; constraint.uniformScale = true; break
        case "grab": constraint.grab = true; break
        default: aframeHelper.warn(this, `unknown constraint: ${item}`)
      }
    }

    return constraint
  },
})