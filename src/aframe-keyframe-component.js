// Copyright 2018-2019 harlyq
// MIT license
import {buildPath, convertToString, parseValue, setProperty} from "./aframe-utils.js"
// import {deepEqual} from "./aframe-utils"
import BasicRandom from "./basic-random.js"

const MAX_FRAME_TIME_MS = 100

// easing functions copied from TWEEN.js
const Easing = {
	Linear: {
		None: function (k) {
			return k;
		}
	},
	Quadratic: {
		In: function (k) {
			return k * k;
		},
		Out: function (k) {
			return k * (2 - k);
		},
		InOut: function (k) {
			if ((k *= 2) < 1) {
				return 0.5 * k * k;
			}
			return - 0.5 * (--k * (k - 2) - 1);
		}
	},
	Cubic: {
		In: function (k) {
			return k * k * k;
		},
		Out: function (k) {
			return --k * k * k + 1;
		},
		InOut: function (k) {
			if ((k *= 2) < 1) {
				return 0.5 * k * k * k;
			}
			return 0.5 * ((k -= 2) * k * k + 2);
		}
	},
	Quartic: {
		In: function (k) {
			return k * k * k * k;
		},
		Out: function (k) {
			return 1 - (--k * k * k * k);
		},
		InOut: function (k) {
			if ((k *= 2) < 1) {
				return 0.5 * k * k * k * k;
			}
			return - 0.5 * ((k -= 2) * k * k * k - 2);
		}
	},
	Quintic: {
		In: function (k) {
			return k * k * k * k * k;
		},
		Out: function (k) {
			return --k * k * k * k * k + 1;
		},
		InOut: function (k) {
			if ((k *= 2) < 1) {
				return 0.5 * k * k * k * k * k;
			}
			return 0.5 * ((k -= 2) * k * k * k * k + 2);
		}
	},
	Sinusoidal: {
		In: function (k) {
			return 1 - Math.cos(k * Math.PI / 2);
		},
		Out: function (k) {
			return Math.sin(k * Math.PI / 2);
		},
		InOut: function (k) {
			return 0.5 * (1 - Math.cos(Math.PI * k));
		}
	},
	Exponential: {
		In: function (k) {
			return k === 0 ? 0 : Math.pow(1024, k - 1);
		},
		Out: function (k) {
			return k === 1 ? 1 : 1 - Math.pow(2, - 10 * k);
		},
		InOut: function (k) {
			if (k === 0) {
				return 0;
			}
			if (k === 1) {
				return 1;
			}
			if ((k *= 2) < 1) {
				return 0.5 * Math.pow(1024, k - 1);
			}
			return 0.5 * (- Math.pow(2, - 10 * (k - 1)) + 2);
		}
	},
	Circular: {
		In: function (k) {
			return 1 - Math.sqrt(1 - k * k);
		},
		Out: function (k) {
			return Math.sqrt(1 - (--k * k));
		},
		InOut: function (k) {
			if ((k *= 2) < 1) {
				return - 0.5 * (Math.sqrt(1 - k * k) - 1);
			}
			return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
		}
	},
	Elastic: {
		In: function (k) {
			if (k === 0) {
				return 0;
			}
			if (k === 1) {
				return 1;
			}
			return -Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
		},
		Out: function (k) {
			if (k === 0) {
				return 0;
			}
			if (k === 1) {
				return 1;
			}
			return Math.pow(2, -10 * k) * Math.sin((k - 0.1) * 5 * Math.PI) + 1;
		},
		InOut: function (k) {
			if (k === 0) {
				return 0;
			}
			if (k === 1) {
				return 1;
			}
			k *= 2;
			if (k < 1) {
				return -0.5 * Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
			}
			return 0.5 * Math.pow(2, -10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI) + 1;
		}
	},
	Back: {
		In: function (k) {
			var s = 1.70158;
			return k * k * ((s + 1) * k - s);
		},
		Out: function (k) {
			var s = 1.70158;
			return --k * k * ((s + 1) * k + s) + 1;
		},
		InOut: function (k) {
			var s = 1.70158 * 1.525;
			if ((k *= 2) < 1) {
				return 0.5 * (k * k * ((s + 1) * k - s));
			}
			return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
		}
	},
	Bounce: {
		In: function (k) {
			return 1 - Easing.Bounce.Out(1 - k);
		},
		Out: function (k) {
			if (k < (1 / 2.75)) {
				return 7.5625 * k * k;
			} else if (k < (2 / 2.75)) {
				return 7.5625 * (k -= (1.5 / 2.75)) * k + 0.75;
			} else if (k < (2.5 / 2.75)) {
				return 7.5625 * (k -= (2.25 / 2.75)) * k + 0.9375;
			} else {
				return 7.5625 * (k -= (2.625 / 2.75)) * k + 0.984375;
			}
		},
		InOut: function (k) {
			if (k < 0.5) {
				return Easing.Bounce.In(k * 2) * 0.5;
			}
			return Easing.Bounce.Out(k * 2 - 1) * 0.5 + 0.5;
		}
	}
}

const EASING_FUNCTIONS = {
  'linear': Easing.Linear.None,

  'ease': Easing.Cubic.InOut,
  'ease-in': Easing.Cubic.In,
  'ease-out': Easing.Cubic.Out,
  'ease-in-out': Easing.Cubic.InOut,

  'ease-cubic': Easing.Cubic.In,
  'ease-in-cubic': Easing.Cubic.In,
  'ease-out-cubic': Easing.Cubic.Out,
  'ease-in-out-cubic': Easing.Cubic.InOut,

  'ease-quad': Easing.Quadratic.InOut,
  'ease-in-quad': Easing.Quadratic.In,
  'ease-out-quad': Easing.Quadratic.Out,
  'ease-in-out-quad': Easing.Quadratic.InOut,

  'ease-quart': Easing.Quartic.InOut,
  'ease-in-quart': Easing.Quartic.In,
  'ease-out-quart': Easing.Quartic.Out,
  'ease-in-out-quart': Easing.Quartic.InOut,

  'ease-quint': Easing.Quintic.InOut,
  'ease-in-quint': Easing.Quintic.In,
  'ease-out-quint': Easing.Quintic.Out,
  'ease-in-out-quint': Easing.Quintic.InOut,

  'ease-sine': Easing.Sinusoidal.InOut,
  'ease-in-sine': Easing.Sinusoidal.In,
  'ease-out-sine': Easing.Sinusoidal.Out,
  'ease-in-out-sine': Easing.Sinusoidal.InOut,

  'ease-expo': Easing.Exponential.InOut,
  'ease-in-expo': Easing.Exponential.In,
  'ease-out-expo': Easing.Exponential.Out,
  'ease-in-out-expo': Easing.Exponential.InOut,

  'ease-circ': Easing.Circular.InOut,
  'ease-in-circ': Easing.Circular.In,
  'ease-out-circ': Easing.Circular.Out,
  'ease-in-out-circ': Easing.Circular.InOut,

  'ease-elastic': Easing.Elastic.InOut,
  'ease-in-elastic': Easing.Elastic.In,
  'ease-out-elastic': Easing.Elastic.Out,
  'ease-in-out-elastic': Easing.Elastic.InOut,

  'ease-back': Easing.Back.InOut,
  'ease-in-back': Easing.Back.In,
  'ease-out-back': Easing.Back.Out,
  'ease-in-out-back': Easing.Back.InOut,

  'ease-bounce': Easing.Bounce.InOut,
  'ease-in-bounce': Easing.Bounce.In,
  'ease-out-bounce': Easing.Bounce.Out,
  'ease-in-out-bounce': Easing.Bounce.InOut,
}


// given [{type: "numbers", value: [1,2]}, {type: "any", value: ""}, {type: "numbers", value: [5]}] return type "numbers"
// if there are inconsistencies in the the types then generate an warning
function calcTypeOfArrayOfTypes(list) {
  let type = "any"
  for (let item of list) {
    if (item.type === "any" || item.type === type) {
      continue
    } else if (type === "any") {
      type = item.type
    } else {
      console.warn(`incompatible type found '${item.type}', expecting '${type}'`)
    }
  }
  return type
}

// Convert a string "1 2 3" into {type: "numbers", value: [1,2,3]}
// Convert a string "1..3" into {type: "numbers", range: [1,3]}
// Convert a string "1|2|3" into {type: "numbers", options: [1,2,3]}
function parseValueRangeOption(str) {
  const options = str.split("|")
  if (options.length > 1) {
    const parsedOptions = options.map(parseValue)
    return { options: parsedOptions.map(x => x.value), type: calcTypeOfArrayOfTypes(parsedOptions) }
  }

  const range = str.split("..")
  if (range.length > 1) {
    const parsedRange = range.map(parseValue)
    return { range: parsedRange.map(x => x.value), type: calcTypeOfArrayOfTypes(parsedRange) } 
  }

  const info = parseValue(str)
  return { value: info.value, type: info.type }
}

// console.assert(deepEqual(parseValueRangeOption("1 2 3"), { type: "numbers", value: [1,2,3]}))
// console.assert(deepEqual(parseValueRangeOption("1 2..3 4 5"), { type: "numbers", range: [[1,2],[3,4,5]]}))
// console.assert(deepEqual(parseValueRangeOption("a|b|c"), { type: "string", options: ["a","b","c"]}))
// console.assert(deepEqual(parseValueRangeOption("1 2||3"), { type: "numbers", options: [[1,2],"",[3]]}))
// console.assert(deepEqual(parseValueRangeOption("..3"), { type: "numbers", range: ["",[3]]}))


// Convert a string "1 2 3, 4|5 6, 7..8" into a type and an array of values, ranges or options {type: "numbers", slots: [value: [1,2,3], options: [[4],[5,6]]: range: [[7],[8]]]}
function parseKeyframeData(str) {
  let slots = str.split(",").map(parseValueRangeOption)

  // return the type and slots (stripping type information from each slot)
  return { 
    type: calcTypeOfArrayOfTypes(slots), 
    slots: slots.map(x => {
      if ("range" in x) return { range: x.range }
      if ("options" in x) return { options: x.options }
      if ("value" in x) return { value: x.value }
    })
  }
}


// const colorRulesToHexString = (rules) => { 
//   const colorToString = x => x instanceof THREE.Color ? x.getHexString() : x
//   return { 
//     type: rules.type, 
//     slots: rules.slots.map(x => { 
//       for (let type in x) { 
//         return { [type] : Array.isArray(x[type]) ? x[type].map(colorToString) : colorToString(x[type]) }
//       } 
//     }) 
//   }
// }
// console.assert(deepEqual(parseKeyframeData("1,2,3"), { type: "numbers", slots: [{value: [1]}, {value: [2]}, {value: [3]}] }))
// console.assert(deepEqual(parseKeyframeData("1..2, 3, 4..5"), { type: "numbers", slots: [{range: [[1],[2]]}, {value: [3]}, {range: [[4],[5]]}] }))
// console.assert(deepEqual(parseKeyframeData("a|b|c, d|e, f"), { type: "string", slots: [{options: ["a","b","c"]}, {options: ["d","e"]}, {value: "f"}] }))
// console.assert(deepEqual(colorRulesToHexString(parseKeyframeData("yellow, black..blue, orange|green")), { type: "color", slots: [{value: "ffff00"}, {range: ["000000", "0000ff"]}, {options: ["ffa500","008000"]}] }))
// console.assert(deepEqual(parseKeyframeData(",1 2,3 4 5"), { type: "numbers", slots: [{value: ""}, {value: [1,2]}, {value: [3,4,5]}] }))
// console.assert(deepEqual(colorRulesToHexString(parseKeyframeData("..red,,blue|green|")), { type: "color", slots: [{range: ["", "ff0000"]}, {value: ""}, {options: ["0000ff", "008000", ""]}] }))


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


const RULE_RANDOMIZER = {
  "value": (type, value, randFn) => value,
  "options": (type, parts, randFn) => parts[~~(randFn()*parts.length)],
  "range": randomizeRange
}


// const stringParts = ["a","ab","bc"];
// const vecParts = [[1,2,3],[10,20]]
// for (let i = 0; i < 50; i++) {
//   console.assert(typeof RULE_RANDOMIZER["options"]("numbers", [], Math.random) === "undefined")
//   console.assert(RULE_RANDOMIZER["options"]("string", ["x"], Math.random) === "x")
//   console.assert(stringParts.includes(RULE_RANDOMIZER["options"]("string", stringParts, Math.random)))
//   console.assert(["a", "b"].includes(RULE_RANDOMIZER["range"]("string", ["a", "b", "c"], Math.random)))
  
//   const x = RULE_RANDOMIZER["range"]("numbers", [[1],[2]], Math.random)
//   console.assert(x >= 1 && x < 2)

//   const y = RULE_RANDOMIZER["range"]("numbers", vecParts, Math.random)
//   console.assert(y.length === 3 && y[0] >= vecParts[0][0] && y[0] < vecParts[1][0] && y[1] >= vecParts[0][1] && y[1] < vecParts[1][1] && y[2] === vecParts[0][2])
// }


// takes a set of rules (e.g from parseKeyframeData) and provides an array of random values that meets those rules
// e.g. {type: "numbers", slots: [value: [1,2,3], options: [[4],[5,6]]: range: [[7],[8]]]} produces [[1,2,3],[5,6],[7.5]]
function randomRules(rules, randFn) {
  let prevX // this will always be value because the first slot will always contain valid data

  return rules.slots.map(x => {
    const slotType = Object.keys(x)[0]
    
    // replace empty parts with the previous value
    let slot = x[slotType]
    if (Array.isArray(slot) && slot.includes("")) {
      console.assert(typeof prevX !== "undefined")
      slot = slot.map(x => x === "" ? prevX : x)
    } else if (slot === "") {
      console.assert(typeof prevX !== "undefined")
      slot = prevX
    }

    prevX = RULE_RANDOMIZER[slotType](rules.type, slot, randFn)
    return prevX
  })
}

function hasRandomness(rules) {
  return rules.slots.some(x => !("value" in x))
}

// a and b may be different lengths
function lerpNumbers(a, b, t, out) {
  const m = Math.min(a.length, b.length)
  out.length = Math.max(a.length, b.length)

  for (let i = 0; i < m; i++) {
    out[i] = THREE.Math.lerp(a[i], b[i], t)
  }
  for (let i = m; i < a.length; i++) {
    out[i] = a[i]
  }
  for (let i = m; i < b.length; i++) {
    out[i] = b[i]
  }

  return out
}

// const lerpHSL = (a, b, t) => {
//   let h = THREE.Math.lerp(a.h, b.h, t)
//   let s = THREE.Math.lerp(a.s, b.s, t)
//   let l = THREE.Math.lerp(a.l, b.l, t)
//   return {h,s,l}
// }


function lerpColor(a, b, t, outColor) {
  return outColor.setRGB(a.r, a.g, a.b).lerp(b, t)
}


function lerpReturnFirst(a, b, t, out) {
  return a
}


const SLOT_LERP_FUNCTION = {
  "numbers": lerpNumbers,
  "color": lerpColor,
  "string": lerpReturnFirst,
  "boolean": lerpReturnFirst,
  "any": lerpReturnFirst,
}


let lerpResultHolder = {
  "numbers": [],
  "color": new THREE.Color(),
  "string": "",
  "boolean": false,
  "any": ""
}

// Takes a set of keys (from randomRules()), and provides an interpolated value, where r is 0 (first key) to 1 (last key)
// e.g. [[1,2,3],[5,6],[7.5]] @ r = 0.25 becomes [3,4,3]
function lerpKeys(type, keys, r, easingFn) {
  const n = keys.length

  if (r <= 0 || n <= 1) {
    return keys[0]
  } else if (r >= 1) {
    return keys[n - 1]
  }

  const k = r*(n - 1)
  const i = ~~k
  const t = easingFn(k - i)
  return SLOT_LERP_FUNCTION[type](keys[i], keys[i+1], t, lerpResultHolder[type])
}

// const EPSILON = 1e-4
// console.assert( Math.abs(lerpKeys("numbers", [[1],[2],[3]], 0)[0] - 1) < EPSILON )
// console.assert( Math.abs(lerpKeys("numbers", [[1],[2],[3]], 0.5)[0] - 2) < EPSILON )
// console.assert( Math.abs(lerpKeys("numbers", [[1],[2],[3]], 0.25)[0] - 1.5) < EPSILON )
// console.assert( Math.abs(lerpKeys("numbers", [[1],[2],[3]], 0.75)[0] - 2.5) < EPSILON )
// console.assert( Math.abs(lerpKeys("numbers", [[1],[2],[3]], 1)[0] - 3) < EPSILON )
// console.assert( Math.abs(lerpKeys("numbers", [[1,2,3],[4,5,6],[7,8,9]], 0.75)[1] - 6.5) < EPSILON )
// console.assert( lerpKeys("string", ["a","b","c"], 0) === "a" )
// console.assert( lerpKeys("string", ["a","b","c"], 1) === "c" )
// console.assert( lerpKeys("string", ["a","b","c"], 0.25) === "a" )
// console.assert( lerpKeys("string", ["a","b","c"], 0.75) === "b" )


function getPropertyAsString(target, prop) {
  const parts = prop.split(".")
  if (parts.length <= 2) {
    return convertToString(AFRAME.utils.entity.getComponentProperty(target, prop))
  }

  // e.g. object3dmap.mesh.material.uniforms.color
  const path = buildPath(target, parts)
  if (path) {
    return convertToString(path[part])
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
    easing: { default: "linear", oneOf: Object.keys(EASING_FUNCTIONS) },
    randomizeEachLoop: { default: true },
  },
  multiple: true,

  init() {
    this.pseudoRandom = BasicRandom()

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
      this.pseudoRandom.setSeed(data.seed) // must be updated before other attributes
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
        this.rules[prop] = parseKeyframeData(data[prop])

        this.guessMissingFirstValue(prop, this.rules[prop])

        this.keys[prop] = randomRules(this.rules[prop], this.pseudoRandom.random)
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
          for (let prop in this.keys) {
            if (hasRandomness(this.rules[prop])) {
              this.keys[prop] = randomRules(this.rules[prop], this.pseudoRandom.random)
            }
          }
        }
      }

      const easingFn = EASING_FUNCTIONS[data.easing] || EASING_FUNCTIONS["linear"]
      
      for (let prop in this.keys) {
        let r = THREE.Math.clamp(this.loopTime/data.duration, 0, 1)
        const value = lerpKeys(this.rules[prop].type, this.keys[prop], r, easingFn)
        setProperty(this.el, prop, value)
      }
    }
  },

  guessMissingFirstValue(prop, rule) {
    if (rule.slots.length > 0) {
      let slot0 = rule.slots[0]
      const emptyValue = slot0.value === ""
      const emptyRange = slot0.range && slot0.range.includes("")
      const emptyOption = slot0.options && slot0.options.includes("")

      if (emptyValue || emptyRange || emptyOption) {
        let info = parseValue(getPropertyAsString(this.el, prop))
        if (emptyValue) slot0.value = info.value
        if (emptyRange) slot0.range = slot0.range.map(x => x === "" ? info.value : x)
        if (emptyOption) slot0.options = slot0.options.map(x => x === "" ? info.value : x)
      }
    }
  },
})

