// Copyright 2018-2019 harlyq
// MIT license

AFRAME.registerComponent("clone-geometry", {
  schema: {
    src: { type: "selector" },
  },

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this) // used for models which may have a delay before loading
  },

  update(oldData) {
    if (this.data.src !== oldData.src) {
      if (oldData instanceof HTMLElement) { oldData.removeEventListener("object3dset", this.onObject3DSet) }

      const template = this.data.src
      if (template instanceof HTMLElement && 'object3D' in template) {
        this.cloneObject3D(template)
        // @ts-ignore
        template.addEventListener("object3dset", this.onObject3DSet)
      }
    }
  },

  onObject3DSet(evt) {
    if (evt.target === this.data.src && evt.detail.type) {
      this.cloneObject3D(this.data.src)
    }
  },

  cloneObject3D(from) {
    const object3D = this.el.object3D
    for (let k in this.el.object3DMap) {
      this.el.removeObject3D(k)
    }
    while (object3D.children.length > 0) {
      object3D.remove(object3D.children[0])
    }

    function getObjectName(obj3D) {
      for (let k in from.object3DMap) {
        if (obj3D === from.object3DMap[k]) {
          return k
        }
      }
      return undefined
    }

    for (let i = 0; i < from.object3D.children.length; i++) {
      const child = from.object3D.children[i]
      const name = getObjectName(child)
      if (name) {
        // if the object is in the aframe object map then add it via aframe
        this.el.setObject3D(name, child.clone())
      } else {
        // otherwise add it via threejs
        object3D.add(child.clone())
      }
    }
  },
})
