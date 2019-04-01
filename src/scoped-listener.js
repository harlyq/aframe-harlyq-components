// Copyright 2018-2019 harlyq
// MIT license

export default function ScopedListener() {
  let elements = []
  let event
  let callback

  function set(el, selector, scope, eventName, callbackFn) {
    remove()
    elements = getElementsInScope(el, selector, scope)
    event = eventName
    callback = callbackFn
  }

  function add() {
    if (event && callback) {
      for (let el of elements) {
        // console.log("scopedListener:add", el.id, event)
        el.addEventListener(event, callback)
      }
    }
  }

  function remove() {
    if (event && callback) {
      for (let el of elements) {
        // console.log("scopedListener:remove", el.id, event)
        el.removeEventListener(event, callback)
      }
    }
  }

  function getElementsInScope(el, selector, scope, eventEl) {
    switch (scope) {
      case "self": return selector === "" ? [el] : el.querySelectorAll(selector) || [el]
      case "parent": return selector === "" ? [el] : el.parentNode.querySelectorAll(selector) || [el]
      case "event": {
        const bestEl = eventEl ? eventEl : el
        return selector === "" ? [bestEl] : bestEl.querySelectorAll(selector) || [bestEl]
      }
      case "document": 
      default:
        return selector === "" ? [el] : document.querySelectorAll(selector) || [el]
    }
  }

  return {
    set,
    add,
    remove,
    getElementsInScope,
  }
}
