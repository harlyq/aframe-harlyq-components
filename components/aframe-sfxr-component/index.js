import { aframeHelper } from "harlyq-helpers"
import * as jsfxr from "./jsfxr.js"

const WAVE_TYPES = ["square", "saw", "sine", "noise"]
const PRESET_SOUNDS_ENTRIES = {
  "blip": "1,0.0763,0.2818,0.016,0.0863,0.5084,,0.1299,0.0055,-0.9082,0.129,-0.0591,-0.2874,0.394,0.0001,0.9773,0.0273,-0.2397,0.9997,0.0216,,0.049,0.0001,0.5",
  "blip2": "2,,0.1774,0.3425,0.2543,0.5001,,,-0.1253,,-0.6326,0.0511,0.6321,0.5733,0.2467,,0.347,0.0153,0.8671,-0.025,-0.7166,0.0822,,0.5",
  "blip3": "1,,0.01,0.466,0.2176,0.2082,,-0.0277,0.1473,,0.0722,0.7231,-0.5943,0.1948,-0.0661,,0.1636,0.2965,0.0806,-0.001,0.8212,0.1233,-0.0013,0.5",
  "blip4": "1,,0.1965,,0.1281,0.2741,,,,,,,,,,,,,1,,,0.1,,0.5",
  "bounce": "2,0.0007,0.0948,0.0201,0.1347,0.1747,,0.0545,0.0153,-0.0796,-0.4931,0.8874,-0.3721,0.1246,0.8612,0.6185,-0.1477,-0.6924,0.4851,0.3104,0.1193,0.2017,0.0358,0.5",
  "chime": "0,0.1383,0.651,0.467,0.3914,0.5016,,,0.0655,,0.064,-0.7934,,0.4441,0.0266,0.3182,-0.1779,0.2923,0.3721,-0.0176,,0.6679,0.6276,0.5",
  "coin": "0,,0.0471,0.4724,0.3068,0.7881,,,,,,0.5963,0.5726,,,,,,1,,,,,0.5",
  "explosion": "3,,0.3436,0.6166,0.4478,0.0417,,0.2933,,,,,,,,0.5993,-0.1521,-0.0133,1,,,,,0.5",
  "hit": "3,0.0072,0.1912,0.4453,0.6026,0.5006,,0.5214,-0.0019,0.2952,,-0.4769,,,-0.4262,-0.8242,-0.0544,-0.1995,0.8669,-0.7538,0.4002,0.32,-0.0006,0.5",
  "jump": "0,,0.3617,,0.1015,0.4239,,0.2121,,,,,,0.1629,,,,,0.6555,,,,,0.5",
  "laser": "1,,0.2965,0.2824,0.0465,0.6897,0.3877,-0.2884,,,,,,0.8732,-0.4466,,,,1,,,0.0907,,1",
  "laser2": "3,0.0059,0.5443,0.2928,0.6031,0.5,,,-0.0187,,,0.9508,,0.6631,-0.5569,0.7418,0.0444,-0.7924,0.6592,-0.1598,-0.133,0.0128,,0.5",
  "laser3": "3,0.0496,0.01,0.0659,0.918,0.5014,,0.5792,-0.0029,-0.0049,0.8602,0.118,,,-0.0042,0.1187,-0.0236,0.6263,0.752,-0.6478,-0.8254,0.0664,-0.1286,0.5",
  "powerup": "0,,0.1917,,0.4356,0.3114,,0.0918,,,,,,0.4176,,,,,1,,,,,1",
  "pulse": "0,0.3134,0.7096,0.0081,0.4655,0.2789,,-0.102,0.0261,0.1236,0.8212,0.4089,,,-0.116,,0.1212,0.0429,0.978,-0.3121,,,-0.1077,0.5",
  "pulse2": ",0.1637,0.6944,0.8905,0.741,0.5745,,-0.0833,0.7298,0.2642,0.3181,0.1227,0.5693,0.1215,0.1114,0.5623,0.5974,0.8682,0.793,-0.2755,0.0143,0.7865,0.2557,0.5",
  "pulse3": "1,0.2058,0.0697,0.0369,0.9649,0.4779,,,-0.0495,0.661,,-0.4738,0.5435,0.7119,-0.0316,0.2556,-0.9952,0.4666,0.1608,-0.038,0.4537,0.097,,0.5",
  "pulse4": "0,0.0008,0.01,0.1728,0.4637,0.5029,,0.2054,,0.6654,0.0841,0.7765,0.7312,0.8236,-0.3597,0.7258,0.0674,-0.0745,0.1646,0.0361,0.1764,,-0.2647,0.5",
  "thump": "3,0.145,0.2908,0.597,0.542,0.001,,0.0014,0.0367,0.1754,0.8581,0.3987,,0.1379,-0.759,,-0.3583,0.0593,0.185,-0.9675,0.7929,0.0065,-0.2162,0.5",
}
const PRESET_SOUNDS = Object.fromEntries( Object.entries(PRESET_SOUNDS_ENTRIES).map(x => [x[0], toNumberArray(x[1])]) )

function toLowerCase(str) { return str.toLowerCase() }
function clamp(x,a,b) { return x < a ? a : (x > b ? b : x) }
function toNumberArray(str) { return str.split(",").map(x => Number(x)) }
function rand() { return Math.random() }

AFRAME.registerComponent("sfxr", {
  schema: {
    _play: { default: false },
    _random: { default: false },
    as3fxr: { default: "" },
    preset: { oneOf: Object.keys(PRESET_SOUNDS), default: "" },
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
    playOnChange: { default: false },
  },

  multiple: true,

  init() {
    this.player = new Audio()
    this.delayedEventHandler = aframeHelper.delayedEventHandler( this.el, this.playSound.bind(this) )
  },

  remove() {
    this.delayedEventHandler.remove()
    this.player.stop()
  },

  pause() {
    this.delayedEventHandler.pause()
  },

  play() {
    this.delayedEventHandler.play()
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
      const values = PRESET_SOUNDS[data.preset] || PRESET_SOUNDS[0]
      this.sendToPlayer(values)
      this.setData(values)
      this.setASFXData(values)

      if (oldData.preset !== undefined) {
        this.player.play()
      }

    } else if (data.as3fxr !== oldData.as3fxr && data.as3fxr) {
      const values = toNumberArray(data.as3fxr)
      this.sendToPlayer(values)
      this.setData(values)

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

      if (data.playOnChange) {
        this.player.play()
      }
    }

    if ( data.events !== oldData.events || data.enabled !== oldData.enabled || data.delay !== oldData.delay ) {
      this.delayedEventHandler.update(data.events, "", "", data.delay, data.enabled)
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

  playSound() {
    this.player.currentTime = 0
    this.player.play()
  }
})

