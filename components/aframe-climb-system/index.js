import { overlap, threeHelper } from "harlyq-helpers"

function volume(ext) {
  return (ext.max.x - ext.min.x)*(ext.max.y - ext.min.y)*(ext.max.z - ext.min.z)
}

AFRAME.registerSystem("climb", {
  schema: {
    left: { type: "selector" },
    right: { type: "selector" },
    startEvent: { default: "triggerdown" },
    endEvent: { default: "triggerup"},
    cameraRig: { type: "selector" },
    enable: { default: true },
    climbables: { default: "" },
    debug: { default: false },
  },

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)

    this.climbables = []
    this.isEnabled = false
    this.grab = { hand: undefined, target: undefined, position: new THREE.Vector3() }
  },

  update(oldData) {
    const data = this.data

    this.grab.hand = undefined

    if (oldData.startEvent !== data.startEvent || oldData.endEvent !== data.endEvent) {
      if (this.isEnabled) {
        this.disable()
        this.enable()
      }
    }

    if (oldData.climbables !== data.climbables) {
      this.climbables = data.climbables ? document.querySelectorAll(data.climbables) : []
    }

    if (oldData.enable !== data.enable) {
      if (data.enable) {
        this.enable()
      } else {
        this.disable()
      }
    }
  },

  tick: (function() {
    let deltaPosition = new THREE.Vector3()

    return function tick() {
      if (this.grab.hand && this.grab.target) {
        const data = this.data
        const rig = data.cameraRig ? data.cameraRig.object3D : undefined
    
        if (rig) {
          this.grab.hand.object3D.getWorldPosition(deltaPosition).sub(this.grab.position)
          rig.position.sub(deltaPosition)
        }
      }
    }
  })(),

  play() {
    if (this.data.enable) {
      this.enable()
    }
  },

  pause() {
    this.disable()
  },

  enable() {
    if (!this.isEnabled) {
      this.addListeners(this.data.left)
      this.addListeners(this.data.right)
      this.isEnabled = true
    }
  },

  disable() {
    if (this.isEnabled) {
      this.grab.hand = undefined
      this.removeListeners(this.data.left)
      this.removeListeners(this.data.right)
      this.isEnabled = false
    }
  },

  onStartEvent(e) {
    const data = this.data
    if (e.target == data.left) {
      this.attemptGrab(data.left)
    } else if (e.target == data.right) {
      this.attemptGrab(data.right)
    }
  },

  onEndEvent(e) {
    if (e.target == this.grab.hand) {
      this.grab.hand = undefined
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

  attemptGrab: (function () {
    const tempA = new THREE.Vector3()
    const handSphereWorld = new THREE.Vector3()

    return function attemptGrab(hand) {
      const hand3D = hand.object3D
      if (!hand3D) {
        return
      }
  
      if (!hand3D.boundingSphere || hand3D.boundingSphere.empty()) {
        this.generateBoundingBox(hand3D, this.data.debug)
      }

      handSphereWorld.copy(hand3D.boundingSphere.center).applyMatrix4(hand3D.matrixWorld)
      // console.log("handSphereWorld", handSphereWorld.x, handSphereWorld.y, handSphereWorld.z)
  
      const handSphere = hand3D.boundingSphere
      let grabbed = undefined
      let minScore = Number.MAX_VALUE
  
      for (let climbable of this.climbables) {
        // console.log("attemptGrab", climbable.id)
        const climbable3D = climbable.object3D
  
        if (!climbable3D.boundingSphere || climbable3D.boundingSphere.empty()) {
          // console.log("attemptGrab no sphere")
          this.generateBoundingBox(climbable3D, this.data.debug)
        }
  
        tempA.copy(climbable3D.boundingSphere.center).applyMatrix4(climbable3D.matrixWorld)
        
        if (tempA.distanceTo(handSphereWorld) > climbable3D.boundingSphere.radius + handSphere.radius) {
          // console.log("attemptGrab too far sphere")
          continue // spheres not overlapping
        }
  
        if (!overlap.sphereWithBox(handSphereWorld, handSphere.radius, climbable3D.boundingBox.min, climbable3D.boundingBox.max, climbable3D.position, climbable3D.quaternion, climbable3D.scale)) {
          // console.log("attemptGrab too far box")
          continue
        }
  
        const score = volume(climbable3D.boundingBox)
        if (score < minScore) {
          minScore = score // the smallest volume wins
          grabbed = climbable
        }
      }
  
      if (grabbed) {
        // console.log("grabbed", hand3D.el.id, grabbed.id)
        this.grab.hand = hand3D.el
        this.grab.target = grabbed
        this.grab.hand.object3D.getWorldPosition(this.grab.position)
      }
    }
  
  })(),

  generateBoundingBox(obj3D, showDebug = false) {
    // cache boundingBox and boundingSphere
    obj3D.boundingBox = obj3D.boundingBox || new THREE.Box3()
    obj3D.boundingSphere = obj3D.boundingSphere || new THREE.Sphere()
    threeHelper.setFromObject3D(obj3D.boundingBox, obj3D)

    if (!obj3D.boundingBox.isEmpty()) {
      obj3D.boundingBox.getBoundingSphere(obj3D.boundingSphere)

      if (showDebug) {
        obj3D.boundingBoxDebug = new THREE.Box3Helper(obj3D.boundingBox)
        obj3D.boundingBoxDebug.name = "simpleHandsDebug"
        obj3D.add(obj3D.boundingBoxDebug)
      }
    }
  },

})

