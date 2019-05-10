import { aframeHelper } from "harlyq-helpers"


// PAUSING DOESN'T REALLY WORK
// Only an entity can pause on startup, not an initial component. Pause is used by the Inspector

AFRAME.registerComponent("wait-play", {
  schema: {
    event: { default: "" },
    delay: { default: 0 },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
    components: { type: "array", default: [] },
    initial: { default: "pause", oneOf: ["pause", "play"]},
    action: { default: "play", oneOf: ["pause", "play", "toggle"]},
    debug: { default: false },
  },

  init() {
    this.onEvent = this.onEvent.bind(this)
    this.playStopToggle = this.playStopToggle.bind(this)

    this.waitListener = aframeHelper.scopedListener()
    this.waitTimer = aframeHelper.basicTimer()

    this.playStopToggle(this.data.initial) // does not work!
  },

  remove()
  {
    this.waitListener.remove()
    this.waitTimer.stop()
  },

  update(oldData) {
    const data = this.data

    if (data.event !== oldData.event || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.onEvent)
    }

    if (data.delay !== oldData.delay && data.event === "") {
      this.waitTimer.start(this.data.delay, this.playStopToggle)
    }
  },

  pause() {
    this.waitListener.remove()
    this.waitTimer.pause()
  },

  play() {
    this.waitTimer.resume()
    this.waitListener.add()    
  },

  startDelay(e) {
    const self = this
    this.waitTimer.start(this.data.delay, () => self.playStopToggle(self.data.action))
  },

  playStopToggle(action, event) {
    const data = this.data
    const elements = this.waitListener.getElementsInScope(this.el, this.data.target, this.data.targetScope, event ? event.target : undefined)
    const self = this

    function applyAction(component) {
      switch (action) {
        case "play":
          self.playComponent(component);
          break
        case "pause":
          self.pauseComponent(component);
          break
        case "toggle":
          if (component.isPlaying) {
            self.pauseComponent(component);
          } else {
            self.playComponent(component);
          }
          break
      }
    }

    for (let el of elements) {
      if (el.components) {
        for (let name of data.components) {
          for (let fullname in el.components) {
            if (name === fullname || name === fullname.split("__")) {
              applyAction(el.components[fullname])
            }
          }
        }
      }
    }
  },

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onEvent(e) {
    const data = this.data
    const self = this

    if (data.delay > 0) {
      setTimeout(() => self.playStopToggle(data.action, e), data.delay*1000)
    } else {
      this.playStopToggle(data.action, e)
    }
  },

  playComponent(component) {
    if (this.data.debug) {
      console.log("playing", component.el.id, component.attrName)
    }
    component.play()
  },

  pauseComponent(component) {
    if (this.data.debug) {
      console.log("pausing", component.el.id, component.attrName)
    }
    component.pause()
  }
})