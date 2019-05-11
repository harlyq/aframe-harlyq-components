// Copyright 2018-2019 harlyq
// MIT license

AFRAME.registerComponent("timer-emit", {
  schema: {
    src: { type: "selector" },
    target: { default: "" },
    targetScope: { default: "document", oneOf: ["document", "self", "parent"] },
    stopOnPause: { default: true },
  },
  multiple: true,

  init() {
    this.sendEvents = this.sendEvents.bind(this)
    this.mediaEl = undefined
    this.restartMedia = false
    this.clockStartTime = Date.now()
    this.targets = []
  },

  remove() {
    this.removeListeners()
  },

  updateSchema(newData) {
    if (typeof newData !== "object") {
      console.error(`invalid properties, expected format <property>:<value>; '${newData}'`)
    }
    
    const originalSchema = AFRAME.components["timer-emit"].schema
    let newSchema = {}

    for (let key in newData) {
      if (!(key in originalSchema)) {
        newSchema[key] = { type: "string" } // key is the name of the event to send, and the value is a list of time stamps
      }
    }

    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }
  },

  pause() {
    const data = this.data

    this.removeListeners()

    if (data.stopOnPause) {
      this.pauseTime = Date.now() // used to pause the clock while in the Inspector
      clearTimeout(this.sendEventsTimer)
      this.sendEventsTimer = undefined

      if (this.mediaEl && !this.mediaEl.paused) {
        this.mediaEl.pause()
        this.restartMedia = true
      }
    }
  },

  play() {
    if (this.pauseTime) {
      this.clockStartTime += Date.now() - this.pauseTime
      delete this.pauseTime
    }

    if (this.mediaEl) {
      this.addListeners()

      if (this.restartMedia) {
        this.mediaEl.play()
        this.restartMedia = false
      }
    }

    this.sendEvents()
  },

  update(oldData) {
    const data = this.data
    const originalSchema = AFRAME.components["timer-emit"].schema

    if (oldData.src !== data.src) {
      this.removeListeners()
      this.mediaEl = data.src instanceof HTMLMediaElement ? data.src : undefined
    }

    if (oldData.target !== data.target) {
      this.targets = this.querySelectorAll(data.targetScope, data.target)
    }

    this.events = []

    for (let attr in data) {
      if (!(attr in originalSchema)) {
        let times = data[attr].split(",").map(a => Number(a))
        for (let time of times) {
          if (!isNaN(time)) {
            this.events.push([time, attr])
          }
        }
      }
    }

    this.events.sort((a,b) => a[0] - b[0]) // ascending by time
    this.lastSendEventsTime = -1
  },

  querySelectorAll(scope, selector) {
    if (selector == "") return [this.el]

    switch (scope) {
      case "self": return this.el.querySelectorAll(selector) || [this.el]
      case "parent": return this.el.parentNode.querySelectorAll(selector) || [this.el]
      case "document": 
      default:
        return document.querySelectorAll(selector) || [this.el]
    }
  },

  addListeners() {
    if (this.mediaEl) {
      this.mediaEl.addEventListener("play", this.sendEvents)
    }
  },

  removeListeners() {
    if (this.mediaEl) {
      this.mediaEl.removeEventListener("play", this.sendEvents)
    }
  },

  sendEvents() {
    if (this.mediaEl && this.mediaEl.paused) {
      return
    }

    let time = this.mediaEl ? this.mediaEl.currentTime : (Date.now() - this.clockStartTime)/1000
    let nextTime
    let eventsToSend = []

    for (let event of this.events) {
      if (event[0] <= this.lastSendEventsTime) continue

      if (event[0] <= time) {
        eventsToSend.push(event[1])
      } else {
        nextTime = event[0]
        break
      }
    }

    if (eventsToSend.length > 0) {
      const source = this.el

      for (let target of this.targets) {
        const eventData = {source, target}
        
        for (let tag of eventsToSend) {
          target.emit(tag, eventData)
        }
      }
    }

    this.lastSendEventsTime = time

    if (nextTime) {
      this.sendEventsTimer = setTimeout(this.sendEvents, (nextTime - time)*1000)
    }
  }
})