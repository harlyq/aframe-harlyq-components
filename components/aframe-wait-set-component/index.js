// Copyright 2018-2019 harlyq
// MIT license
import { aframeHelper, attribute, pseudorandom } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "wait-set" component for setting attributes on this or other elements after a delay or event
// 
AFRAME.registerComponent("wait-set", {
  schema: {
    delay: { default: 0 },
    event: { default: "" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
    seed: { type: "int", default: -1 },
  },
  multiple: true,

  init() {
    this.setProperties = this.setProperties.bind(this)
    this.startDelay = this.startDelay.bind(this)

    this.eventTargetEl = undefined
    this.rules = {}
    this.sources = []

    this.waitListener = aframeHelper.scopedListener()
    this.waitTimer = aframeHelper.basicTimer()
    this.lcg = pseudorandom.lcg()
  },

  remove() {
    this.waitListener.remove()
    this.waitTimer.stop()
  },

  updateSchema(newData) {
    const originalSchema = AFRAME.components[this.name].schema
    let newSchema = {}

    for (let prop in newData) {
      if (!(prop in originalSchema)) {
        newSchema[prop] = { default: "" }
      }
    }

    // extend the schema so the new rules appear in the inspector
    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }
  },

  update(oldData) {
    const originalSchema = AFRAME.components[this.name].schema
    const data = this.data

    if (data.seed !== oldData.seed) {
      this.lcg.setSeed(data.seed)
    }

    for (let prop in this.rules) {
      if (!(prop in data)) {
        delete this.rules[prop] // property is no longer present
      }
    }

    for (let prop in data) {
      if (!(prop in originalSchema) && data[prop] !== oldData[prop]) {
        this.rules[prop] = attribute.parse(data[prop])
      }
    }

    if (data.event !== oldData.event || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.startDelay)
    }

    if (data.delay !== oldData.delay && (this.delayTimer || data.event === "")) {
      this.startDelay()
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
    // console.log("wait-set:startDelay", e.target.id, this.data.event)
    this.eventTargetEl = e ? e.target : undefined
    this.waitTimer.start(this.data.delay, this.setProperties)
  },

  setProperties() {
    const elements = this.waitListener.getElementsInScope(this.el, this.data.target, this.data.targetScope, this.eventTargetEl)

    for (let el of elements) {
      for (let prop in this.rules) {
        let rule = this.rules[prop]

        const value = attribute.stringify( attribute.randomize(rule, this.lcg.random) )
        // console.log("wait-set:setProperties", el.id, prop, value)
        aframeHelper.setProperty(el, prop, value)
      }
    }
  },
})