import { aframeHelper, attribute, domHelper } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "wait-emit" component for emitting events on this or other elements after a delay or event
// 
AFRAME.registerComponent("wait-emit", {
  schema: {
    events: { default: "" },
    delay: { default: "0" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    out: { default: "" },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
    bubbles: { default: false },
    debug: { default: false },
    enabled: { default: true },
  },
  multiple: true,

  init() {
    this.sources = []

    this.delayedEventHandler = aframeHelper.delayedEventHandler( this.el, this.sendEvent.bind(this) )
  },

  remove() {
    this.delayedEventHandler.remove()
  },

  update(oldData) {
    const data = this.data

    if (data.delay !== oldData.delay) {
      this.delay = attribute.parse(data.delay)
    }

    if (data.events !== oldData.events || data.sourceScope !== oldData.sourceScope || data.source !== oldData.source || data.enabled !== oldData.enabled) {
      this.delayedEventHandler.update(data.events, data.sourceScope, data.source, () => attribute.randomize(this.delay), data.enabled)
    }
  },

  pause() {
    this.delayedEventHandler.pause()
  },

  play() {
    this.delayedEventHandler.play()
  },

  sendEvent(event) {
    const data = this.data
    if (data.debug) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, event ? `received ${event.type}` : "no event")
    }

    const targets = aframeHelper.getElementsInScope(this.el, data.target, data.targetScope, event ? event.target : undefined)
    const eventData = Object.assign(event, { source: this.el })
    const name = data.out ? data.out : data.event
    const bubbles = this.data.bubbles

    for (let target of targets) {
      if ( this.data.debug ) {
        console.log( domHelper.getDebugName( target ), this.attrName, "send", name, eventData, bubbles )
      }

      target.emit(name, eventData, bubbles)
    }
  },

})

