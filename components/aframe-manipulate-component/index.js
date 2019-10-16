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
      pivotPos: new THREE.Vector3(),
      pivotQuat: new THREE.Quaternion(),
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
    const invHandMatrix = new THREE.Matrix4()
    const UNIFORM_SCALE = new THREE.Vector3(1,1,1)

    return function captureStartPositions() {
      const data = this.data
      const target3D = data.target ? data.target.object3D : this.el.object3D
      this.capture.object3D = target3D

      if (target3D) {

        for (let side of this.activeSides) {
          side.handEl.object3D.getWorldPosition( side.grabPosition )
        }

        target3D.updateMatrixWorld()
        this.capture.startWorldPosition.copy( data.pivot ).applyMatrix4( target3D.matrixWorld )

        this.capture.startPosition.copy(target3D.position)
        this.capture.startQuaternion.copy(target3D.quaternion)
        this.capture.startScale.copy(target3D.scale)

        const numActiveSides = this.activeSides.length

        if (numActiveSides >= 2) {
          const left3D = this.activeSides[0].handEl.object3D
          const right3D = this.activeSides[1].handEl.object3D
          this.capture.handGap.copy(right3D.position).sub(left3D.position)
          this.calcMatrixFromHands(this.capture.pivotPos, this.capture.pivotQuat, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
          invHandMatrix.compose( this.capture.pivotPos, this.capture.pivotQuat, UNIFORM_SCALE )
          invHandMatrix.getInverse( invHandMatrix )
          this.capture.startGap.copy(right3D.position).applyMatrix4(invHandMatrix).normalize()
          this.capture.invPivotMatrix.copy(invHandMatrix).multiply(target3D.matrix)

        } else if (numActiveSides === 1) {
          const hand3D = this.activeSides[0].handEl.object3D
          // hand3D.updateMatrixWorld() 
          this.capture.invPivotMatrix.getInverse(hand3D.matrixWorld).multiply(target3D.matrixWorld)
        }
      } else {
        aframeHelper.warn(`unable to find Object3D for '${data.target}'`)
      }
    }
  
  })(),

  tickOneHanded: (function() {
    const newTranslate = new THREE.Vector3()
    const startGap = new THREE.Vector3()
    const newGap = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    const newQuaternion = new THREE.Quaternion()
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
          target3D.scale.copy( newScale.multiply(this.capture.startScale) )
        }
        
        if (this.oneHanded.scale) {
          newScale.copy(newGap).divide(startGap)
          this.applyMask(newScale, this.oneHanded.scale, 1)
          target3D.scale.copy( newScale.multiply(this.capture.startScale) )
        }

        if (this.oneHanded.translate) {
          hand3D.getWorldPosition(newTranslate).sub(side.grabPosition)
          this.applyMask(newTranslate, this.oneHanded.translate, 0)
          target3D.position.copy( newTranslate.add(this.capture.startPosition) )
        }

        if (this.oneHanded.rotate) {
          this.applyMask(startGap, this.oneHanded.rotate, 0)
          this.applyMask(newGap, this.oneHanded.rotate, 0)
          newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize())
          target3D.quaternion.copy( newQuaternion.multiply(this.capture.startQuaternion) )
        }

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
    const newGap = new THREE.Vector3()
    const startGap = new THREE.Vector3()
    const newRotationGap = new THREE.Vector3()
    const pivotPosition = new THREE.Vector3()
    const newScale = new THREE.Vector3(1,1,1)
    const newTranslate = new THREE.Vector3()
    const newQuaternion = new THREE.Quaternion()
    const newMatrix = new THREE.Matrix4()
    const pivotQuaternion = new THREE.Quaternion()
    const invNewMatrix = new THREE.Matrix4()
    const UNIFORM_SCALE = new THREE.Vector3(1,1,1)

    return function twoHanded() {
      const target3D = this.capture.object3D
      if (target3D) {
        const left3D = this.activeSides[0].handEl.object3D
        const right3D = this.activeSides[1].handEl.object3D
        firstPosition.copy(left3D.position)
        secondPosition.copy(right3D.position)
        newGap.copy(secondPosition).sub(firstPosition)

        this.calcMatrixFromHands(pivotPosition, pivotQuaternion, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion)
        newMatrix.compose(pivotPosition, pivotQuaternion, UNIFORM_SCALE)

        if (this.twoHanded.uniformScale) {
          const scale = newGap.length() / this.capture.handGap.length()
          newScale.set(scale, scale, scale)
          target3D.scale.copy( newScale.multiply(this.capture.startScale) )
        }
        
        if (this.twoHanded.scale) {
          newScale.copy(newGap).divide(this.capture.handGap)
          this.applyMask(newScale, this.twoHanded.scale, 1)
          target3D.scale.copy( newScale.multiply(this.capture.startScale) )
        }

        if (this.twoHanded.translate) {
          newTranslate.copy(pivotPosition).sub(this.capture.pivotPos)
          this.applyMask(newTranslate, this.twoHanded.translate, 0)
          target3D.position.copy( newTranslate.add(this.capture.startPosition) )
        }

        if (this.twoHanded.rotate) {
          startGap.copy(this.capture.handGap)
          this.applyMask(startGap, this.twoHanded.rotate, 0)
          this.applyMask(newGap, this.twoHanded.rotate, 0)
          newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize())
          target3D.quaternion.copy( newQuaternion.multiply(this.capture.startQuaternion) )
        }

        if (this.twoHanded.grab) {  
          invNewMatrix.getInverse(newMatrix)
          newRotationGap.copy(secondPosition).applyMatrix4(invNewMatrix).normalize()
          newQuaternion.setFromUnitVectors(this.capture.startGap, newRotationGap)
          pivotQuaternion.multiply( newQuaternion )
          newMatrix.compose(pivotPosition, pivotQuaternion, UNIFORM_SCALE)
          
          newMatrix.multiply( this.capture.invPivotMatrix )
          newMatrix.decompose(pivotPosition, pivotQuaternion, newScale)
  
          target3D.position.copy(pivotPosition)
          target3D.quaternion.copy(pivotQuaternion)
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
        case "translate": constraint.translate = {x:true, y:true, z:true}; break
        case "translate-x": constraint.translate = {...constraint.translate, x:true}; break // keep the axis we want to move along
        case "translate-y": constraint.translate = {...constraint.translate, y:true}; break
        case "translate-z": constraint.translate = {...constraint.translate, z:true}; break
        case "rotate": constraint.rotate = {x:true, y:true, z:true}; break
        case "rotate-x": constraint.rotate = {x:false, y:true, z:true}; break // drop the axis we want to rotate about
        case "rotate-y": constraint.rotate = {x:true, y:false, z:true}; break
        case "rotate-z": constraint.rotate = {x:true, y:true, z:false}; break
        case "scale": constraint.scale = {x:true, y:true, z:true}; break
        case "scale-x": constraint.scale = {...constraint.scale, x:true}; break
        case "scale-y": constraint.scale = {...constraint.scale, y:true}; break
        case "scale-z": constraint.scale = {...constraint.scale, z:true}; break
        case "uniformscale": constraint.uniformScale = true; break
        case "grab": constraint.grab = true; break
        case "": break
        case "none": break
        default: aframeHelper.warn(this, `unknown constraint: ${item}`)
      }
    }

    return constraint
  },

  applyMask(vector, mask, unmaskedValue) {
    for (let axis of ["x","y","z"]) {
      vector[axis] = mask[axis] ? vector[axis] : unmaskedValue
    }
  },
})