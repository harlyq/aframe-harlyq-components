import { aframeHelper, attribute, domHelper, jsonHelper, pseudorandom } from "harlyq-helpers"

//-----------------------------------------------------------------------------
// "modifier" component for setting attributes on this or other elements after 
// a startEvent, and removing the setting after an endEvent
// 
AFRAME.registerComponent("modifier", {
  schema: {
    startEvents: { default: "" },
    endEvents: { default: "" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
    // toggles: { default: "" },
    seed: { type: "int", default: -1 },
    debug: { default: false },
  },
  multiple: true,

  init() {
    this.onStartEvent = this.onStartEvent.bind(this)
    this.onEndEvent = this.onEndEvent.bind(this)
    this.setProperties = this.setProperties.bind(this)

    this.rules = {}
    // this.toggles = []

    this.startEventListener = aframeHelper.scopedEvents( this.el, this.onStartEvent )
    this.endEventListener = aframeHelper.scopedEvents( this.el, this.onEndEvent )
    this.lcg = pseudorandom.lcg()
  },

  remove() {
    this.startEventListener.remove()
    this.endEventListener.remove()
  },

  updateSchema(newData) {
    if (typeof newData !== "object") {
      aframeHelper.error(this, `invalid properties, expected format <property>:<value>; '${newData}'`)
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
        this.rules[prop] = attribute.parse(data[prop]) // property new or changed
      }
    }

    if (data.startEvents !== oldData.startEvents || data.endEvents !== oldData.endEvents || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
      this.startEventListener.set( data.startEvents, data.source, data.sourceScope )
      this.endEventListener.set( data.endEvents, data.source, data.sourceScope )
    }

    // if (data.toggles !== oldData.toggles) {
    //   this.toggles = data.toggles.split(",").map(x => x.trim()).filter(x => x)
    // }
  },

  pause() {
    this.startEventListener.remove()
    this.endEventListener.remove()
  },

  play() {
    this.startEventListener.add()
    this.endEventListener.add()
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

        // aframeHelper.setProperty(el, prop, processedValue)
        modifiers.addModifier(this, el, prop, processedValue)
      }

      // for (let prop of this.toggles) {
      //   const toggleValue = !aframeHelper.getProperty(el, prop)
      //   aframeHelper.setProperty(el, prop, toggleValue)
      // }
    }
  },

  clearProperties(event) {
    const target = substitute$( this.data.target, this.el, event )
    const elements = aframeHelper.getElementsInScope(this.el, target, this.data.targetScope, event ? event.target : undefined)

    if (this.data.debug) {
      console.log( domHelper.getDebugName( this.el ), this.attrName, "clearProperties", "target=", target )
    }

    for (let el of elements) {
      for (let prop in this.rules) {
        modifiers.removeModifier(this, el, prop)
      }
    }
  },

  // there may be several events "pending" at the same time, so use a separate timer for each event
  onStartEvent(event) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onStartEvent", event.type, event )
    }
    this.setProperties(event)
  },

  onEndEvent(event) {
    if (this.data.debug) {
      console.log( domHelper.getDebugName(this.el), this.attrName, "onEndEvent", event.type, event )
    }
    this.clearProperties(event)
  }

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
      result = attribute.stringify( jsonHelper.getWithPath( event, value.slice( 6 ).split( "." ) ) ) // event. => 6 characters
    }
  } else {
    result = attribute.stringify( aframeHelper.getProperty( el, value.slice( 1 ) ) )
  }

  return result
}

const modifiers = (function() {
  const map = new Map()
  const INITIAL = Symbol('initial')

  function addModifier(source, target, attribute, value) {
    if (!map.has(target)) {
      map.set(target, [])
    }
    const list = map.get(target)
    if ( findAttributeIndex(list, attribute) === -1 ) {
      list.push( { source: INITIAL, attribute, value: aframeHelper.getProperty(target, attribute) } )
    }
    list.push( {source, attribute, value} )
    aframeHelper.setProperty(target, attribute, value)
  }
  
  function removeModifier(source, target, attribute) {
    if (map.has(target)) {
      const list = map.get(target)
      const index = list.findIndex( item => item.attribute === attribute && item.source === source )
      if (index !== -1) {
        list.splice(index, 1)
        const nextIndex = findAttributeIndex(list, attribute)
        if (nextIndex !== -1) {
          aframeHelper.setProperty(target, attribute, list[nextIndex].value)
          if (list[nextIndex].source === INITIAL) {
            list.splice(nextIndex, 1)
          }
        }
      }
    }
  }
  
  function findAttributeIndex(list, attribute) {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i]
      if (item.attribute === attribute) {
        return i
      }
    }
    return -1
  }

  return {
    addModifier,
    removeModifier,
  }
})()
