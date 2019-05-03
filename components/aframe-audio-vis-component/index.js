// Copyright 2018-2019 harlyq
// MIT license

const elementName = el => {
  const classes = el.className.split(" ")
  return el.localName.toLowerCase() + (classes[0] ? "." + classes.join(".") : "") + "#" + el.id
}

AFRAME.registerSystem("audio-vis", {
  schema: {
    src: {
      type: "selector"
    },
    fftSize: {
      default: 32,
    },
  },

  init: function () {
    this.context = undefined
    this.analysers = {}
  },

  getOrCreateAnalyser: function() {
    if (!this.context) {
      // only create if needed to avoid the warning:
      // The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://goo.gl/7K7WLu
      this.context = new AudioContext()
    }

    const srcEl = this.data.src
    const srcName = elementName(srcEl)
    if (this.analysers[srcName]) { return this.analysers[srcName]}

    const fftSize = this.data.fftSize
    let analyser = this.context.createAnalyser()
    let source = this.context.createMediaElementSource(srcEl)
    source.connect(analyser)
    analyser.connect(this.context.destination)
    analyser.fftSize = fftSize
    analyser.fetchTime = -1
    analyser.frequencyData = new Uint8Array(fftSize)

    this.analysers[srcName] = analyser

    return analyser
  },

  getByteFrequencyData: function(analyser, time) {
    if (time !== analyser.fetchTime) {
      analyser.getByteFrequencyData(analyser.frequencyData)
      analyser.fetchTime = time
    }
    return analyser.frequencyData
  }
})

// 1 2 3..4 5 6 => [[1,2,3], [4,5,6]]
const toNumber = a => Number(a)
const parseCoords = a => a.trim().split(" ").map(toNumber)
const isRange = a => a.includes("..")
const parseRangeCoords = a => a.split("..").map(parseCoords)
const lerpRange = (range, t) => {
  if (range.length < 1) { return range[0] }

  let out = []
  const a = range[0]
  const b = range[1]

  for (let i = 0, n = Math.max(a.length, b.length); i < n; i++) {
    out[i] = THREE.Math.lerp(a[i] || 0, b[i] || 0, t)
  }

  return out
}

// const attributeToKebabCase = function(a) {
//   const parts = a.split(".")
//   if (parts.length <= 1) { return a }
//   return parts[0] + "." + parts[1].replace(/([A-Z])/g, "-$1")
// }

const isObjectEmpty = x => {
  for (let k in x) {
    if (x.hasOwnProperty(k)) {
      return false
    }
  }
  return true
}

const audioVisSchema = {
  bins: {
    type: "array", 
    default: [0],
    parse: str => typeof str === "string" ? str.split(",").map(toNumber) : str
  },
  threshold: {
    default: 0,
    min: 0,
    max: 1,
  }
}

AFRAME.registerComponent("audio-vis", {
  schema: audioVisSchema,
  multiple: true,

  init: function () {
    this.ranges = {}
    this.analyser = this.system.getOrCreateAnalyser()
  },

  updateSchema: function (newData) {
    if (typeof newData !== "object") {
      console.error(`invalid properties, expected format <property>:<value>; '${newData}'`)
    }
    
    let newRules = {}

    for (let key in newData) {
      if (!(key in this.schema)) {
        newRules[key] = { type: "string", }
      }
    }

    if (!isObjectEmpty(newRules)) { 
      this.extendSchema(newRules) 
    }
  },

  update: function (oldData) {
    const data = this.data
    for (let key in data) {
      if (!(key in audioVisSchema) && isRange(data[key])) {
        this.ranges[key] = parseRangeCoords(data[key])
      }
    }
  },

  tick: function (time, deltaTime) {
    const data = this.data
    const frequencyData = this.system.getByteFrequencyData(this.analyser, time)

    const bins = data.bins
    const n = bins.length
    let total = 0
    for (let bin of bins) {
      total += frequencyData[bin]
    }

    let avg = total/n/255 // avg is in range range (0,1)
    let filteredAvg = avg > data.threshold ? avg : 0
    let el = this.el

    for (let key in this.ranges) {
      const value = lerpRange(this.ranges[key], filteredAvg)
      switch (key) {
        case "position":
        case "scale":
          el.object3D[key].set(...value)
          break
        case "rotation":
          el.object3D[key].set(...(value.map(THREE.Math.degToRad)))
          break;
        default:
          el.setAttribute(key, value.map(x => x.toFixed(4)).join(" "))
      }
    }
  },
})
