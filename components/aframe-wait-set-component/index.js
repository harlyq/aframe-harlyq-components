import { aframeHelper, attribute, domHelper, jsonHelper, pseudorandom } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "wait-set" component for setting attributes on this or other elements after a delay or events
// 
AFRAME.registerComponent("wait-set", {
  schema: {
    delay: { default: "0" },
    events: { default: "" },
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

    this.eventListener = aframeHelper.scopedEvents( this.el, this.onEvent )
    this.delayClock = aframeHelper.basicClock()
    this.lcg = pseudorandom.lcg()
  },

  remove() {
    this.eventListener.remove()
    this.delayClock.clearAllTimers()
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

    if (data.events !== oldData.events || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.eventListener.set( data.events, data.source, data.sourceScope )
    }

    if (data.toggles !== oldData.toggles) {
      this.toggles = data.toggles.split(",").map(x => x.trim()).filter(x => x)
    }

    // must be last as the waitTimer may trigger immediately
    if (data.delay !== oldData.delay) {
      this.delay = attribute.parse(data.delay)
      if (data.events === "") {
        this.delayClock.startTimer( attribute.randomize(this.delay), this.setProperties )
      }
    }
  },

  pause() {
    this.eventListener.remove()
    this.delayClock.pause()
  },

  play() {
    this.delayClock.resume()
    this.eventListener.add()
  },

  setProperties(event) {
    const target = substitute$( this.data.target, this.el, event )
    const elements = aframeHelper.getElementsInScope(this.el, target, this.data.targetScope, event ? event.target : undefined)

    if (this.data.debug) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, "setProperties", "target=", target )
    }

    for (let el of elements) {
      for (let prop in this.rules) {
        let rule = this.rules[prop]

        const value = attribute.stringify( attribute.randomize(rule, this.lcg.random) )
        const processedValue = substitute$( value, this.el, event )
        if (this.data.debug) {
          console.log( domHelper.getDebugName( this.el ), this.attrName, "setProperties", "element=", domHelper.getDebugName(el), "property=", prop, "value=", value, "$event=", event)
        }

        aframeHelper.setProperty(el, prop, processedValue)
      }

      for (let prop of this.toggles) {
        const toggleValue = !aframeHelper.getProperty(el, prop)
        aframeHelper.setProperty(el, prop, toggleValue)
      }
    }
  },

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onEvent(e) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onEvent", e.type, e )
    }
    const self = this
    this.delayClock.startTimer( attribute.randomize(this.delay), () => self.setProperties(e) )
  },

})

function substitute$( str, el, event ) {
  return str.replace(/\$([\.\w]+)/g, (_, p1) => processValue( p1, el, event ) )
}

function processValue( value, el, event ) {
  let result = value

  if ( value.indexOf( "event" ) === 0 ) {
    if ( !event ) {
      console.log( `value of $event but no event received` )
    } else {
      result = attribute.stringify( jsonHelper.getWithPath( event, value.slice( 6 ).split( "." ) ) )
    }
  } else {
    result = attribute.stringify( aframeHelper.getProperty( el, value.slice( 1 ) ) )
  }

  return result
}



