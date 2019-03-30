// Copyright 2018-2019 harlyq
// MIT license
import ScopedListener from "./scoped-listener.mjs"
import BasicTimer from "./basic-timer.mjs"
import BasicRandom from "./basic-random.mjs"
import {parseValue, setProperty} from "./aframe-utils.mjs"
// import {deepEqual} from "./aframe-utils"

function trim(str) {
  return str.trim()
}

// console.assert(deepEqual(parseValue(""), {type: "any", value: ""}))
// console.assert(deepEqual(parseValue("1"), {type: "numbers", value: [1]}))
// console.assert(deepEqual(parseValue(" 2  3  4"), {type: "numbers", value: [2,3,4]}))
// console.assert(deepEqual(parseValue(" 2.5 "), {type: "numbers", value: [2.5]}))
// console.assert(deepEqual(parseValue(" 2,3 ,4 "), {type: "string", value: "2,3 ,4"}))
// console.assert(parseValue("red").type === "color" && parseValue("red").value.getHexString() === "ff0000")
// console.assert(parseValue("#123").type === "color" && parseValue("#123").value.getHexString() === "112233")
// console.assert(parseValue("  burple "), {type: "string", value: "burple"})

// Convert a string "1..3" into {type: "numbers", range: [[1],[3]]}
// Convert a string "1|2|3" into {type: "string", options: ["1","2","3"]}
function parseRangeOption(str) {
  let range = str.split("..")
  if (range.length > 1) {
    const start = parseValue(range[0])
    const end = parseValue(range[1])
  
    if (start.type !== end.type && start.type !== "any" && end.type !== "any") {
      console.error(`incompatible types for range ${str}`)
    } else {
      return { type: start.type !== "any" ? start.type : end.type, range: [start.value, end.value]}
    }
  }

  let options = str.split("|")
  return { type: "string", options: options.map(trim) }
}

// console.assert(deepEqual(parseRangeOption("1 2 3"), { type: "string", options: ["1 2 3"]}))
// console.assert(deepEqual(parseRangeOption("1 2..3 4 5"), { type: "numbers", range: [[1,2],[3,4,5]]}))
// console.assert(deepEqual(parseRangeOption("a|b|c"), { type: "string", options: ["a","b","c"]}))
// console.assert(deepEqual(parseRangeOption("1 2||3"), { type: "string", options: ["1 2","","3"]}))
// console.assert(deepEqual(parseRangeOption("..3"), { type: "numbers", range: ["",[3]]}))
// console.assert(deepEqual(parseRangeOption("a..b"), { type: "string", range: ["a","b"]}))

function randomizeOptions(options, randFn) {
  return options[Math.floor(randFn()*options.length)]
}

function randomizeRange(type, range, randFn) {
  const min = range[0]
  const max = range[1]
  const randomNumber = (min, max) => {
    if (min === max) return min
    return randFn()*(max - min) + min
  }

  if (type === "numbers") {
    const m = Math.min(min.length, max.length) // count the least elements
    let result = max.length > m ? max.slice() : min.slice() // copy the larger array
    for (let i = 0; i < m; i++) {
      result[i] = randomNumber(min[i], max[i]) // randomize the parts where values exist for both min and max
    }
    return result
  }
  
  if (type === "color") {
    return new THREE.Color(randomNumber(min.r, max.r), randomNumber(min.g, max.g), randomNumber(min.b, max.b))
  }

  return randFn() > 0.5 ? min : max
}


// const stringParts = ["a","ab","bc"];
// const vecParts = [[1,2,3],[10,20]]
// for (let i = 0; i < 50; i++) {
//   console.assert(randomizeOptions(["x"], Math.random) === "x")
//   console.assert(stringParts.includes(randomizeOptions(stringParts, Math.random)))
//   console.assert(["a", "b"].includes(randomizeRange("string", ["a", "b", "c"], Math.random)))
  
//   const x = randomizeRange("numbers", [[1],[2]], Math.random)
//   console.assert(x >= 1 && x < 2)

//   const y = randomizeRange("numbers", vecParts, Math.random)
//   console.assert(y.length === 3 && y[0] >= vecParts[0][0] && y[0] < vecParts[1][0] && y[1] >= vecParts[0][1] && y[1] < vecParts[1][1] && y[2] === vecParts[0][2])
// }


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

    this.waitListener = ScopedListener()
    this.waitTimer = BasicTimer()
    this.psuedoRandom = BasicRandom()
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
      this.psuedoRandom.setSeed(data.seed)
    }

    for (let prop in this.rules) {
      if (!(prop in data)) {
        delete this.rules[prop] // property is no longer present
      }
    }

    for (let prop in data) {
      if (!(prop in originalSchema) && data[prop] !== oldData[prop]) {
        this.rules[prop] = parseRangeOption(data[prop])
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

        const value = rule.options ? randomizeOptions(rule.options, this.psuedoRandom.random) : randomizeRange(rule.type, rule.range, this.psuedoRandom.random)
        // console.log("wait-set:setProperties", el.id, prop, value)
        setProperty(el, prop, value)
      }
    }
  },
})
