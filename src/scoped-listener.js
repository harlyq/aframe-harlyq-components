// Copyright 2018 harlyq
// MIT license

function ScopedListener() {
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
        el.addEventListener(event, callback)
      }
    }
  }

  function remove() {
    if (event && callback) {
      for (let el of elements) {
        el.removeEventListener(event, callback)
      }
    }
  }

  function getElementsInScope(el, selector, scope) {
    if (selector == "") return [el]

    switch (scope) {
      case "self": return el.querySelectorAll(selector) || [el]
      case "parent": return el.parentNode.querySelectorAll(selector) || [el]
      case "document": 
      default:
        return document.querySelectorAll(selector) || [el]
    }
  }

  return {
    set,
    add,
    remove,
    getElementsInScope,
  }
}

module.exports = ScopedListener
