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
    for (let k in this.el.object3DMap) {
      this.el.removeObject3D(k)
    }
    for (let k in from.object3DMap) {
      this.el.setObject3D(k, from.getObject3D(k).clone())
    }
  },
})
