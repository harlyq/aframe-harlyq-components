import { aframeHelper } from "harlyq-helpers"

// @ts-ignore
const radToDeg = THREE.Math.radToDeg
// @ts-ignore
const degToRad = THREE.Math.degToRad
const parseToLowerCase = str => (typeof str === "string") ? str.toLowerCase() : str

AFRAME.registerComponent("tool", {
  dependencies: ["position", "rotation", "scale"],

  schema: {
    debug: { default: false },
    handPosition: { type: "vec3" },
    handRotation: { type: "vec3" },
    handScale: { type: "vec3", default: {x:1, y:1, z:1} },
    usage: { default: "respawnondrop", oneOf: ["respawnOnDrop", "reparentOnEquip", "stayOnDrop"], parse: parseToLowerCase },

    // when we reparent this entity, the component is re-initialized, 
    // so before the reparent we can store the hand entity (see onToolEquip())
    // then on the first update recalculate the hand entity
    hand: { default: "" }
  },

  // this component will be re-initialized when we change it's parent
  init() {
    this.handA = undefined
    this.onToolEquip = this.onToolEquip.bind(this)
    this.onToolDrop = this.onToolDrop.bind(this)
    this.handMatrix = new THREE.Matrix4()
    this.objectMatrixOnEquip = new THREE.Matrix4()
  },

  play() {
    this.el.addEventListener("toolequip", this.onToolEquip)
    this.el.addEventListener("tooldrop", this.onToolDrop)
  },

  pause() {
    this.el.removeEventListener("toolequip", this.onToolEquip)
    this.el.removeEventListener("tooldrop", this.onToolDrop)
  },

  update(oldData) {
    const data = this.data

    if (oldData.handRotation !== data.handRotation || oldData.handPosition !== data.handPosition || oldData.handScale !== data.handScale) {
      const euler = new THREE.Euler().set(degToRad(data.handRotation.x), degToRad(data.handRotation.y), degToRad(data.handRotation.z), "YXZ")
      const quaternion = new THREE.Quaternion().setFromEuler(euler)
      this.handMatrix.compose(data.handPosition, quaternion, data.handScale)
    }

    // if we have a hand, then place the tool into that hand
    if (oldData.hand !== data.hand) {
      this.handA = data.hand ? document.querySelector(data.hand) : undefined
    }
  },

  tick: (function() {
    const newMatrix = new THREE.Matrix4()
    const inverseParentMat = new THREE.Matrix4()

    return function tick() {
      if (!this.handA) {
        this.el.sceneEl.removeBehavior(this)
        return
      }
  
      const data = this.data      
      if (this.handA && data.usage !== "reparentonequip") {
        const object3D = this.el.object3D
        const hand3D = this.handA.object3D

        hand3D.updateMatrixWorld(true)
        object3D.parent.updateMatrixWorld(true)

        // get the inverse each frame in case the parent is moving
        inverseParentMat.getInverse(object3D.parent.matrixWorld)
        newMatrix.copy(this.handMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
        newMatrix.decompose(object3D.position, object3D.quaternion, object3D.scale)
      }
    }
  })(),

  onToolEquip(e) {
    const data = this.data

    this.handA = e.detail.hand
    this.el.setAttribute( "tool", { hand: "#" + e.detail.hand.id } )

    console.log("equipped", aframeHelper.getProperty( this.el, "tool.hand" ) )

    if (data.usage === "reparentonequip") {
      // remember the hand, so after the re-init() we start in that hand
      this.el.setAttribute("position", data.handPosition)
      this.el.setAttribute("rotation", data.handRotation)
      this.el.flushToDOM()
  
      this.handA.appendChild(this.el) // this will force a re-init()

    } else {
      this.objectMatrixOnEquip.copy(this.el.object3D.matrix)
      this.el.sceneEl.addBehavior(this)
    }
  },

  onToolDrop(e) {
    const data = this.data
    const object3D = this.el.object3D

    this.handA = undefined
    this.el.setAttribute( "tool", { hand: "" } )

    if (data.usage === "reparentonequip") {
      const worldPosition = new THREE.Vector3()
      const worldQuaternion = new THREE.Quaternion()
      const worldEuler = new THREE.Euler(0, 0, 0, "YXZ")

      object3D.getWorldPosition(worldPosition)
      object3D.getWorldQuaternion(worldQuaternion)
      worldEuler.setFromQuaternion(worldQuaternion, "YXZ")

      // set components directly because they are re-applied when we reparent
      this.el.setAttribute("position", worldPosition)
      this.el.setAttribute("rotation", `${radToDeg(worldEuler.x)} ${radToDeg(worldEuler.y)} ${radToDeg(worldEuler.z)}`)
      this.el.flushToDOM()

      this.el.sceneEl.appendChild(this.el) // this will force a re-init()

    } else if (data.usage === "respawnondrop") {
      
      this.objectMatrixOnEquip.decompose(object3D.position, object3D.quaternion, object3D.scale)
    }
  },
})

function matrix4ToString(mat4) {
  const m = mat4.elements
  return [m[0].toFixed(2), m[4].toFixed(2), m[8].toFixed(2), m[12].toFixed(2), "\n",
    m[1].toFixed(2), m[5].toFixed(2), m[9].toFixed(2), m[13].toFixed(2), "\n",
    m[2].toFixed(2), m[6].toFixed(2), m[10].toFixed(2), m[14].toFixed(2), "\n",
    m[3].toFixed(2), m[7].toFixed(2), m[11].toFixed(2), m[15].toFixed(2)].join(" ")
}