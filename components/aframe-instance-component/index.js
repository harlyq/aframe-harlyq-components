import { aframeHelper } from "harlyq-helpers"

AFRAME.registerComponent("instance", {
  schema: {
    src: { type: "selector" },
    color: { type: "color", default: "#fff" },
    dynamic: { default: false },
  },

  init() {
    this.instancePool = undefined
    this.blockIndex = undefined
    this.color = new THREE.Color()
  },

  remove() {
    this.freeInstance()
  },

  update(oldData) {
    const data = this.data

    if (oldData.src !== data.src) {
      const instancePool = data.src.components["instance-pool"]
      if (instancePool) {
        this.freeInstance()
        this.blockIndex = instancePool.reserveBlock(1)
        this.instancePool = instancePool
        if (this.blockIndex === undefined) {
          aframeHelper.warn(`no more instances available`)
        }
      } else {
        aframeHelper.warn(`no 'instance-pool' found on src`)
      }
    } else {
      aframeHelper.error(`missing 'src' on 'instance' component`)
    }

    if (oldData.dynamic !== data.dynamic && data.dynamic) {
      this.el.sceneEl.addBehavior(this) // enable tick
    }

    if (oldData.color !== data.color) {
      this.color.set(data.color)
    }
  },

  tick() {
    this.syncTransform()

    if (!this.data.dynamic) {
      this.el.sceneEl.removeBehavior(this) // need to disable here as it is only setup after the first update
    }
  },

  syncTransform() {
    const i = this.blockIndex
    if (this.instancePool && i !== undefined) {
      let vec = this.el.object3D.position
      this.instancePool.setPositionAt(i, vec.x, vec.y, vec.z)
      vec = this.el.object3D.quaternion
      this.instancePool.setQuaternionAt(i, vec.x, vec.y, vec.z, vec.w)
      vec = this.el.object3D.scale
      this.instancePool.setScaleAt(i, vec.x, vec.y, vec.z)
      const col = this.color
      this.instancePool.setColorAt(i, col.r, col.g, col.b)
    }
  },

  freeInstance() {
    if (this.instancePool && this.blockIndex !== undefined) {
      this.instancePool.releaseBlock(this.blockIndex)
    }
    this.instancePool = undefined
    this.blockIndex = undefined
  }
})

AFRAME.registerPrimitive("a-instance", {
  defaultComponents: { instance: {} },
  mappings: { src: "instance.src", color: "instance.color", dynamic: "instance.dynamic" },
})