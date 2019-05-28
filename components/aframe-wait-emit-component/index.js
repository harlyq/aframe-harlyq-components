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
  },
  multiple: true,

  init() {
    this.onEvent = this.onEvent.bind(this)
    this.sendEvent = this.sendEvent.bind(this)
    this.sources = []

    this.delayClock = aframeHelper.basicClock()
    this.eventListener = aframeHelper.scopedEvents( this.el, this.onEvent )
  },

  remove() {
    this.eventListener.remove()
    this.waitClock.clearAllTimeouts()
  },

  update(oldData) {
    const data = this.data

    if (data.events !== oldData.events || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.eventListener.set( data.events, data.source, data.sourceScope, data.events )
    }

    // must be last as the waitTimer may trigger immediately
    if (data.delay !== oldData.delay) {
      this.delay = attribute.parse(data.delay)
      if (data.events === "") {
        this.delayClock.startTimer( attribute.randomize(data.delay), this.sendEvent )
      }
    }
  },

  pause() {
    this.eventListener.remove()
    this.delayClock.pause()
  },

  play() {
    this.eventListener.add()
    this.delayClock.resume()
  },

  sendEvent(event) {
    const data = this.data
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

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onEvent( e ) {
    if ( this.data.debug ) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, "onEvent", e.type )
    }

    const self = this
    this.delayClock.startTimer( attribute.randomize(this.delay), () => self.sendEvent(e) )
  },

})
