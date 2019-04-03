import { rgbcolor, utils } from "helpers"

// Copyright 2018-2019 harlyq
// MIT license

// JSON deepEqual test
export function deepEqual(a, b) {
  if (typeof a === "object" && a && b && a.constructor === b.constructor) {
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        return false
      }
      
      for (let i = 0; i < a.length; i++) {
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

// stringifies an object, specifically sets colors as hexstrings and coordinates as space separated numbers
export function convertToString(thing) {
  if (typeof thing == "object") {
    if (Array.isArray(thing)) {
      return thing.map(convertToString)
    }

    if ("r" in thing && "g" in thing && "b" in thing) {
      return rgbcolor.toString(thing)
    }

    if ("x" in thing && "y" in thing || "z" in thing || "w" in thing) {
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
    const path = utils.getWithPath(target, parts)
    if (path) {
      // this only works for boolean, string, color and an array of one element
      path[prop] = Array.isArray(value) && value.length === 1 ? value[0] : value
    } else {
      console.warn(`unknown path for setProperty() '${prop}'`)
    }
  }   
  
})()


