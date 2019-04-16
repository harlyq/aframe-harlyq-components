// Copyright 2018-2019 harlyq
// MIT license
import { utils, attribute, interpolation, pseudorandom, aframeHelper } from "harlyq-helpers"

const MAX_FRAME_TIME_MS = 100

// Takes a set of keys (from randomRules()), and provides an interpolated value, where r is 0 (first key) to 1 (last key)
// e.g. [[1,2,3],[5,6],[7.5]] @ r = 0.25 becomes [3,4,3]
function lerpKeys(type, keys, r, easingFn = interpolation.Linear) {
  const n = keys.length

  if (r <= 0 || n <= 1) {
    return keys[0]
  } else if (r >= 1) {
    return keys[n - 1]
  }

  const k = r*(n - 1)
  const i = ~~k
  const t = easingFn(k - i)
  switch (type) {
    case "object": return interpolation.lerpObject(keys[i], keys[i+1], t)
    case "vector": return interpolation.lerpArray(keys[i], keys[i+1], t)
    case "number": return interpolation.lerp(keys[i], keys[i+1], t)
    default: return keys[i]
  }
}

// const EPSILON = 1e-4
// console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0)[0] - 1) < EPSILON )
// console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.5)[0] - 2) < EPSILON )
// console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.25)[0] - 1.5) < EPSILON )
// console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.75)[0] - 2.5) < EPSILON )
// console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 1)[0] - 3) < EPSILON )
// console.assert( Math.abs(lerpKeys("vector", [[1,2,3],[4,5,6],[7,8,9]], 0.75)[1] - 6.5) < EPSILON )
// console.assert( Math.abs(lerpKeys("object", [{r:0,g:0,b:0},{r:1,g:1,b:1}], 0.5).r - 0.5) < EPSILON )
// console.assert( lerpKeys("string", ["a","b","c"], 0) === "a" )
// console.assert( lerpKeys("string", ["a","b","c"], 1) === "c" )
// console.assert( lerpKeys("string", ["a","b","c"], 0.25) === "a" )
// console.assert( lerpKeys("string", ["a","b","c"], 0.75) === "b" )


function getPropertyAsString(target, prop) {
  const parts = prop.split(".")
  if (parts.length <= 2) {
    return attribute.stringify(AFRAME.utils.entity.getComponentProperty(target, prop))
  }

  // e.g. object3dmap.mesh.material.uniforms.color
  const path = utils.getWithPath(target, parts)
  if (path) {
    return attribute.stringify(path[prop])
  } else {
    console.warn(`unknown path for getProperty() '${prop}'`)
  }
}


//-----------------------------------------------------------------------------
// "keyframe" component for setting attributes on this element over time
// 
AFRAME.registerComponent("keyframe", {
  schema: {
    duration: { default: 1 },
    direction: { default: "forward", oneOf: ["forward", "backward", "alternate"] },
    loops: { default: -1 },
    seed: { default: -1, type: "int" },
    easing: { default: "linear", oneOf: Object.keys(interpolation.EASING_FUNCTIONS) },
    randomizeEachLoop: { default: true },
  },
  multiple: true,

  init() {
    this.lcg = pseudorandom.lcg()

    this.loopTime = 0 // seconds
    this.loops = 0
    this.keys = {}
    this.rules = {}
  },

  updateSchema(newData) {
    const originalSchema = AFRAME.components[this.name].schema
    let newSchema = {} // everything that has changed from the ORIGINAL schema

    // add new rules
    for (let prop in newData) {
      if (!(prop in originalSchema)) {
        newSchema[prop] = { type: "string" }
      }
    }

    // extend the schema so the new rules appear in the inspector
    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }
  },

  update(oldData) {
    const data = this.data
    const originalSchema = AFRAME.components[this.name].schema

    if (oldData.seed !== data.seed) {
      this.lcg.setSeed(data.seed) // must be updated before other attributes
    }

    // remove old rules and keys
    for (let prop in this.rules) {
      if (!(prop in data)) {
        delete this.rules[prop]
        delete this.keys[prop]
      }
    }

    for (let prop in data) {
      if (oldData[prop] !== data[prop] && !(prop in originalSchema)) {
        const value = data[prop]
        this.rules[prop] = value.split(",").map(attr => attribute.parse(attr))
      }
    }

    if (oldData.duration !== data.duration || oldData.loops !== data.loops) {
      this.loopTime = 0
      this.loops = 0
    }

    if (oldData.direction !== data.direction) {
      this.forward = (data.direction !== "backward")
      this.loopTime = this.forward ? 0 : data.duration
    }

    this.generateKeys(true)
  },

  tick(time, timeDelta) {
    // clamp frame time to make thing simpler when debugging
    const dt = Math.min(timeDelta, MAX_FRAME_TIME_MS)/1000
    this.step(dt)
  },

  step(dt) {
    const data = this.data

    if ((data.loops < 0 || this.loops < data.loops) && data.duration > 0) {
      let looped = false
      this.loopTime = this.loopTime + (this.forward ? dt : -dt)
    
      if (this.loopTime > data.duration || this.loopTime < 0) {
        this.loops++
        looped = true
      }

      if (looped && (data.loops < 0 || this.loops < data.loops)) {
        if (data.direction === "alternate") {
          this.forward = !this.forward
          this.loopTime = this.loopTime < 0 ? -this.loopTime : 2*data.duration - this.loopTime // overshoot goes into the opposite direction
        } else {
          this.loopTime = this.loopTime + (this.forward ? -data.duration : data.duration)
        }

        if (data.randomizeEachLoop) {
          this.generateKeys(false) // no need to resolve missing rules because none should be missing
        }
      }

      const easingFn = interpolation.EASING_FUNCTIONS[data.easing] || interpolation.EASING_FUNCTIONS["linear"]
      
      for (let prop in this.keys) {
        let r = THREE.Math.clamp(this.loopTime/data.duration, 0, 1)
        const value = lerpKeys(this.keyTypes[prop], this.keys[prop], r, easingFn)
        aframeHelper.setProperty(this.el, prop, value)
      }
    }
  },

  generateKeys(resolveMissingRules) {
    let lastKey

    function guessType(thing) {
      if (typeof thing === "object") {
        if (thing.length && typeof thing[0] === "number") {
          return "vector" 
        } else {
          return "object"
        }
      } else {
        return typeof thing
      }
    }

    this.keys = {}
    this.keyTypes = {}

    for (let prop in this.rules) {
      this.keys[prop] = []

      for (let i = 0, n = this.rules[prop].length; i < n; i++) {
        // if moving backwards then the last rule is the first rule executed
        const ruleIndex = this.forward ? i : n - 1 - i
        const rule = this.rules[prop][ruleIndex]

        if (resolveMissingRules) {
          // if we are missing a value, use the last value, or the current value if this is the first rule
          const emptyRange = rule.range && rule.range.includes("")
          const emptyOption = rule.options && rule.options.includes("")
    
          if (emptyRange || emptyOption) {
            // if missing the first rule then replace it with the existing value
            let info = i == 0 ? attribute.parsePart(getPropertyAsString(this.el, prop)) : lastKey
            if (emptyRange) rule.range = rule.range.map(x => x === "" ? info : x)
            if (emptyOption) rule.options = rule.options.map(x => x === "" ? info : x)
          }
        }

        lastKey = attribute.randomize(rule, this.lcg.random)
        this.keys[prop][ruleIndex] = lastKey
        this.keyTypes[prop] = this.keyTypes[prop] || guessType(lastKey)
      }
    }
  },
})