import { aframeHelper, attribute } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "wait-emit" component for emitting events on this or other elements after a delay or event
// 
AFRAME.registerComponent("wait-emit", {
  schema: {
    event: { default: "" },
    delay: { default: "0" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    out: { default: "" },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
  },
  multiple: true,

  init() {
    this.onEvent = this.onEvent.bind(this)
    this.sendEvent = this.sendEvent.bind(this)
    this.sources = []

    this.waitTimer = aframeHelper.basicTimer()
    this.waitListener = aframeHelper.scopedListener()
  },

  remove() {
    this.waitListener.remove()
    this.waitTimer.stop()
  },

  update(oldData) {
    const data = this.data

    if (data.event !== oldData.event || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.onEvent)
    }

    // must be last as the waitTimer may trigger immediately
    if (data.delay !== oldData.delay) {
      this.delay = attribute.parse(data.delay)
      if (data.event === "") {
        this.waitTimer.start( attribute.randomize(data.delay), this.sendEvent )
      }
    }
  },

  pause() {
    this.waitListener.remove()
    this.waitTimer.pause()
  },

  play() {
    this.waitListener.add()
    this.waitTimer.resume()
  },

  sendEvent(event) {
    const data = this.data
    const targets = this.waitListener.getElementsInScope(this.el, data.target, data.targetScope, event ? event.target : undefined)
    const eventData = Object.assign(event, { source: this.el })
    const name = data.out ? data.out : data.event

    for (let target of targets) {
      target.emit(name, eventData)
    }
  },

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onEvent(e) {
    const data = this.data
    const self = this

    if (data.delay && data.delay !== "0") {
      setTimeout( () => self.sendEvent(e), attribute.randomize(this.delay)*1000 )
    } else {
      this.sendEvent(e)
    }
  },

})
