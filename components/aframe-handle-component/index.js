import { domHelper } from "harlyq-helpers"

AFRAME.registerComponent( "handle", {
  schema: {
    target: { default: "parent" },
    debug: { default: false },
  },

  events: {
    "grabstart": function ( e ) { this.onGrabStart( e ) },
    "grabend": function ( e ) { this.onGrabEnd( e ) },
  },

  init() {
    this.onGrabStart = this.onGrabStart.bind( this )
    this.onGrabEnd = this.onGrabEnd.bind( this )
    this.grabHand = undefined
    this.invHandMatrix = new THREE.Matrix4()
  },

  tick() {
    if ( !this.grabHand ) {
      this.el.sceneEl.removeBehavior( this )
      return
    }

    this.repositionTarget()
  },

  repositionTarget: ( function () {
    const newMatrix = new THREE.Matrix4()
    const inverseParentMat = new THREE.Matrix4()
    const ignoreScale = new THREE.Vector3()

    return function repositionTarget() {
      const target3D = this.getTargetObject3D( this.data.target )
      if ( !target3D ) {
        return
      }
  
      const hand3D = this.grabHand.object3D
      hand3D.updateMatrixWorld()
      target3D.updateMatrixWorld()
  
      inverseParentMat.getInverse(target3D.parent.matrixWorld) // in case the parent is moving
      newMatrix.copy(this.invHandMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
      // newMatrix.copy(this.handMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
      // newMatrix.copy(hand3D.matrixWorld).premultiply(inverseParentMat)
      newMatrix.decompose(target3D.position, target3D.quaternion, ignoreScale)
    }

  })(),
  
  getTargetObject3D( target ) {
    switch ( target ) {
      case "self": return this.el.object3D
      case "parent": return this.el.object3D.parent
      default: 
        const el = document.querySelector( this.data.target )
        return el ? el.object3D : undefined
    }
  },

  onGrabStart( e ) {
    if ( this.data.debug ) {
      console.log( domHelper.getDebugName( this.el ), "onGrabStart", domHelper.getDebugName( e.detail.hand ) )
    }

    this.grabHand = e.detail.hand
    this.el.sceneEl.addBehavior( this ) // start tick()

    const target3D = this.getTargetObject3D( this.data.target )

    if (target3D) {
      const hand3D = this.grabHand.object3D
      hand3D.updateMatrixWorld()
      target3D.updateMatrixWorld()
      this.invHandMatrix.getInverse( hand3D.matrixWorld ).multiply( target3D.matrixWorld )
    }
  },

  onGrabEnd( e ) {
    if ( this.data.debug ) {
      console.log( domHelper.getDebugName( this.el ), "onGrabEnd", domHelper.getDebugName( e.detail.hand ) )
    }

    if ( this.grabHand === e.detail.hand ) {
      this.grabHand = undefined
    }
  },

} )
