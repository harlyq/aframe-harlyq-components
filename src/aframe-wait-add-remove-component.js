// Copyright 2018-2019 harlyq
// MIT license

import ScopedListener from "./scoped-listener.js"
import BasicTimer from "./basic-timer.js"
import { selector } from "helpers"

/**
 * Creates an HTML Element that matches a given selector string e.g. div.door#door1[state=open], 
 * creates a "div" with className "door", id "door1" and attribute "state=open".  If no type is
 * provided then defaults to a-entity.
 * 
 * @param {string} str - selector string to create
 * @return {object} returns an HTMLElement matching the selector string
 */
function createElementFromSelector(str) {
  let info = selector.parse(str)
  let type = info.type || 'a-entity'
  let newEl = document.createElement(type)
  if (newEl) {
    if (info.id) newEl.id = info.id
    if (info.classes.length > 0) newEl.classList.add(...info.classes)

    for (let attr in info.attrs) {
      AFRAME.utils.entity.setComponentProperty(newEl, attr, trimQuotes(info.attrs[attr]))
    }
  }

  return newEl
}

/**
 * Removes the outer-most quotes from around a string
 * 
 * @param {string} str - string to remove quotes from
 * @return {string} returns a new string, without the leading and trailing quotes
 */
function trimQuotes(str) {
  str = str.trim()
  const start = (str[0] === "'" || str[0] === '"') ? 1 : 0
  const n = str.length
  let end = (str[n - 1] === "'" || str[n - 1] === '"') ? n - 1 : n
  return start === 0 && end === n ? str : str.slice(start, end)
}

// console.assert(trimQuotes(``) === "")
// console.assert(trimQuotes(`  "bla h"`) === "bla h")
// console.assert(trimQuotes(` 'foo''bar'  `) === "foo''bar")
// console.assert(trimQuotes(`keep'"inside`) === "keep'\"inside")

AFRAME.registerComponent("wait-add-remove", {
  schema: {
    delay: { default: 0 },
    event: { default: "" },
    source: { default: "" },
    sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
    add: { type: "array" },
    addRepeat: { type: "int", default: 1 },
    remove: { type: "array" },
  },
  multiple: true,

  init() {
    this.addRemoveEntities = this.addRemoveEntities.bind(this)
    this.startDelay = this.startDelay.bind(this)

    this.waitTimer = BasicTimer()
    this.waitListener = ScopedListener()
  },

  update(oldData) {
    const data = this.data
    if (oldData.event !== data.event || oldData.source !== data.source || oldData.sourceScope !== data.sourceScope) {
      this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.startDelay)
    }
    
    if (oldData.delay !== data.delay && (this.timer || data.event === "")) {
      this.startDelay()
    }
  },

  pause() {
    this.waitTimer.pause()
    this.waitListener.remove()
  },

  play() {
    this.waitListener.add()
    this.waitTimer.resume()
  },

  startDelay() {
    this.waitTimer.start(this.data.delay, this.addRemoveEntities)
  },

  addRemoveEntities() {
    const data = this.data
    for (let removeSelector of data.remove) {
      let descendants = this.el.querySelectorAll(removeSelector)
      descendants.forEach(el => this.el.removeChild(el))
    }

    for (let i = 0; i < data.addRepeat; ++i) {
      for (let addSelector of data.add) {
        let newEl = createElementFromSelector(addSelector) // TODO should we createElement in the update, and only do the append here?
        if (newEl) {
          this.el.appendChild(newEl)
        }
      }
    }
  }
})

