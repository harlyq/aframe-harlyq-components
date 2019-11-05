AFRAME.registerComponent("toy", {
  init() {
    const system = this.el.sceneEl.systems["grab-system"]
    system.registerTarget(this.el)
  },

  remove() {
    const system = this.el.sceneEl.systems["grab-system"]
    system.unregisterTarget(this.el)
  },
})
