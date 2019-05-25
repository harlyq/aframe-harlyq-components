import { aframeHelper, attribute, pseudorandom, utils } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "wait-set" component for setting attributes on this or other elements after a delay or event
// 
AFRAME.registerComponent("wait-set", {
  schema: {
    delay: { default: "0" },
    event: { default: "" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
    toggles: { default: "" },
    seed: { type: "int", default: -1 },
    debug: { default: false },
  },
  multiple: true,

  init() {
    this.onEvent = this.onEvent.bind(this)
    this.setProperties = this.setProperties.bind(this)

    this.rules = {}
    this.toggles = []

    this.waitListener = aframeHelper.scopedListener()
    this.waitTimer = aframeHelper.basicTimer()
    this.lcg = pseudorandom.lcg()
  },

  remove() {
    this.waitListener.remove()
    this.waitTimer.stop()
  },

  updateSchema(newData) {
    if (typeof newData !== "object") {
      console.error(`invalid properties, expected format <property>:<value>; '${newData}'`)
    }
    
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
      this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.onEvent)
    }

    if (data.toggles !== oldData.toggles) {
      this.toggles = data.toggles.split(",").map(x => x.trim()).filter(x => x)
    }

    // must be last as the waitTimer may trigger immediately
    if (data.delay !== oldData.delay) {
      this.delay = attribute.parse(data.delay)
      if (data.event === "") {
        this.waitTimer.start( attribute.randomize(this.delay), this.setProperties )
      }
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

  setProperties(event) {
    const elements = this.waitListener.getElementsInScope(this.el, this.data.target, this.data.targetScope, event ? event.target : undefined)

    for (let el of elements) {
      for (let prop in this.rules) {
        let rule = this.rules[prop]

        const value = attribute.stringify( attribute.randomize(rule, this.lcg.random) )
        const processedValue = this.processValue(value, event)
        if (this.data.debug) {
          console.log("wait-set:setProperties", "id=", el.id, "property=", prop, "value=", value, "$event=", event)
        }

        aframeHelper.setProperty(el, prop, processedValue)
      }

      for (let prop of this.toggles) {
        const toggleValue = !aframeHelper.getProperty(el, prop)
        aframeHelper.setProperty(el, prop, toggleValue)
      }
    }
  },

  processValue(value, event) {
    let result = value

    if (value.indexOf("$event") === 0) {
      const parts = value.split(".")
      if (!event) {
        console.log(`value of $event but no event received`)
      } else {
        result = attribute.stringify( utils.getWithPath(event, parts.slice(1)) )
      }
    }

    return result
  },

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onEvent(e) {
    const data = this.data
    const self = this

    if (data.delay && data.delay !== "0") {
      setTimeout( () => self.setProperties(e), attribute.randomize(this.delay)*1000 )
    } else {
      this.setProperties(e)
    }
  },

})

