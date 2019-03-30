// Copyright 2018-2019 harlyq
// MIT license

// JSON deepEqual test
export function deepEqual(a, b) {
  if (typeof a === "object" && a && b && a.constructor === b.constructor) {
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        return false
      }
      
      for (let i = 0; i < a.length; a++) {
        if (!deepEqual(a[i], b[i])) {
          return false
        }
      }
    } else {
      for (let k in a) {
        if (!(k in b) || !deepEqual(a[k], b[k])) {
          return false
        }
      }
    }
    return true
  }

  return a === b
}

// console.assert(deepEqual(null, null))
// console.assert(deepEqual(undefined, undefined))
// console.assert(deepEqual([], []))
// console.assert(deepEqual([1], [1]))
// console.assert(deepEqual([1,2,3], [1,2,3]))
// console.assert(!deepEqual([1,2], [1,2,3]))
// console.assert(!deepEqual([1,2,3], [1,2]))
// console.assert(deepEqual({a:1, b:"c"}, {a:1, b:"c"}))
// console.assert(!deepEqual({a:1, b:"c"}, {a:1, b:"d"}))
// console.assert(!deepEqual({a:1, b:"c"}, {a:2, b:"c"}))
// console.assert(!deepEqual({a:1, b:"c"}, null))
// console.assert(deepEqual({a:[1,2], b:{x: 3, y:4}}, {a:[1,2], b:{x: 3, y:4}}))

// builds a value from a 'root' and an array of 'attributes', each attribute is considered as the child of the previous attribute
export function buildPath(root, attributes) {
  let path = root
  let parts = attributes.slice().reverse()
  while (path && parts.length > 0) {
    path = path[parts.pop()]
  }

  return path
}

console.assert(buildPath({a: 1, b: {c: {x: "hello"}, d: 3}}, ["b","c","x"]) === "hello")
console.assert(buildPath({a: 1, b: {c: {x: "hello"}, d: 3}}, ["b","c","y"]) === undefined)
console.assert(buildPath({a: 1, b: {c: {x: "hello"}, d: 3}}, ["a"]) === 1)
console.assert(buildPath({a: 1, b: {c: {x: "hello"}, d: 3}}, ["b","w"]) === undefined)


// stringifies an object, specifically sets colors as hexstrings and coordinates as space separated numbers
export function convertToString(thing) {
  if (typeof thing == "object") {
    if (Array.isArray(thing)) {
      return thing.map(convertToString)
    }

    if (thing instanceof THREE.Color) {
      return "#" + thing.getHexString()
    }

    if ("x" in thing || "y" in thing || "z" in thing || "w" in thing) {
      return AFRAME.utils.coordinates.stringify(thing)
    }
  }

  return thing.toString()
}


// *value* can be boolean, string, color or array of numbers
export const setProperty = (() => {
  const trim = x => x.trim()
  const OBJECT3D_FAST_SET = {
    "rotation": x => isNaN(x) ? 0 : THREE.Math.degToRad(x),
    "position": x => isNaN(x) ? 0 : x,
    "scale": x => isNaN(x) ? 1 : x,
  }
  
  return function setProperty(target, prop, value) {
    let fn = OBJECT3D_FAST_SET[prop]
    if (fn) {
      if (Array.isArray(value)) {
      } else if (typeof value === "object") {
        value = [value.x, value.y, value.z]
      } else {
        value = value.split(" ").map(trim)
      }
      value.length = 3
      target.object3D[prop].set(...value.map(fn))
      return
    }
  
    const parts = prop.split(".")
    if (parts.length <= 2) {
      // component or component.property
      parts[0] = parts[0].replace(/[A-Z]/g, x => "-" + x.toLowerCase()) // convert component names from camelCase to kebab-case
      if (value) {
        AFRAME.utils.entity.setComponentProperty(target, parts.join("."), convertToString(value)) // does this work for vectors??
      } else {
        target.removeAttribute(parts.join("."))
      }
      return
    }
  
    // e.g. object3dmap.mesh.material.uniforms.color
    const path = buildPath(target, parts)
    if (path) {
      // this only works for boolean, string, color and an array of one element
      path[part] = Array.isArray(value) && value.length === 1 ? value[0] : value
    } else {
      console.warn(`unknown path for setProperty() '${prop}'`)
    }
  }   
  
})()


// Convert a string "1 2 3" into a type and value {type: "numbers", value: [1,2,3]}
export const parseValue = (function() {
  const isTHREE = typeof THREE !== "undefined"
  const COLOR_WHITE = isTHREE ? new THREE.Color() : undefined
  const COLOR_BLACK = isTHREE ? new THREE.Color(0,0,0) : undefined
  const toNumber = str => Number(str.trim())

  let tempColor = isTHREE ? new THREE.Color() : undefined
  
  return function parseValue(str) {
    if (str === "") return {type: "any", value: ""}

    let vec = str.split(" ").filter(x => x !== "").map(toNumber)
    if (!vec.every(isNaN)) return {type: "numbers", value: vec}
  
    if (isTHREE) {
      let oldWarn = console.warn; console.warn = () => {} // HACK disable warnings that threejs spams about invalid colors
      let col = new THREE.Color(str.trim())
      if (col.equals(COLOR_WHITE) && tempColor.copy(COLOR_BLACK).setStyle(str).equals(COLOR_BLACK)) col = undefined // if input colour is the same as the starting color, then input was invalid
      console.warn = oldWarn
      if (col) return {type: "color", value: col}
    }
  
    return {type: "string", value: str.trim()}
  }
})()

// console.assert(deepEqual(parseValue(""), {type: "any", value: ""}))
// console.assert(deepEqual(parseValue("1"), {type: "numbers", value: [1]}))
// console.assert(deepEqual(parseValue(" 2  3  4"), {type: "numbers", value: [2,3,4]}))
// console.assert(deepEqual(parseValue(" 2.5 "), {type: "numbers", value: [2.5]}))
// console.assert(deepEqual(parseValue(" 2,3 ,4 "), {type: "string", value: "2,3 ,4"}))
// console.assert(parseValue("red").type === "color" && parseValue("red").value.getHexString() === "ff0000")
// console.assert(parseValue("#123").type === "color" && parseValue("#123").value.getHexString() === "112233")
