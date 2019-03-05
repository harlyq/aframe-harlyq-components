// Copyright 2018-2019 harlyq
// MIT license
import BasicTimer from "./basic-timer"
import ScopedListener from "./scoped-listener"

//-----------------------------------------------------------------------------
// "wait-emit" component for emitting events on this or other elements after a delay or event
// 
AFRAME.registerComponent("wait-emit", {
  schema: {
    "event": { default: "" },
    "delay": { default: 0 },
    "source": { default: "" },
    "sourceScope": { default: "document", oneOf: ["parent", "self", "document"] },
    "out": { default: "" },
    "target": { default: "" },
    "targetScope": { default: "document", oneOf: ["parent", "self", "document"] },
  },
  multiple: true,

  init() {
    this.sendEvent = this.sendEvent.bind(this)
    this.startTimer = this.startTimer.bind(this)
    this.onEvent = this.onEvent.bind(this)
    this.sources = []

    this.waitTimer = BasicTimer()
    this.waitListener = ScopedListener()
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

    if (data.delay !== oldData.delay && (this.sendwaitTimer || data.event === "")) {
      this.waitTimer.start(data.delay, this.sendEvent)
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

  onEvent() {
    this.waitTimer.start(this.data.delay, this.sendEvent)
  },

  sendEvent(evt) {
    const data = this.data
    const targets = this.waitListener.getElementsInScope(this.el, data.target, data.targetScope)
    const eventData = Object.assign({ source: this.el }, evt)
    const event = data.out ? data.out : data.event

    for (let target of targets) {
      target.emit(event, eventData)
    }
  },

})
