import { aframeHelper } from "harlyq-helpers"
import * as jsfxr from "./jsfxr.js"

const WAVE_TYPES = ["square", "saw", "sine", "noise"]
const PRESETS = ["", "pickup", "laser", "explosion", "powerup", "hit", "jump", "blip"]
const PRESET_SOUNDS = [
  "",
  "0,,0.0471,0.4724,0.3068,0.7881,,,,,,0.5963,0.5726,,,,,,1,,,,,0.5",
  "1,,0.2965,0.2824,0.0465,0.6897,0.3877,-0.2884,,,,,,0.8732,-0.4466,,,,1,,,0.0907,,1",
  "3,,0.3436,0.6166,0.4478,0.0417,,0.2933,,,,,,,,0.5993,-0.1521,-0.0133,1,,,,,0.5",
  "0,,0.1917,,0.4356,0.3114,,0.0918,,,,,,0.4176,,,,,1,,,,,1",
  "3,,0.0668,,0.206,0.2304,,-0.6075,,,,,,,,,,,1,,,,,0.5",
  "0,,0.3617,,0.1015,0.4239,,0.2121,,,,,,0.1629,,,,,0.6555,,,,,0.5",
  "1,,0.1965,,0.1281,0.2741,,,,,,,,,,,,,1,,,0.1,,0.5",
].map(toNumberArray)

function toLowerCase(str) { return str.toLowerCase() }
function clamp(x,a,b) { return x < a ? a : (x > b ? b : x) }
function toNumberArray(str) { return str.split(",").map(x => Number(x)) }
function rand() { return Math.random() }

AFRAME.registerComponent("sfxr", {
  schema: {
    _play: { default: false },
    _random: { default: false },
    as3fxr: { default: "" },
    preset: { oneOf: PRESETS, default: "" },
    events: { default: "" },
    delay: { default: 0 },
    waveType: { oneOf: WAVE_TYPES, default: "square", parse: toLowerCase },
    attackTime: { default: 0, min: 0, max: 1 },
    sustainTime: { default: .18, min: .18, max: 1 },
    sustainPunch: { default: 0, min: 0, max: 1 },
    decayTime: { default: 0, min: 0, max: 1 },
    startFrequency: { default: 0, min: 0, max: 1 },
    minFrequency: { default: 0, min: 0, max: 1 },
    slide: { default: 0, min: -1, max: 1 },
    deltaSlide: { default: 0, min: -1, max: 1 },
    vibratoDepth: { default: 0, min: 0, max: 1 },
    vibratoSpeed: { default: 0, min: 0, max: 1 },
    changeAmount: { default: 0, min: -1, max: 1 },
    changeSpeed: { default: 0, min: 0, max: 1 },
    squareDuty: { default: 0, min: 0, max: 1 },
    dutySweep: { default: 0, min: -1, max: 1 },
    repeatSpeed: { default: 0, min: 0, max: 1 },
    phaserOffset: { default: 0, min: -1, max: 1 },
    phaserSweep: { default: 0, min: -1, max: 1 },
    lpFilterCutoff: { default: 0, min: 0, max: 1 },
    lpFilterCutoffSweep: { default: 0, min: -1, max: 1 },
    lpFilterResonance: { default: 0, min: 0, max: 1 },
    hpFilterCutoff: { default: 0, min: 0, max: 1 },
    hpFilterCutoffSweep: { default: 0, min: -1, max: 1 },
    masterVolume: { default: 0, min: 0, max: 1 },
    enabled: { default: true },
  },

  multiple: true,

  init() {
    this.onEvent = this.onEvent.bind(this)
    this.playSound = this.playSound.bind(this)

    this.player = new Audio()
    this.delayClock = aframeHelper.basicClock()
    this.eventListener = aframeHelper.scopedEvents( this.el, this.onEvent )
  },

  remove() {
    this.eventListener.remove()
    this.delayClock.clearAllTimeouts()
    this.player.stop()
  },

  pause() {
    this.eventListener.remove()
    this.delayClock.pause()
  },

  play() {
    this.eventListener.add()
    this.delayClock.resume()
  },

  update(oldData) {
    const data = this.data
    if (oldData._play !== undefined && data._play !== oldData._play) {
      this.playSound()

    } else if (oldData._random !== undefined && data._random !== oldData._random) {
      const values = [
        Math.trunc( rand()*WAVE_TYPES.length ),
        rand(),
        rand(),
        rand(),
        rand(),
        rand(),
        0, // minFrequency
        rand()*2 - 1,
        rand()*2 - 1,
        rand(),
        rand(),
        rand()*2 - 1,
        rand(),
        rand(),
        rand()*2 - 1,
        rand(),
        rand(),
        rand()*2 - 1,
        rand(),
        rand()*2 - 1,
        rand(),
        rand(),
        rand()*2 - 1,
        .5
      ]
      this.sendToPlayer(values)
      this.setData(values)
      this.setASFXData(values)
      this.data.preset = ""

      if (oldData.preset !== undefined) {
        this.player.play()
      }

    } else if (oldData.preset !== data.preset && data.preset) {
      const index =  clamp( PRESETS.indexOf(data.preset), 0, PRESET_SOUNDS.length - 1 )
      this.sendToPlayer(PRESET_SOUNDS[index])
      this.setData(PRESET_SOUNDS[index])
      this.setASFXData(PRESET_SOUNDS[index])

      if (oldData.preset !== undefined) {
        this.player.play()
      }

    } else if (data.as3fxr !== oldData.as3fxr && data.as3fxr) {
      const values = toNumberArray(data.as3fxr)
      this.sendToPlayer(values)
      this.setData(values)
      this.data.preset = ""

    } else {
      this.sendToPlayer([
        WAVE_TYPES.indexOf(data.waveType),
        data.attackTime,
        data.sustainTime,
        data.sustainPunch,
        data.decayTime,
        data.startFrequency,
        data.minFrequency,
        data.slide,
        data.deltaSlide,
        data.vibratoDepth,
        data.vibratoSpeed,
        data.changeAmount,
        data.changeSpeed,
        data.squareDuty,
        data.dutySweep,
        data.repeatSpeed,
        data.phaserOffset,
        data.phaserSweep,
        data.lpFilterCutoff,
        data.lpFilterCutoffSweep,
        data.lpFilterResonance,
        data.hpFilterCutoff,
        data.hpFilterCutoffSweep,
        data.masterVolume
      ])
    }

    if (data.events !== oldData.events) {
      if (data.events) {
        this.eventListener.set( data.events, "", "self" )
      } else {
        this.delayClock.startTimer( this.data.delay, this.playSound )
      }
    }

  },

  setData(x) {
    const data = this.data
    data.waveType = WAVE_TYPES[x[0]]
    data.attackTime = x[1]
    data.sustainTime = x[2]
    data.sustainPunch = x[3]
    data.decayTime = x[4]
    data.startFrequency = x[5]
    data.minFrequency = x[6]
    data.slide = x[7]
    data.deltaSlide = x[8]
    data.vibratoDepth = x[9]
    data.vibratoSpeed = x[10]
    data.changeAmount = x[11]
    data.changeSpeed = x[12]
    data.squareDuty = x[13]
    data.dutySweep = x[14]
    data.repeatSpeed = x[15]
    data.phaserOffset = x[16]
    data.phaserSweep = x[17]
    data.lpFilterCutoff = x[18]
    data.lpFilterCutoffSweep = x[19]
    data.lpFilterResonance = x[20]
    data.hpFilterCutoff = x[21]
    data.hpFilterCutoffSweep = x[22]
    data.masterVolume = x[23]
  },

  setASFXData(x) {
    this.data.as3fxr = x.map(v => v != 0 ? v.toFixed(4).replace(/0+$/,'') : '').join(",")
  },

  sendToPlayer(x) {
    this.player.src = jsfxr.jsfxr([
      clamp(x[0], 0, WAVE_TYPES.length - 1),
      clamp(x[1], 0, 1),
      clamp(x[2], 0, 1),
      clamp(x[3], 0, 1),
      clamp(x[4], 0, 1),
      clamp(x[5], 0, 1),
      clamp(x[6], 0, 1),
      clamp(x[7], -1, 1),
      clamp(x[8], -1, 1),
      clamp(x[9], 0, 1),
      clamp(x[10], 0, 1),
      clamp(x[11], -1, 1),
      clamp(x[12], 0, 1),
      clamp(x[13], 0, 1),
      clamp(x[14], -1, 1),
      clamp(x[15], 0, 1),
      clamp(x[16], -1, 1),
      clamp(x[17], -1, 1),
      clamp(x[18], 0, 1),
      clamp(x[19], -1, 1),
      clamp(x[20], 0, 1),
      clamp(x[21], 0, 1),
      clamp(x[22], -1, 1),
      clamp(x[23], 0, 1)
    ])
  },

  onEvent(event) {
    this.delayClock.startTimer( this.data.delay, this.playSound )
  },

  playSound() {
    if (this.data.enabled) {
      this.player.currentTime = 0
      this.player.play()
    }
  }
})

