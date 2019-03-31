// Copyright 2018-2019 harlyq
// MIT license

AFRAME.registerComponent("clone-geo", {
  schema: {
    type: "selector",
  },

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this) // used for models which may have a delay before loading
  },

  update(oldData) {
    if (this.data !== oldData) {
      if (oldData instanceof HTMLElement) { oldData.removeEventListener("object3dset", this.onObject3DSet) }

      const template = this.data
      if (template instanceof HTMLElement && template.object3D) {
        template.object3D.children.forEach(a => this.el.object3D.add(a.clone()))
        this.el.object3DMap = template.object3DMap
        template.addEventListener("object3dset", this.onObject3DSet)
      }
    }
  },

  // TODO this wont work, we need to clone, not set a reference
  onObject3DSet(evt) {
    const template = this.data
    if (evt.target === template && evt.detail.type) {
      this.el.setObject3D(evt.detail.type, template.getObject3D(evt.detail.type))
    }
  }
})
