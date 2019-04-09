(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
}(function () { 'use strict';

  // Copyright 2018-2019 harlyq
  // MIT license

  const elementName = el => {
    const classes = el.className.split(" ");
    return el.localName.toLowerCase() + (classes[0] ? "." + classes.join(".") : "") + "#" + el.id
  };

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
      this.context = new AudioContext();
      this.analysers = {};
    },

    getOrCreateAnalyser: function() {
      const srcEl = this.data.src;
      const srcName = elementName(srcEl);
      if (this.analysers[srcName]) { return this.analysers[srcName]}

      const fftSize = this.data.fftSize;
      let analyser = this.context.createAnalyser();
      let source = this.context.createMediaElementSource(srcEl);
      source.connect(analyser);
      analyser.connect(this.context.destination);
      analyser.fftSize = fftSize;
      analyser.fetchTime = -1;
      analyser.frequencyData = new Uint8Array(fftSize);

      this.analysers[srcName] = analyser;

      return analyser
    },

    getByteFrequencyData: function(analyser, time) {
      if (time !== analyser.fetchTime) {
        analyser.getByteFrequencyData(analyser.frequencyData);
        analyser.fetchTime = time;
      }
      return analyser.frequencyData
    }
  });

  // 1 2 3..4 5 6 => [[1,2,3], [4,5,6]]
  const toNumber = a => Number(a);
  const parseCoords = a => a.trim().split(" ").map(toNumber);
  const isRange = a => a.includes("..");
  const parseRangeCoords = a => a.split("..").map(parseCoords);
  const lerpRange = (range, t) => {
    if (range.length < 1) { return range[0] }

    let out = [];
    const a = range[0];
    const b = range[1];

    for (let i = 0, n = Math.max(a.length, b.length); i < n; i++) {
      out[i] = THREE.Math.lerp(a[i] || 0, b[i] || 0, t);
    }

    return out
  };

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
  };

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
  };

  AFRAME.registerComponent("audio-vis", {
    schema: audioVisSchema,
    multiple: true,

    init: function () {
      this.ranges = {};
      this.analyser = this.system.getOrCreateAnalyser();
    },

    updateSchema: function (data) {
      let newRules = {};

      for (let key in data) {
        if (!(key in this.schema)) {
          newRules[key] = { type: "string", };
        }
      }

      if (!isObjectEmpty(newRules)) { 
        this.extendSchema(newRules); 
      }
    },

    update: function (oldData) {
      const data = this.data;
      for (let key in data) {
        if (!(key in audioVisSchema) && isRange(data[key])) {
          this.ranges[key] = parseRangeCoords(data[key]);
        }
      }
    },

    tick: function (time, deltaTime) {
      const data = this.data;
      const frequencyData = this.system.getByteFrequencyData(this.analyser, time);

      const bins = data.bins;
      const n = bins.length;
      let total = 0;
      for (let bin of bins) {
        total += frequencyData[bin];
      }

      let avg = total/n/255; // avg is in range range (0,1)
      let filteredAvg = avg > data.threshold ? avg : 0;
      let el = this.el;

      for (let key in this.ranges) {
        const value = lerpRange(this.ranges[key], filteredAvg);
        switch (key) {
          case "position":
          case "scale":
            el.object3D[key].set(...value);
            break
          case "rotation":
            el.object3D[key].set(...(value.map(THREE.Math.degToRad)));
            break;
          default:
            el.setAttribute(key, value.map(x => x.toFixed(4)).join(" "));
        }
      }
    },
  });

  // Copyright 2018-2019 harlyq
  // MIT license

  let cloneID = 0;

  AFRAME.registerComponent("clone-entity", {
    schema: {
      type: "selector",
    },
    multiple: true,

    update() {
      const idPostFix = "_clone";
      const template = this.data;
      let cloneEl = document.importNode(template instanceof HTMLTemplateElement ? template.content : template, true);

      const makeUniqueIDs = el => {
        if (el.id) el.id += idPostFix + cloneID;
        el.children.forEach(makeUniqueIDs);
      };
      makeUniqueIDs(cloneEl);

      this.el.appendChild(cloneEl);
      cloneID++;
    }
  });

  // @ts-nocheck Property 'object3D' does not exist on type 'HTMLElement'.ts(2339)
  // Copyright 2018-2019 harlyq
  // MIT license

  AFRAME.registerComponent("clone-geo", {
    schema: {
      type: "selector",
    },

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this); // used for models which may have a delay before loading
    },

    update(oldData) {
      if (this.data !== oldData) {
        if (oldData instanceof HTMLElement) { oldData.removeEventListener("object3dset", this.onObject3DSet); }

        const template = this.data;
        if (template instanceof HTMLElement && template.object3D) {
          template.object3D.children.forEach(a => this.el.object3D.add(a.clone()));
          this.el.object3DMap = template.object3DMap;
          template.addEventListener("object3dset", this.onObject3DSet);
        }
      }
    },

    // TODO this wont work, we need to clone, not set a reference
    onObject3DSet(evt) {
      const template = this.data;
      if (evt.target === template && evt.detail.type) {
        this.el.setObject3D(evt.detail.type, template.getObject3D(evt.detail.type));
      }
    }
  });

  // Copyright 2019 harlyq
  // MIT license

  // remix of https://github.com/supermedium/superframe/tree/master/components/gltf-part
  var LOADING_MODELS = {};
  var MODELS = {};

  AFRAME.registerComponent("gltf-part", {
    schema: {
      part: {type: "string"},
      src: {type: "asset"}
    },

    update: function () {
      var el = this.el;
      if (!this.data.part && this.data.src) { return; }
      this.getModel(function (modelPart) {
        if (!modelPart) { return; }
        el.setObject3D("mesh", modelPart);
      });
    },

    /**
     * Fetch, cache, and select from GLTF.
     *
     * @param {function(object)} cb - Called when the model is loaded
     * @returns {object} - Selected subset of model.
     */
    getModel: function (cb) {
      var self = this;

      // Already parsed, grab it.
      if (MODELS[this.data.src]) {
        cb(this.selectFromModel(MODELS[this.data.src]));
        return;
      }

      // Currently loading, wait for it.
      if (LOADING_MODELS[this.data.src]) {
        return LOADING_MODELS[this.data.src].then(function (model) {
          cb(self.selectFromModel(model));
        });
      }

      // Not yet fetching, fetch it.
      LOADING_MODELS[this.data.src] = new Promise(function (resolve) {
        new THREE.GLTFLoader().load(self.data.src, function (gltfModel) {
          var model = gltfModel.scene || gltfModel.scenes[0];
          MODELS[self.data.src] = model;
          delete LOADING_MODELS[self.data.src];
          cb(self.selectFromModel(model));
          resolve(model);
        }, function () { }, console.error);
      });
    },

    /**
     * Search for the part name and look for a mesh.
     */
    selectFromModel: function (model) {
      var part;

      part = model.getObjectByName(this.data.part);
      if (!part) {
        console.error("[gltf-part] `" + this.data.part + "` not found in model.");
        return;
      }

      return part.clone()
    }
  });

  /**
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{x: number, y: number, z: number, w: number}} QuatXYZW
   * @typedef {Float32Array | number[]} Affine4
   * @typedef {number} Radians
   * @typedef {number} Distance
   */

  /** @type {VecXYZ} */
  const ZERO = Object.freeze({x: 0, y: 0, z: 0});

  /** @type {VecXYZ} */
  const UNIT_X = Object.freeze({x: 1, y: 0, z: 0});

  /** @type {VecXYZ} */
  const UNIT_Y = Object.freeze({x: 0, y: 1, z: 0});

  /** @type {VecXYZ} */
  const UNIT_Z = Object.freeze({x: 0, y: 0, z: 1});

  /**
   * @typedef {{x: number, y: number, z: number, w: number}} QuatXYZW
   * @typedef {Float32Array | number[]} Affine4
   */

  const SQRT_1_2 = Math.sqrt(0.5);

  /** @type {QuatXYZW} */
  const IDENTITY = Object.freeze({x:0, y:0, z:0, w:1});

  /** @type {QuatXYZW} */
  const ROTATE_X_180 = Object.freeze({x:1, y:0, z:0, w:0});

  /** @type {QuatXYZW} */
  const ROTATE_Y_180 = Object.freeze({x:0, y:1, z:0, w:0});

  /** @type {QuatXYZW} */
  const ROTATE_Z_180 = Object.freeze({x:0, y:0, z:1, w:0});

  /** @type {QuatXYZW} */
  const ROTATE_X_90 = Object.freeze({x:SQRT_1_2, y:0, z:0, w:SQRT_1_2});

  /** @type {QuatXYZW} */
  const ROTATE_Y_90 = Object.freeze({x:0, y:SQRT_1_2, z:0, w:SQRT_1_2});

  /** @type {QuatXYZW} */
  const ROTATE_Z_90 = Object.freeze({x:0, y:0, z:SQRT_1_2, w:SQRT_1_2});

  /** @type {<T extends QuatXYZW>(out: T, aff: Affine4) => T} */
  function setFromUnscaledAffine4(out, aff) {
    const m11 = aff[0], m12 = aff[4], m13 = aff[8];
    const m21 = aff[1], m22 = aff[5], m23 = aff[9];
    const m31 = aff[2], m32 = aff[6], m33 = aff[10];
    const trace = m11 + m22 + m33;
    let s;

    if ( trace > 0 ) {

      s = 0.5 / Math.sqrt( trace + 1.0 );

      out.w = 0.25 / s;
      out.x = ( m32 - m23 ) * s;
      out.y = ( m13 - m31 ) * s;
      out.z = ( m21 - m12 ) * s;

    } else if ( m11 > m22 && m11 > m33 ) {

      s = 2.0 * Math.sqrt( 1.0 + m11 - m22 - m33 );

      out.w = ( m32 - m23 ) / s;
      out.x = 0.25 * s;
      out.y = ( m12 + m21 ) / s;
      out.z = ( m13 + m31 ) / s;

    } else if ( m22 > m33 ) {

      s = 2.0 * Math.sqrt( 1.0 + m22 - m11 - m33 );

      out.w = ( m13 - m31 ) / s;
      out.x = ( m12 + m21 ) / s;
      out.y = 0.25 * s;
      out.z = ( m23 + m32 ) / s;

    } else {

      s = 2.0 * Math.sqrt( 1.0 + m33 - m11 - m22 );

      out.w = ( m21 - m12 ) / s;
      out.x = ( m13 + m31 ) / s;
      out.y = ( m23 + m32 ) / s;
      out.z = 0.25 * s;

    }
    return out
  }

  /** @type {<T extends VecXYZ, TA extends Affine4, TV extends VecXYZ>(out: T, aff: TA, v: TV) => T} */
  function invertAndMultiplyVecXYZ(out, aff, v) {
    const n11 = aff[0], n21 = aff[1], n31 = aff[2];
    const n12 = aff[4], n22 = aff[5], n32 = aff[6];
    const n13 = aff[8], n23 = aff[9], n33 = aff[10];
    const tx = aff[12], ty = aff[13], tz = aff[14];

    const t11 = n33 * n22 - n32 * n23;
    const t12 = n32 * n13 - n33 * n12;
    const t13 = n23 * n12 - n22 * n13;

    const det = n11 * t11 + n21 * t12 + n31 * t13;
    const invDet = 1/det;

    // invert the rotation matrix
    const m11 = t11 * invDet;
    const m21 = ( n31 * n23 - n33 * n21 ) * invDet;
    const m31 = ( n32 * n21 - n31 * n22 ) * invDet;

    const m12 = t12 * invDet;
    const m22 = ( n33 * n11 - n31 * n13 ) * invDet;
    const m32 = ( n31 * n12 - n32 * n11 ) * invDet;

    const m13 = t13 * invDet;
    const m23 = ( n21 * n13 - n23 * n11 ) * invDet;
    const m33 = ( n22 * n11 - n21 * n12 ) * invDet;

    // apply inv(aff)*(v - t)
    const ax = v.x - tx, ay = v.y - ty, az = v.z - tz;
    out.x = m11*ax + m12*ay + m13*az;
    out.y = m21*ax + m22*ay + m23*az;
    out.z = m31*ax + m32*ay + m33*az;

    return out
  }

  /** @type {<TA extends Affine4>(aff: TA) => number} */
  function determinant(aff) {
    const n11 = aff[0], n21 = aff[1], n31 = aff[2];
    const n12 = aff[4], n22 = aff[5], n32 = aff[6];
    const n13 = aff[8], n23 = aff[9], n33 = aff[10];

    const t11 = n33 * n22 - n32 * n23;
    const t12 = n32 * n13 - n33 * n12;
    const t13 = n23 * n12 - n22 * n13;

    return n11 * t11 + n21 * t12 + n31 * t13
  }

  /** @typedef {<T extends Affine4, VP extends VecXYZ, VQ extends QuatXYZW, VS extends VecXYZ>(aff: T, outPosition: VP, outQuaterion: VQ, outScale: VS) => T} DecomposeFN */
  /** @type {DecomposeFN} */
  const decompose = (function() {
    let affCopy = new Float32Array(16);

    return /** @type {DecomposeFN} */function decompose(aff, outPosition = undefined, outQuaternion = undefined, outScale = undefined) {
      if (outPosition) {
        outPosition.x = aff[12];
        outPosition.y = aff[13];
        outPosition.z = aff[14];
      }
    
      if (outScale || outQuaternion) {
        const sx = Math.hypot(aff[0], aff[1], aff[2]);
        const sy = Math.hypot(aff[4], aff[5], aff[6]);
        const sz = Math.hypot(aff[8], aff[9], aff[10]);
      
        if (outScale) {
          outScale.x = sx;
          outScale.y = sy;
          outScale.z = sz;
        }
      
        if (outQuaternion) {
          const det = determinant(aff);
          const invSX = det < 0 ? -1/sx : 1/sx; // invert scale on one axis for negative determinant
          const invSY = 1/sy;
          const invSZ = 1/sz;
    
          affCopy.set(aff);
          affCopy[0] *= invSX;
          affCopy[1] *= invSX;
          affCopy[2] *= invSX;
          affCopy[4] *= invSY;
          affCopy[5] *= invSY;
          affCopy[6] *= invSY;
          affCopy[8] *= invSZ;
          affCopy[9] *= invSZ;
          affCopy[10] *= invSZ;
    
          setFromUnscaledAffine4(outQuaternion, affCopy);
        }
      }
    
      return aff
    }  
  })();

  /**
   * @typedef {{r: number, g: number, b: number}} RGBColor
   */

  /** @type {<T>(list: T[], randFn: () => number) => T} */
  function entry(list, randFn = Math.random) {
    return list[ index(list.length, randFn) ]
  }

  /** @type {(length: number, randFn: () => number) => number} */
  function index(length, randFn = Math.random) {
    return ~~(randFn()*length)
  }

  // range is (min,max]
  /** @type {(min: number, max: number, randFn: () => number) => number} */
  function float(min, max, randFn = Math.random) {
    if (max === min) return min
    return randFn()*(max - min) + min
  }

  // in RGB space. TODO rgbMax should be a valid result
  /** @type {<T extends RGBColor, RN extends RGBColor, RX extends RGBColor>(out: T, rgbMin: RN, rgbMax: RX, randFn: () => number) => T} */
  function color(out, rgbMin, rgbMax, randFn = Math.random) {
    out.r = float(rgbMin.r, rgbMax.r, randFn);
    out.g = float(rgbMin.g, rgbMax.g, randFn);
    out.b = float(rgbMin.b, rgbMax.b, randFn);
    return out
  }

  /** @type {(out: number[], vecMin: number[], vecMax: number[], randFn: () => number) => number[]} */
  function vector(out, vecMin, vecMax, randFn = Math.random) {
    const lengthOfMin = vecMin.length;
    const lengthOfMax = vecMax.length;
    const m = Math.min(lengthOfMin, lengthOfMax);
    out.length = Math.max(lengthOfMin, lengthOfMax);

    for (let i = 0; i < m; i++) {
      out[i] = float(vecMin[i], vecMax[i], randFn);
    }

    if (lengthOfMax > lengthOfMin) {
      for (let i = m; i < lengthOfMax; i++) {
        out[i] = vecMax[i];
      }
    } else {
      for (let i = m; i < lengthOfMin; i++) {
        out[i] = vecMin[i];
      }
    }
    return out
  }

  // https://en.wikipedia.org/wiki/Linear_congruential_generator
  function lcg() {
    let seed = -1;
    
    /** @type {(s: number) => void}*/
    function setSeed(s) {
      seed = s;
    }

    /** @type {() => number} */
    function random() {
      if (seed < 0) {
        return Math.random()
      }
    
      seed = (1664525*seed + 1013904223) % 0x100000000;
      return seed/0x100000000
    }
    
    return {
      setSeed,
      random,
    }
  }

  /** @type {(v: number, min: number, max: number) => number} */
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v
  }

  /** @type {(v: number, m: number) => number} */
  function euclideanModulo(v, m) {
    return ( ( v % m ) + m ) % m  
  }

  // returns a value from a 'root' and an array of 'properties', each property is considered the child of the previous property
  /** @type {(root: {[key: string]: any}, properties: string[]) => any} */
  function getWithPath(root, properties) {
    let path = root;
    let parts = properties.slice().reverse();
    while (path && parts.length > 0) {
      path = path[parts.pop()];
    }

    return path
  }

  // remix of https://github.com/mrdoob/three.js/blob/master/src/math/Color.js

  /**
   * @typedef {{r:number, g:number, b:number}} RGBColor
   * @typedef {{r:number, g:number, b:number, a:number}} RGBAColor
   */

  /** @type {(a: any) => boolean} */
  function isColor(a) {
    return "r" in a && "g" in a && "b" in a
  }

  /** @type {<T extends RGBColor>(out: T, hex: number) => T} */
  function setHex(out, hex) {
    out.r = ( hex >> 16 & 255 )/255;
    out.g = ( hex >> 8 & 255 )/255;
    out.b = ( hex & 255 )/255;
    return out
  }

  /** @typedef {<T extends RGBColor>(out: T, h: number, s: number, l: number) => T} SetHSLFn */
  /** @type {SetHSLFn} */
  const setHSL = (function () {
    /**
     * @param {number} p 
     * @param {number} q 
     * @param {number} t 
     */
    function hue2rgb( p, q, t ) {
      if ( t < 0 ) t += 1;
      if ( t > 1 ) t -= 1;
      if ( t < 1 / 6 ) return p + ( q - p ) * 6 * t;
      if ( t < 1 / 2 ) return q;
      if ( t < 2 / 3 ) return p + ( q - p ) * 6 * ( 2 / 3 - t );
      return p;
    }

    return /** @type {SetHSLFn} */ function setHSL(out, h, s, l) {
      // h,s,l ranges are in 0.0 - 1.0
      h = euclideanModulo( h, 1 );
      s = clamp( s, 0, 1 );
      l = clamp( l, 0, 1 );

      if ( s === 0 ) {
        out.r = out.g = out.b = l;
      } else {
        let p = l <= 0.5 ? l * ( 1 + s ) : l + s - ( l * s );
        let q = ( 2 * l ) - p;

        out.r = hue2rgb( q, p, h + 1 / 3 );
        out.g = hue2rgb( q, p, h );
        out.b = hue2rgb( q, p, h - 1 / 3 );
      }

      return out;
    }
  })();

  /** @type {<TA extends RGBColor>(a: TA) => number} */
  function toHex(a) {
    return (a.r*255) << 16 ^ (a.g*255) << 8 ^ (a.b*255) << 0
  }

  /** @type {<TA extends RGBColor>(a: TA) => string} */
  function toString(a) {
    // @ts-ignore padStart()
    return "#" + toHex(a).toString(16).padStart(6, '0')
  }

  function toArray(out, x) {
    out[0] = x.r;
    out[1] = x.g;
    out[2] = x.b;
    if (typeof x.a !== "undefined") out[3] = x.a;
    return out
  }

  // remix of https://github.com/mrdoob/three.js/blob/master/src/math/Color.js
  /** @type {Object.<string, number>} */
  const COLOR_KEYWORDS = { 'aliceblue': 0xF0F8FF, 'antiquewhite': 0xFAEBD7, 'aqua': 0x00FFFF, 'aquamarine': 0x7FFFD4, 'azure': 0xF0FFFF,
  	'beige': 0xF5F5DC, 'bisque': 0xFFE4C4, 'black': 0x000000, 'blanchedalmond': 0xFFEBCD, 'blue': 0x0000FF, 'blueviolet': 0x8A2BE2,
  	'brown': 0xA52A2A, 'burlywood': 0xDEB887, 'cadetblue': 0x5F9EA0, 'chartreuse': 0x7FFF00, 'chocolate': 0xD2691E, 'coral': 0xFF7F50,
  	'cornflowerblue': 0x6495ED, 'cornsilk': 0xFFF8DC, 'crimson': 0xDC143C, 'cyan': 0x00FFFF, 'darkblue': 0x00008B, 'darkcyan': 0x008B8B,
  	'darkgoldenrod': 0xB8860B, 'darkgray': 0xA9A9A9, 'darkgreen': 0x006400, 'darkgrey': 0xA9A9A9, 'darkkhaki': 0xBDB76B, 'darkmagenta': 0x8B008B,
  	'darkolivegreen': 0x556B2F, 'darkorange': 0xFF8C00, 'darkorchid': 0x9932CC, 'darkred': 0x8B0000, 'darksalmon': 0xE9967A, 'darkseagreen': 0x8FBC8F,
  	'darkslateblue': 0x483D8B, 'darkslategray': 0x2F4F4F, 'darkslategrey': 0x2F4F4F, 'darkturquoise': 0x00CED1, 'darkviolet': 0x9400D3,
  	'deeppink': 0xFF1493, 'deepskyblue': 0x00BFFF, 'dimgray': 0x696969, 'dimgrey': 0x696969, 'dodgerblue': 0x1E90FF, 'firebrick': 0xB22222,
  	'floralwhite': 0xFFFAF0, 'forestgreen': 0x228B22, 'fuchsia': 0xFF00FF, 'gainsboro': 0xDCDCDC, 'ghostwhite': 0xF8F8FF, 'gold': 0xFFD700,
  	'goldenrod': 0xDAA520, 'gray': 0x808080, 'green': 0x008000, 'greenyellow': 0xADFF2F, 'grey': 0x808080, 'honeydew': 0xF0FFF0, 'hotpink': 0xFF69B4,
  	'indianred': 0xCD5C5C, 'indigo': 0x4B0082, 'ivory': 0xFFFFF0, 'khaki': 0xF0E68C, 'lavender': 0xE6E6FA, 'lavenderblush': 0xFFF0F5, 'lawngreen': 0x7CFC00,
  	'lemonchiffon': 0xFFFACD, 'lightblue': 0xADD8E6, 'lightcoral': 0xF08080, 'lightcyan': 0xE0FFFF, 'lightgoldenrodyellow': 0xFAFAD2, 'lightgray': 0xD3D3D3,
  	'lightgreen': 0x90EE90, 'lightgrey': 0xD3D3D3, 'lightpink': 0xFFB6C1, 'lightsalmon': 0xFFA07A, 'lightseagreen': 0x20B2AA, 'lightskyblue': 0x87CEFA,
  	'lightslategray': 0x778899, 'lightslategrey': 0x778899, 'lightsteelblue': 0xB0C4DE, 'lightyellow': 0xFFFFE0, 'lime': 0x00FF00, 'limegreen': 0x32CD32,
  	'linen': 0xFAF0E6, 'magenta': 0xFF00FF, 'maroon': 0x800000, 'mediumaquamarine': 0x66CDAA, 'mediumblue': 0x0000CD, 'mediumorchid': 0xBA55D3,
  	'mediumpurple': 0x9370DB, 'mediumseagreen': 0x3CB371, 'mediumslateblue': 0x7B68EE, 'mediumspringgreen': 0x00FA9A, 'mediumturquoise': 0x48D1CC,
  	'mediumvioletred': 0xC71585, 'midnightblue': 0x191970, 'mintcream': 0xF5FFFA, 'mistyrose': 0xFFE4E1, 'moccasin': 0xFFE4B5, 'navajowhite': 0xFFDEAD,
  	'navy': 0x000080, 'oldlace': 0xFDF5E6, 'olive': 0x808000, 'olivedrab': 0x6B8E23, 'orange': 0xFFA500, 'orangered': 0xFF4500, 'orchid': 0xDA70D6,
  	'palegoldenrod': 0xEEE8AA, 'palegreen': 0x98FB98, 'paleturquoise': 0xAFEEEE, 'palevioletred': 0xDB7093, 'papayawhip': 0xFFEFD5, 'peachpuff': 0xFFDAB9,
  	'peru': 0xCD853F, 'pink': 0xFFC0CB, 'plum': 0xDDA0DD, 'powderblue': 0xB0E0E6, 'purple': 0x800080, 'rebeccapurple': 0x663399, 'red': 0xFF0000, 'rosybrown': 0xBC8F8F,
  	'royalblue': 0x4169E1, 'saddlebrown': 0x8B4513, 'salmon': 0xFA8072, 'sandybrown': 0xF4A460, 'seagreen': 0x2E8B57, 'seashell': 0xFFF5EE,
  	'sienna': 0xA0522D, 'silver': 0xC0C0C0, 'skyblue': 0x87CEEB, 'slateblue': 0x6A5ACD, 'slategray': 0x708090, 'slategrey': 0x708090, 'snow': 0xFFFAFA,
  	'springgreen': 0x00FF7F, 'steelblue': 0x4682B4, 'tan': 0xD2B48C, 'teal': 0x008080, 'thistle': 0xD8BFD8, 'tomato': 0xFF6347, 'turquoise': 0x40E0D0,
    'violet': 0xEE82EE, 'wheat': 0xF5DEB3, 'white': 0xFFFFFF, 'whitesmoke': 0xF5F5F5, 'yellow': 0xFFFF00, 'yellowgreen': 0x9ACD32 };

  const COLOR_REGEX = /^((?:rgb|hsl)a?)\(\s*([^\)]*)\)/;

  /** @type {(str: string) => RGBColor | RGBAColor} */
  function parse(str) {
    let m;

    if ( m = COLOR_REGEX.exec( str ) ) {

      // rgb / hsl
      let color;
      const name = m[ 1 ];
      const components = m[ 2 ];

      switch ( name ) {

        case 'rgb':
        case 'rgba':

          if ( color = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec( components ) ) {

            // rgb(255,0,0) rgba(255,0,0,0.5)
            return {
              r: Math.min( 255, parseInt( color[ 1 ], 10 ) ) / 255,
              g: Math.min( 255, parseInt( color[ 2 ], 10 ) ) / 255,
              b: Math.min( 255, parseInt( color[ 3 ], 10 ) ) / 255,
              a: color[5] ? parseFloat( color[5] ) : undefined,
            }
          }

          if ( color = /^(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec( components ) ) {

            // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
            return {
              r: Math.min( 100, parseInt( color[ 1 ], 10 ) ) / 100,
              g: Math.min( 100, parseInt( color[ 2 ], 10 ) ) / 100,
              b: Math.min( 100, parseInt( color[ 3 ], 10 ) ) / 100,
              a: color[5] ? parseFloat( color[5] ) : undefined,
            }
          }
          break;

        case 'hsl':
        case 'hsla':

          if ( color = /^([0-9]*\.?[0-9]+)\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec( components ) ) {

            // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
            const rgba = setHSL({r:0,g:0,b:0,a:0}, parseFloat( color[ 1 ] )/360, parseInt( color[ 2 ], 10 )/100, parseInt( color[ 3 ], 10 )/100);
            rgba.a = color[5] ? parseFloat( color[5] ) : undefined;
            return rgba
          }
          break;

      }

    } else if ( m = /^\#([A-Fa-f0-9]+)$/.exec( str ) ) {

      // hex color
      const hex = m[ 1 ];
      const size = hex.length;

      if ( size === 3 ) {

        // #ff0
        return {
          r: parseInt( hex.charAt( 0 ) + hex.charAt( 0 ), 16 ) / 255,
          g: parseInt( hex.charAt( 1 ) + hex.charAt( 1 ), 16 ) / 255,
          b: parseInt( hex.charAt( 2 ) + hex.charAt( 2 ), 16 ) / 255,
        }

      } else if ( size === 6 ) {

        // #ff0000
        return {
          r: parseInt( hex.charAt( 0 ) + hex.charAt( 1 ), 16 ) / 255,
          g: parseInt( hex.charAt( 2 ) + hex.charAt( 3 ), 16 ) / 255,
          b: parseInt( hex.charAt( 4 ) + hex.charAt( 5 ), 16 ) / 255,
        }
      }
    }

    if ( str && str.length > 0 ) {
      // color keywords
      const hex = COLOR_KEYWORDS[ str ];

      if ( hex !== undefined ) {
        return setHex({r:0,g:0,b:0}, hex)
      }
    }
  }

  /**
   * @typedef {{r: number, g: number, b: number}} RGBColor
   * @typedef {number[] | RGBColor | string} AttributePart
   * @typedef {{range?: AttributePart[], options?: AttributePart[]}} Attribute
   */

  /** @type {(str: string) => Attribute} */
  function parse$1(str) {
    const rangeOptions = parseRangeOptions(str);
    if (rangeOptions.range) {
      return { range: rangeOptions.range.map(part => parsePart(part)) }
    } else {
      return { options: rangeOptions.options.map(part => parsePart(part)) }
    }
  }

  /** @typedef {(str: string) => AttributePart} ParsePartFn */
  /** @type {ParsePartFn} */
  const parsePart = (function() {
    const toNumber = str => Number(str.trim());
    
    return /** @type {ParsePartFn} */function parsePart(str) {
      if (str === "") {
        return ""
      }

      let vec = str.split(" ").filter(x => x !== "").map(toNumber);
      if (!vec.some(isNaN)) {
        return vec
      }
    
      let col = parse(str.trim());
      if (col) {
        return col
      }
    
      return str.trim()
    }
  })();


  // Convert a string "1..3" into {range: ["1","3"]}
  // Convert a string "1|2|3" into {options: ["1","2","3"]}
  /** @type {(str: string) => {options?: string[], range?: string[]}} */
  function parseRangeOptions(str) {
    const options = str.split("|");
    if (options.length > 1) {
      return { options }
    }

    const range = str.split("..");
    if (range.length > 1) {
      return { range: [ range[0], range[1] ] } 
    }

    return { options }
  }

  /** @typedef {(att: Attribute, randFn: () => number) => AttributePart} RandomizeFn */
  /** @type {RandomizeFn} */
  const randomize = (function() {
    let col = {r: 0, g: 0, b: 0};
    let vec = [];

    return /** @type {RandomizeFn} */ function randomize(attr, randFn = Math.random) {
      if (attr.range) {
        const min = attr.range[0];
        const max = attr.range[1];

        if (isColor(min)) {
          return color(col, /** @type {RGBColor} */ (min), /** @type {RGBColor} */ (max))
        } else if (Array.isArray(min) && min.length > 0 && typeof min[0] === "number") {
          return vector(vec, /** @type {number[]} */ (min), /** @type {number[]} */ (max))
        // } else if (typeof min === "number") {
        //   return pseudorandom.float(min, max) // not needed all numbers should be in a float array
        } else {
          return min
        }
        
      } else if (attr.options) {
        return entry(attr.options, randFn)
      }
    }

  })();

  /** @type {(attr: any) => string} */
  function stringify(attr) {
    if (typeof attr === "object") {
      if (attr.range) { return stringify(attr.range[0]) + ".." + stringify(attr.range[1]) }
      if (attr.options) { return attr.options.map(option => stringify(option)).join("|") }
      if (isColor(attr)) { return toString(attr) }
      if ("x" in attr && "y" in attr) { return attr.x + " " + attr.y + ("z" in attr ? " " + attr.z : "") }
      if (attr.length && "0" in attr) { return typeof attr[0] === "number" ? attr.join(" ") : attr.join(",") }
    }
    return attr.toString()
  }

  // splits a string by the separator, but ignores separators that are nested within
  // characters listed in nestedChars
  // e.g. nestedSplit(str, ",", ["''", '""', "{}", "[]"])
  function nestedSplit(str, separator = ",", nestedChars = ["''", '""', "{}", "[]", "()"]) {
    let split = [];
    let stack = [];
    let startI = 0; // position of current token
    let k = 0; // separator index

    for (let i = 0, n = str.length; i < n; i++) {
      const c = str[i];
      if (stack.length > 0 && c === stack[stack.length - 1][1]) {
        stack.pop(); // new nested chars started
      } else {
        for (let nest of nestedChars) {
          if (c === nest[0]) {
            stack.push(nest); // last nested chars completed
          }
        }
      }

      if (stack.length === 0 && c === separator[k]) {
        // no nested chars and separator found
        if (++k === separator.length) {
          // separator complete
          split.push(str.substring(startI, i - k + 1));
          startI = i + 1;
          k = 0;
        }
      } else {
        k = 0; // reset the separator match
      }
    }

    split.push(str.substring(startI, str.length));
    return split
  }

  /**
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{min: VecXYZ, max: VecXYZ}} Extent
   * @typedef {number} Distance
   */

  /** @type {<TE extends Extent>(ext: TE) => number} */
  function volume(ext) {
    return (ext.max.x - ext.min.x)*(ext.max.y - ext.min.y)*(ext.max.z - ext.min.z)
  }

  /** @type {(a: number, b: number, t: number) => number} */
  function lerp(a, b, t) {
    return a + (b - a)*t
  }

  /** @type {<TA extends {[key: string]: number}>(a: TA, b: {[key: string]: number}, t: number) => TA} */
  function lerpObject(a, b, t) {
    let out = Object.assign({}, a); // copy values from a in case the keys do not exist in b
    for (let k in b) {
      out[k] = typeof a[k] !== "undefined" ? lerp(a[k], b[k], t) : b[k];
    }
    return out
  }

  /** @type {<TA extends number[] | Float32Array, TB extends number[] | Float32Array>(a: TA, b: TB, t: number) => number[]} */
  function lerpArray(a, b, t) {
    let out = Array.from(a);
    for (let i = 0; i < b.length; i++) {
      out[i] = typeof a[i] !== "undefined" ? lerp(a[i], b[i], t) : b[i];
    }
    return out
  }

  // remix of https://github.com/tweenjs/tween.js/blob/master/src/Tween.js

  function Linear(k) {
    return k
  }

  const Quadratic = {
    In: function (k) {
      return k * k
    },
    Out: function (k) {
      return k * (2 - k)
    },
    InOut: function (k) {
      if ((k *= 2) < 1) {
        return 0.5 * k * k
      }
      return - 0.5 * (--k * (k - 2) - 1)
    }
  };
    
  const Cubic = {
    In: function (k) {
      return k * k * k
    },
    Out: function (k) {
      return --k * k * k + 1
    },
    InOut: function (k) {
      if ((k *= 2) < 1) {
        return 0.5 * k * k * k
      }
      return 0.5 * ((k -= 2) * k * k + 2)
    }
  };
    
  const Quartic = {
    In: function (k) {
      return k * k * k * k
    },
    Out: function (k) {
      return 1 - (--k * k * k * k)
    },
    InOut: function (k) {
      if ((k *= 2) < 1) {
        return 0.5 * k * k * k * k
      }
      return - 0.5 * ((k -= 2) * k * k * k - 2)
    }
  };
    
  const Quintic = {
    In: function (k) {
      return k * k * k * k * k
    },
    Out: function (k) {
      return --k * k * k * k * k + 1
    },
    InOut: function (k) {
      if ((k *= 2) < 1) {
        return 0.5 * k * k * k * k * k
      }
      return 0.5 * ((k -= 2) * k * k * k * k + 2)
    }
  };

  const Sinusoidal = {
    In: function (k) {
      return 1 - Math.cos(k * Math.PI / 2)
    },
    Out: function (k) {
      return Math.sin(k * Math.PI / 2)
    },
    InOut: function (k) {
      return 0.5 * (1 - Math.cos(Math.PI * k))
    }
  };

  const Exponential = {
    In: function (k) {
      return k === 0 ? 0 : Math.pow(1024, k - 1)
    },
    Out: function (k) {
      return k === 1 ? 1 : 1 - Math.pow(2, - 10 * k)
    },
    InOut: function (k) {
      if (k === 0) {
        return 0
      }
      if (k === 1) {
        return 1
      }
      if ((k *= 2) < 1) {
        return 0.5 * Math.pow(1024, k - 1)
      }
      return 0.5 * (- Math.pow(2, - 10 * (k - 1)) + 2)
    }
  };

  const Circular = {
    In: function (k) {
      return 1 - Math.sqrt(1 - k * k)
    },
    Out: function (k) {
      return Math.sqrt(1 - (--k * k))
    },
    InOut: function (k) {
      if ((k *= 2) < 1) {
        return - 0.5 * (Math.sqrt(1 - k * k) - 1)
      }
      return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1)
    }
  };

  const Elastic = {
    In: function (k) {
      if (k === 0) {
        return 0
      }
      if (k === 1) {
        return 1
      }
      return -Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI)
    },
    Out: function (k) {
      if (k === 0) {
        return 0
      }
      if (k === 1) {
        return 1
      }
      return Math.pow(2, -10 * k) * Math.sin((k - 0.1) * 5 * Math.PI) + 1
    },
    InOut: function (k) {
      if (k === 0) {
        return 0
      }
      if (k === 1) {
        return 1
      }
      k *= 2;
      if (k < 1) {
        return -0.5 * Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI)
      }
      return 0.5 * Math.pow(2, -10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI) + 1
    }
  };

  const Back = {
    In: function (k) {
      var s = 1.70158;
      return k * k * ((s + 1) * k - s)
    },
    Out: function (k) {
      var s = 1.70158;
      return --k * k * ((s + 1) * k + s) + 1
    },
    InOut: function (k) {
      var s = 1.70158 * 1.525;
      if ((k *= 2) < 1) {
        return 0.5 * (k * k * ((s + 1) * k - s))
      }
      return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2)
    }
  };

  const Bounce = {
    In: function (k) {
      return 1 - Bounce.Out(1 - k)
    },
    Out: function (k) {
      if (k < (1 / 2.75)) {
        return 7.5625 * k * k
      } else if (k < (2 / 2.75)) {
        return 7.5625 * (k -= (1.5 / 2.75)) * k + 0.75
      } else if (k < (2.5 / 2.75)) {
        return 7.5625 * (k -= (2.25 / 2.75)) * k + 0.9375
      } else {
        return 7.5625 * (k -= (2.625 / 2.75)) * k + 0.984375
      }
    },
    InOut: function (k) {
      if (k < 0.5) {
        return Bounce.In(k * 2) * 0.5
      }
      return Bounce.Out(k * 2 - 1) * 0.5 + 0.5
    }
  };

  const EASING_FUNCTIONS = {
    'linear': Linear,

    'ease': Cubic.InOut,
    'ease-in': Cubic.In,
    'ease-out': Cubic.Out,
    'ease-in-out': Cubic.InOut,

    'ease-cubic': Cubic.In,
    'ease-in-cubic': Cubic.In,
    'ease-out-cubic': Cubic.Out,
    'ease-in-out-cubic': Cubic.InOut,

    'ease-quad': Quadratic.InOut,
    'ease-in-quad': Quadratic.In,
    'ease-out-quad': Quadratic.Out,
    'ease-in-out-quad': Quadratic.InOut,

    'ease-quart': Quartic.InOut,
    'ease-in-quart': Quartic.In,
    'ease-out-quart': Quartic.Out,
    'ease-in-out-quart': Quartic.InOut,

    'ease-quint': Quintic.InOut,
    'ease-in-quint': Quintic.In,
    'ease-out-quint': Quintic.Out,
    'ease-in-out-quint': Quintic.InOut,

    'ease-sine': Sinusoidal.InOut,
    'ease-in-sine': Sinusoidal.In,
    'ease-out-sine': Sinusoidal.Out,
    'ease-in-out-sine': Sinusoidal.InOut,

    'ease-expo': Exponential.InOut,
    'ease-in-expo': Exponential.In,
    'ease-out-expo': Exponential.Out,
    'ease-in-out-expo': Exponential.InOut,

    'ease-circ': Circular.InOut,
    'ease-in-circ': Circular.In,
    'ease-out-circ': Circular.Out,
    'ease-in-out-circ': Circular.InOut,

    'ease-elastic': Elastic.InOut,
    'ease-in-elastic': Elastic.In,
    'ease-out-elastic': Elastic.Out,
    'ease-in-out-elastic': Elastic.InOut,

    'ease-back': Back.InOut,
    'ease-in-back': Back.In,
    'ease-out-back': Back.Out,
    'ease-in-out-back': Back.InOut,

    'ease-bounce': Bounce.InOut,
    'ease-in-bounce': Bounce.In,
    'ease-out-bounce': Bounce.Out,
    'ease-in-out-bounce': Bounce.InOut,
  };

  // Returns the distance between pointA and the surface of boxB. Negative values indicate
  // that pointA is inside of boxB
  /** @typedef {<PA extends VecXYZ, BN extends VecXYZ, BX extends VecXYZ>(pointA: PA, boxBMin: BN, boxBMax: BX, affineB: Affine4) => number} PointToBoxFn */
  /** @type {PointToBoxFn} */
  const pointToBox = (function() {
    let vertA = {x:0,y:0,z:0};
    let scaleA = {x:1,y:1,z:1};

    return /** @type {PointToBoxFn} */function pointToBox(pointA, boxBMin, boxBMax, affineB) {
      decompose( affineB, undefined, undefined, scaleA );
      invertAndMultiplyVecXYZ( vertA, affineB, pointA );
      const vx = vertA.x, vy = vertA.y, vz = vertA.z;
      const minx = boxBMin.x - vx, miny = boxBMin.y - vy, minz = boxBMin.z - vz;
      const maxx = vx - boxBMax.x, maxy = vy - boxBMax.y, maxz = vz - boxBMax.z;
      const dx = Math.max(maxx, minx)*scaleA.x;
      const dy = Math.max(maxy, miny)*scaleA.y;
      const dz = Math.max(maxz, minz)*scaleA.z;

      // for points inside (dx and dy and dz < 0) take the smallest distent to an edge, otherwise
      // determine the hypotenuese to the outside edges
      return dx <= 0 && dy <= 0 && dz <= 0 ? Math.max(dx, dy, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz))
    }
  })();

  // Breaks a selector string into {type, id, classes, attrs}
  /** @type { (str: string) => {type: string, id: string, classes: string[], attrs: {[key: string]: string}} } */
  function parse$2(str) {
    let results = {type: "", id: "", classes: [], attrs: {}};
    let token = "type";
    let tokenStart = 0;
    let lastAttr = "";

    /** @type {(newToken: string, i: number) => void} */
    function setToken(newToken, i) {
      let tokenValue = str.slice(tokenStart, i);

      if (i > tokenStart) {
        switch (token) {
          case "type":
            results.type = tokenValue;
            break
          case "id":
            results.id = tokenValue;
            break
          case "class":
            results.classes.push(tokenValue);
            break
          case "attr":
            lastAttr = tokenValue;
            break
          case "value":
            if (lastAttr) {
              results.attrs[lastAttr] = tokenValue;
            }
            break
          case "none":
          case "end":
            break
        }
      }

      token = newToken;
      tokenStart = i + 1; // ignore the token character
    }

    for (let i = 0, n = str.length; i < n; i++) {
      const c = str[i];
      switch (c) {
        case "\\": i++; break // escape the next character
        case "#": if (token !== "attr" && token !== "value") setToken("id", i); break
        case ".": if (token !== "attr" && token !== "value") setToken("class", i); break
        case "[": if (token !== "attr" && token !== "value") setToken("attr", i); break
        case "]": if (token === "attr" || token === "value") setToken("none", i); break
        case "=": if (token === "attr") setToken("value", i); break
      }
    }
    setToken("end", str.length);

    return results
  }

  /**
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{min: VecXYZ, max: VecXYZ}} Extent
   * 
   */

   /** @type {(rootObject3D: object, canvas: object) => void} */
  function updateMaterialsUsingThisCanvas(rootObject3D, canvas) {
    rootObject3D.traverse((node) => {
      if (node.material) {
        for (let map of ["map", "alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap", "envMap", "lighMap", "metalnessMap", "normalMap", "roughnessMap"]) {
          if (node.material[map] && node.material[map].image === canvas) {
            node.material[map].needsUpdate = true;
          }
        }

        if (node.material.uniforms) {
          for (let key in node.material.uniforms) {
            const uniform = node.material.uniforms[key];
            if (uniform.value && typeof uniform.value === "object" && uniform.value.image === canvas) {
              uniform.value.needsUpdate = true;
            }
          }
        }
      }
    });
  }

  /** @typedef {<T extends Extent>(out: T, object3D: object) => T} SetFromObject3DFn */
  /** @type {SetFromObject3DFn} */
  const setFromObject3D = (function() {
    // @ts-ignore
    let tempPosition = new THREE.Vector3();
    // @ts-ignore
    let tempQuaternion = new THREE.Quaternion();
    // @ts-ignore
    let tempScale = new THREE.Vector3();
    // @ts-ignore
    let tempBox3 = new THREE.Box3();

    return /** @type {SetFromObject3DFn} */function setFromObject3D(ext, object3D) {
      if (object3D.children.length === 0) {
        return ext
      }

      // HACK we force the worldmatrix to identity for the object, so we can get a bounding box
      // based around the origin
      tempPosition.copy(object3D.position);
      tempQuaternion.copy(object3D.quaternion);
      tempScale.copy(object3D.scale);

      object3D.position.set(0,0,0);
      object3D.quaternion.set(0,0,0,1);
      object3D.scale.set(1,1,1);

      tempBox3.setFromObject(object3D); // expensive for models
      // ext.setFromObject(object3D) // expensive for models

      object3D.position.copy(tempPosition);
      object3D.quaternion.copy(tempQuaternion);
      object3D.scale.copy(tempScale);
      object3D.updateMatrixWorld(true);

      ext.min.x = tempBox3.min.x;
      ext.min.y = tempBox3.min.y; 
      ext.min.z = tempBox3.min.z; 
      ext.max.x = tempBox3.max.x; 
      ext.max.y = tempBox3.max.y; 
      ext.max.z = tempBox3.max.z; 

      return ext
    }
  })();

  // Copyright 2018-2019 harlyq
  // MIT license

  // stringifies an object, specifically sets colors as hexstrings and coordinates as space separated numbers
  function convertToString(thing) {
    if (typeof thing == "object") {
      if (Array.isArray(thing)) {
        return thing.map(convertToString)
      }

      if ("r" in thing && "g" in thing && "b" in thing) {
        return toString(thing)
      }

      if ("x" in thing && "y" in thing || "z" in thing || "w" in thing) {
        return AFRAME.utils.coordinates.stringify(thing)
      }
    }

    return thing.toString()
  }


  // *value* can be boolean, string, color or array of numbers
  const setProperty = (() => {
    const trim = x => x.trim();
    const OBJECT3D_FAST_SET = {
      "rotation": x => isNaN(x) ? 0 : THREE.Math.degToRad(x),
      "position": x => isNaN(x) ? 0 : x,
      "scale": x => isNaN(x) ? 1 : x,
    };
    
    return function setProperty(target, prop, value) {
      let fn = OBJECT3D_FAST_SET[prop];
      if (fn) {
        if (Array.isArray(value)) ; else if (typeof value === "object") {
          value = [value.x, value.y, value.z];
        } else {
          value = value.split(" ").map(trim);
        }
        value.length = 3;
        target.object3D[prop].set(...value.map(fn));
        return
      }
    
      const parts = prop.split(".");
      if (parts.length <= 2) {
        // component or component.property
        parts[0] = parts[0].replace(/[A-Z]/g, x => "-" + x.toLowerCase()); // convert component names from camelCase to kebab-case
        if (value) {
          AFRAME.utils.entity.setComponentProperty(target, parts.join("."), convertToString(value)); // does this work for vectors??
        } else {
          target.removeAttribute(parts.join("."));
        }
        return
      }
    
      // e.g. object3dmap.mesh.material.uniforms.color
      const path = getWithPath(target, parts);
      if (path) {
        // this only works for boolean, string, color and an array of one element
        path[prop] = Array.isArray(value) && value.length === 1 ? value[0] : value;
      } else {
        console.warn(`unknown path for setProperty() '${prop}'`);
      }
    }   
    
  })();

  // Copyright 2018-2019 harlyq

  const MAX_FRAME_TIME_MS = 100;

  // Takes a set of keys (from randomRules()), and provides an interpolated value, where r is 0 (first key) to 1 (last key)
  // e.g. [[1,2,3],[5,6],[7.5]] @ r = 0.25 becomes [3,4,3]
  function lerpKeys(type, keys, r, easingFn = Linear) {
    const n = keys.length;

    if (r <= 0 || n <= 1) {
      return keys[0]
    } else if (r >= 1) {
      return keys[n - 1]
    }

    const k = r*(n - 1);
    const i = ~~k;
    const t = easingFn(k - i);
    switch (type) {
      case "object": return lerpObject(keys[i], keys[i+1], t)
      case "vector": return lerpArray(keys[i], keys[i+1], t)
      case "number": return lerp(keys[i], keys[i+1], t)
      default: return keys[i]
    }
  }

  // const EPSILON = 1e-4
  // console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0)[0] - 1) < EPSILON )
  // console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.5)[0] - 2) < EPSILON )
  // console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.25)[0] - 1.5) < EPSILON )
  // console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 0.75)[0] - 2.5) < EPSILON )
  // console.assert( Math.abs(lerpKeys("vector", [[1],[2],[3]], 1)[0] - 3) < EPSILON )
  // console.assert( Math.abs(lerpKeys("vector", [[1,2,3],[4,5,6],[7,8,9]], 0.75)[1] - 6.5) < EPSILON )
  // console.assert( Math.abs(lerpKeys("object", [{r:0,g:0,b:0},{r:1,g:1,b:1}], 0.5).r - 0.5) < EPSILON )
  // console.assert( lerpKeys("string", ["a","b","c"], 0) === "a" )
  // console.assert( lerpKeys("string", ["a","b","c"], 1) === "c" )
  // console.assert( lerpKeys("string", ["a","b","c"], 0.25) === "a" )
  // console.assert( lerpKeys("string", ["a","b","c"], 0.75) === "b" )


  function getPropertyAsString(target, prop) {
    const parts = prop.split(".");
    if (parts.length <= 2) {
      return convertToString(AFRAME.utils.entity.getComponentProperty(target, prop))
    }

    // e.g. object3dmap.mesh.material.uniforms.color
    const path = getWithPath(target, parts);
    if (path) {
      return convertToString(path[prop])
    } else {
      console.warn(`unknown path for getProperty() '${prop}'`);
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
      this.lcg = lcg();

      this.loopTime = 0; // seconds
      this.loops = 0;
      this.keys = {};
      this.rules = {};
    },

    updateSchema(newData) {
      const originalSchema = AFRAME.components[this.name].schema;
      let newSchema = {}; // everything that has changed from the ORIGINAL schema

      // add new rules
      for (let prop in newData) {
        if (!(prop in originalSchema)) {
          newSchema[prop] = { type: "string" };
        }
      }

      // extend the schema so the new rules appear in the inspector
      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    update(oldData) {
      const data = this.data;
      const originalSchema = AFRAME.components[this.name].schema;

      if (oldData.seed !== data.seed) {
        this.lcg.setSeed(data.seed); // must be updated before other attributes
      }

      // remove old rules and keys
      for (let prop in this.rules) {
        if (!(prop in data)) {
          delete this.rules[prop];
          delete this.keys[prop];
        }
      }

      for (let prop in data) {
        if (oldData[prop] !== data[prop] && !(prop in originalSchema)) {
          const value = data[prop];
          this.rules[prop] = value.split(",").map(attr => parse$1(attr));
        }
      }

      if (oldData.duration !== data.duration || oldData.loops !== data.loops) {
        this.loopTime = 0;
        this.loops = 0;
      }

      if (oldData.direction !== data.direction) {
        this.forward = (data.direction !== "backward");
        this.loopTime = this.forward ? 0 : data.duration;
      }

      this.generateKeys(true);
    },

    tick(time, timeDelta) {
      // clamp frame time to make thing simpler when debugging
      const dt = Math.min(timeDelta, MAX_FRAME_TIME_MS)/1000;
      this.step(dt);
    },

    step(dt) {
      const data = this.data;

      if ((data.loops < 0 || this.loops < data.loops) && data.duration > 0) {
        let looped = false;
        this.loopTime = this.loopTime + (this.forward ? dt : -dt);
      
        if (this.loopTime > data.duration || this.loopTime < 0) {
          this.loops++;
          looped = true;
        }

        if (looped && (data.loops < 0 || this.loops < data.loops)) {
          if (data.direction === "alternate") {
            this.forward = !this.forward;
            this.loopTime = this.loopTime < 0 ? -this.loopTime : 2*data.duration - this.loopTime; // overshoot goes into the opposite direction
          } else {
            this.loopTime = this.loopTime + (this.forward ? -data.duration : data.duration);
          }

          if (data.randomizeEachLoop) {
            this.generateKeys(false); // no need to resolve missing rules because none should be missing
          }
        }

        const easingFn = EASING_FUNCTIONS[data.easing] || EASING_FUNCTIONS["linear"];
        
        for (let prop in this.keys) {
          let r = THREE.Math.clamp(this.loopTime/data.duration, 0, 1);
          const value = lerpKeys(this.keyTypes[prop], this.keys[prop], r, easingFn);
          setProperty(this.el, prop, value);
        }
      }
    },

    generateKeys(resolveMissingRules) {
      let lastKey;

      function guessType(thing) {
        if (typeof thing === "object") {
          if (thing.length && typeof thing[0] === "number") {
            return "vector" 
          } else {
            return "object"
          }
        } else {
          return typeof thing
        }
      }

      this.keys = {};
      this.keyTypes = {};

      for (let prop in this.rules) {
        this.keys[prop] = [];

        for (let i = 0, n = this.rules[prop].length; i < n; i++) {
          // if moving backwards then the last rule is the first rule executed
          const ruleIndex = this.forward ? i : n - 1 - i;
          const rule = this.rules[prop][ruleIndex];

          if (resolveMissingRules) {
            // if we are missing a value, use the last value, or the current value if this is the first rule
            const emptyRange = rule.range && rule.range.includes("");
            const emptyOption = rule.options && rule.options.includes("");
      
            if (emptyRange || emptyOption) {
              // if missing the first rule then replace it with the existing value
              let info = i == 0 ? parsePart(getPropertyAsString(this.el, prop)) : lastKey;
              if (emptyRange) rule.range = rule.range.map(x => x === "" ? info : x);
              if (emptyOption) rule.options = rule.options.map(x => x === "" ? info : x);
            }
          }

          lastKey = randomize(rule, this.lcg.random);
          this.keys[prop][ruleIndex] = lastKey;
          this.keyTypes[prop] = this.keyTypes[prop] || guessType(lastKey);
        }
      }
    },
  });

  // Copyright 2018-2019 harlyq
  // MIT license

  // modification of the 'material' component from https://aframe.io/releases/0.9.0/aframe.min.js

  (function() {

  var utils = AFRAME.utils;

  var error = utils.debug('components:materialx:error');
  var shaders = AFRAME.shaders;

  /**
   * Material component.
   *
   * @member {object} shader - Determines how material is shaded. Defaults to `standard`,
   *         three.js's implementation of PBR. Another standard shading model is `flat` which
   *         uses MeshBasicMaterial.
   * @member {object} material
   * @member {object[]} oldMaterials
   */
  AFRAME.registerComponent('materialx', {
    schema: {
      alphaTest: {default: 0.0, min: 0.0, max: 1.0},
      depthTest: {default: true},
      depthWrite: {default: true},
      flatShading: {default: false},
      name: {default: ''},
      npot: {default: false},
      offset: {type: 'vec2', default: {x: 0, y: 0}},
      opacity: {default: 1.0, min: 0.0, max: 1.0},
      remap: {default: ''},
      repeat: {type: 'vec2', default: {x: 1, y: 1}},
      shader: {default: 'standard', oneOf: Object.keys(AFRAME.shaders), schemaChange: true},
      side: {default: 'front', oneOf: ['front', 'back', 'double']},
      transparent: {default: false},
      vertexColors: {type: 'string', default: 'none', oneOf: ['face', 'vertex']},
      visible: {default: true},
      blending: {default: 'normal', oneOf: ['none', 'normal', 'additive', 'subtractive', 'multiply']}
    },

    multiple: true,

    init: function () {
      this.system = this.el.sceneEl.systems['material'];
      this.material = null;
      this.oldMaterials = [];
    },

    /**
     * Update or create material.
     *
     * @param {object|null} oldData
     */
    update: function (oldData) {
      var data = this.data;
      if (!this.shader || data.shader !== oldData.shader) {
        // restore old materials, so if we remap again we will remember the originals
        replaceMaterial(this.el, oldData.remap, this.oldMaterials, []);
        this.updateShader(data.shader);
      }
      this.shader.update(this.data);
      this.updateMaterial(oldData);
    },

    updateSchema: function (data) {
      var currentShader;
      var newShader;
      var schema;
      var shader;

      newShader = data && data.shader;
      currentShader = this.oldData && this.oldData.shader;
      shader = newShader || currentShader;
      schema = shaders[shader] && shaders[shader].schema;

      if (!schema) { error('Unknown shader schema ' + shader); }
      if (currentShader && newShader === currentShader) { return; }
      this.extendSchema(schema);
      this.updateBehavior();
    },

    updateBehavior: function () {
      var key;
      var sceneEl = this.el.sceneEl;
      var schema = this.schema;
      var self = this;
      var tickProperties;

      function tickTime (time, delta) {
        var key;
        for (key in tickProperties) {
          tickProperties[key] = time;
        }
        self.shader.update(tickProperties);
      }

      this.tick = undefined;

      tickProperties = {};
      for (key in schema) {
        if (schema[key].type === 'time') {
          this.tick = tickTime;
          tickProperties[key] = true;
        }
      }

      if (!sceneEl) { return; }
      if (this.tick) {
        sceneEl.addBehavior(this);
      } else {
        sceneEl.removeBehavior(this);
      }
    },

    updateShader: function (shaderName) {
      var data = this.data;
      var Shader = shaders[shaderName] && shaders[shaderName].Shader;
      var shaderInstance;

      if (!Shader) { throw new Error('Unknown shader ' + shaderName); }

      // Get material from A-Frame shader.
      shaderInstance = this.shader = new Shader();
      shaderInstance.el = this.el;
      shaderInstance.init(data);
      this.setMaterial(shaderInstance.material);
      this.updateSchema(data);
    },

    /**
     * Set and update base material properties.
     * Set `needsUpdate` when needed.
     */
    updateMaterial: function (oldData) {
      var data = this.data;
      var material = this.material;
      var oldDataHasKeys;

      // Base material properties.
      material.alphaTest = data.alphaTest;
      material.depthTest = data.depthTest !== false;
      material.depthWrite = data.depthWrite !== false;
      material.name = data.name;
      material.opacity = data.opacity;
      material.flatShading = data.flatShading;
      material.side = parseSide(data.side);
      material.transparent = data.transparent !== false || data.opacity < 1.0;
      material.vertexColors = parseVertexColors(data.vertexColors);
      material.visible = data.visible;
      material.blending = parseBlending(data.blending);

      // Check if material needs update.
      for (oldDataHasKeys in oldData) { break; }
      if (oldDataHasKeys &&
          (oldData.alphaTest !== data.alphaTest ||
           oldData.side !== data.side ||
           oldData.vertexColors !== data.vertexColors)) {
        material.needsUpdate = true;
      }
    },

    /**
     * Remove material on remove (callback).
     * Dispose of it from memory and unsubscribe from scene updates.
     */
    remove: function () {
      // var defaultMaterial = new THREE.MeshBasicMaterial();
      var material = this.material;
      // var object3D = this.el.getObject3D('mesh');
      // if (object3D) { object3D.material = defaultMaterial; }
      replaceMaterial(this.el, this.data.remap, this.oldMaterials, []);
      this.oldMaterials.length = 0;
      disposeMaterial(material, this.system);
    },

    /**
     * (Re)create new material. Has side-effects of setting `this.material` and updating
     * material registration in scene.
     *
     * @param {object} data - Material component data.
     * @param {object} type - Material type to create.
     * @returns {object} Material.
     */
    setMaterial: function (material) {
      var el = this.el;
      var system = this.system;
      var remapName = this.data.remap;
      var hasMaterials = false;
      var oldMaterials = this.oldMaterials;

      if (this.material) { disposeMaterial(this.material, system); }

      this.material = material;
      system.registerMaterial(material);

      // Set on mesh. If mesh does not exist, wait for it.
      // mesh = el.getObject3D('mesh');
      // if (mesh) {
      //   mesh.material = material;
      // } else {
      hasMaterials = replaceMaterial(el, remapName, [material], oldMaterials);
      if (!hasMaterials) {
        el.addEventListener('object3dset', function waitForMesh (evt) {
          if (evt.detail.type !== 'mesh' || evt.target !== el) { return; }
          // el.getObject3D('mesh').material = material;
          replaceMaterial(el, remapName, [material], oldMaterials);
          el.removeEventListener('object3dset', waitForMesh);
        });
      }
    }
  });

  /**
   * Return a three.js constant determining which material face sides to render
   * based on the side parameter (passed as a component property).
   *
   * @param {string} [side=front] - `front`, `back`, or `double`.
   * @returns {number} THREE.FrontSide, THREE.BackSide, or THREE.DoubleSide.
   */
  function parseSide (side) {
    switch (side) {
      case 'back': {
        return THREE.BackSide;
      }
      case 'double': {
        return THREE.DoubleSide;
      }
      default: {
        // Including case `front`.
        return THREE.FrontSide;
      }
    }
  }

  /**
   * Return a three.js constant determining vertex coloring.
   */
  function parseVertexColors (coloring) {
    switch (coloring) {
      case 'face': {
        return THREE.FaceColors;
      }
      case 'vertex': {
        return THREE.VertexColors;
      }
      default: {
        return THREE.NoColors;
      }
    }
  }

  /**
   * Return a three.js constant determining blending
   *
   * @param {string} [blending=normal]
   * - `none`, additive`, `subtractive`,`multiply` or `normal`.
   * @returns {number}
   */
  function parseBlending (blending) {
    switch (blending) {
      case 'none': {
        return THREE.NoBlending;
      }
      case 'additive': {
        return THREE.AdditiveBlending;
      }
      case 'subtractive': {
        return THREE.SubtractiveBlending;
      }
      case 'multiply': {
        return THREE.MultiplyBlending;
      }
      default: {
        return THREE.NormalBlending;
      }
    }
  }

  /**
   * Dispose of material from memory and unsubscribe material from scene updates like fog.
   */
  function disposeMaterial (material, system) {
    material.dispose();
    system.unregisterMaterial(material);
  }

  /**
   * Replace all materials of a given name with a new material.
   * 
   * @param {object} el - element to replace material on
   * @param {string} nameGlob - regex of name of the material to replace. use '' for the material from getObject3D('mesh')
   * @param {object} newMaterials - list of materials to use
   * @param {object} outReplacedList - materials that have been replaced
   * @returns {boolean} - list of replaced materials
   */
  function replaceMaterial (el, nameGlob, newMaterials, outReplacedList) {
    var hasMaterials = false;
    outReplacedList.length = 0;

    if (newMaterials.length === 0) {
      return true
    }

    if (nameGlob === '') {
      var object3D = el.getObject3D('mesh');

      if (object3D && object3D.material) {
        outReplacedList.push(object3D.material);
        object3D.material = newMaterials[0];
        hasMaterials = true;
      }
    } else {
      var object3D = el.object3D;
      var nameRegex = globToRegex(nameGlob);
      var regex = new RegExp('^' + nameRegex + '$');
      var newIndex = 0;

      if (object3D) {
        object3D.traverse(function (obj) {
          if (obj && obj.material) {
            hasMaterials = true;

            if (Array.isArray(obj.material)) {
              for (var i = 0, n = obj.material.length; i < n; i++) {
                if (regex.test(obj.material[i].name)) {
                  outReplacedList.push(obj.material[i]);
                  obj.material[i] = newMaterials[newIndex];
                  newIndex = (newIndex + 1) % newMaterials.length;
                }
              }
            } else if (regex.test(obj.material.name)) {
              outReplacedList.push(obj.material);
              obj.material = newMaterials[newIndex];
              newIndex = (newIndex + 1) % newMaterials.length;
            }
          }
        });
      }
    }

    return hasMaterials;
  }

  function globToRegex(glob) {
    return glob.replace(/[\.\{\}\(\)\^\[\]\$]/g, '\\$&').replace(/[\*\?]/g, '.$&');
  }

  })();

  var proceduralVertexShader = "\n#define GLSLIFY 1\nvarying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}";

  var proceduralFragmentShader = "precision highp float;\n#define GLSLIFY 1\nconst mat2 myt=mat2(.12121212,.13131313,-.13131313,.12121212);const vec2 mys=vec2(1e4,1e6);vec2 rhash(vec2 uv){uv*=myt;uv*=mys;return fract(fract(uv/mys)*uv);}vec3 hash(vec3 p){return fract(sin(vec3(dot(p,vec3(1.0,57.0,113.0)),dot(p,vec3(57.0,113.0,1.0)),dot(p,vec3(113.0,1.0,57.0))))*43758.5453);}float voronoi2d(const in vec2 point){vec2 p=floor(point);vec2 f=fract(point);float res=0.0;for(int j=-1;j<=1;j++){for(int i=-1;i<=1;i++){vec2 b=vec2(i,j);vec2 r=vec2(b)-f+rhash(p+b);res+=1./pow(dot(r,r),8.);}}return pow(1./res,0.0625);}float remap(float v,float amin,float amax,float bmin,float bmax){return (v-amin)*(bmax-bmin)/(amax-amin)+bmin;}float rand(const vec2 n){return fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);}float noise(const vec2 n){const vec2 d=vec2(0.0,1.0);vec2 b=floor(n),f=smoothstep(vec2(0.0),vec2(1.0),fract(n));return mix(mix(rand(b),rand(b+d.yx),f.x),mix(rand(b+d.xy),rand(b+d.yy),f.x),f.y);}float fbm(vec2 n){float total=0.0,amplitude=1.0;for(int i=0;i<4;i++){total+=noise(n)*amplitude;n+=n;amplitude*=0.5;}return total;}float turbulence(const vec2 P){float val=0.0;float freq=1.0;for(int i=0;i<4;i++){val+=abs(noise(P*freq)/freq);freq*=2.07;}return val;}float roundF(const float number){return sign(number)*floor(abs(number)+0.5);}vec2 uvBrick(const vec2 uv,const float numberOfBricksWidth,const float numberOfBricksHeight){float yi=uv.y*numberOfBricksHeight;float nyi=roundF(yi);float xi=uv.x*numberOfBricksWidth;if(mod(floor(yi),2.0)==0.0){xi=xi-0.5;}float nxi=roundF(xi);return vec2((xi-floor(xi))*numberOfBricksHeight,(yi-floor(yi))*numberOfBricksWidth);}float brick(const vec2 uv,const float numberOfBricksWidth,const float numberOfBricksHeight,const float jointWidthPercentage,const float jointHeightPercentage){float yi=uv.y*numberOfBricksHeight;float nyi=roundF(yi);float xi=uv.x*numberOfBricksWidth;if(mod(floor(yi),2.0)==0.0){xi=xi-0.5;}float nxi=roundF(xi);xi=abs(xi-nxi);yi=abs(yi-nyi);return 1.-clamp(min(yi/jointHeightPercentage,xi/jointWidthPercentage)+0.2,0.,1.);}float marble(const vec2 uv,float amplitude,float k){k=6.28*uv.x/k;k+=amplitude*turbulence(uv.xy);k=sin(k);k=.5*(k+1.);k=sqrt(sqrt(sqrt(k)));return .2+.75*k;}float checkerboard(const vec2 uv,const float numCheckers){float cx=floor(numCheckers*uv.x);float cy=floor(numCheckers*uv.y);return sign(mod(cx+cy,2.));}float gaussian(const vec2 uv){vec2 xy=(mod(uv,vec2(1.,1.))-.5)*2.;float exponent=dot(xy,xy)/0.31831;return exp(-exponent);}vec2 uvTransform(const vec2 uv,const vec2 center,const vec2 scale,const float rad,const vec2 translate){float c=cos(-rad);float s=sin(-rad);float x=(uv.x-translate.x-center.x);float y=(uv.y-translate.y-center.y);float x2=(x*c+y*s)/scale.x+center.x;float y2=(-x*s+y*c)/scale.y+center.y;return vec2(x2,y2);}vec2 uvCrop(const vec2 uv,const vec2 uvMin,const vec2 uvMax){vec2 scale=1./(uvMax-uvMin);return uvTransform(uv,vec2(0.),scale,0.,-uvMin*scale);}float normpdf(const float x,const float sigma){return .39894*exp(-.5*x*x/(sigma*sigma))/sigma;}vec4 blur13(const sampler2D image,const vec2 uv,const vec2 resolution,const float sigma){const int kernelWidth=13;const int kSize=(kernelWidth)/2-1;float kernel[kernelWidth];float Z=0.;for(int j=0;j<=kSize;j++){kernel[kSize+j]=kernel[kSize-j]=normpdf(float(j),sigma);}for(int j=0;j<kernelWidth;j++){Z+=kernel[j];}vec4 color=vec4(0.);for(int i=-kSize;i<=kSize;i++){for(int j=-kSize;j<=kSize;j++){color+=kernel[kSize+j]*kernel[kSize+i]*texture2D(image,uv+vec2(float(i),float(j))/resolution);}}return color/(Z*Z);}";

  // uses @shotamatsuda/rollup-plugin-glslify

  AFRAME.registerSystem("procedural-texture", {
    init() {
      this.renderer = new THREE.WebGLRenderer({alpha: true});
      this.renderer.setPixelRatio( window.devicePixelRatio );
      this.renderer.autoClear = true; // when a shader fails we will see black, rather than the last shader output

      this.proceduralTextureComponents = [];
    },

    registerComponent(component) {
      this.proceduralTextureComponents.push(component);
    },

    unregisterComponent(component) {
      const i = this.proceduralTextureComponents.indexOf(component);
      if (i !== -1) {
        this.proceduralTextureComponents.slice(i, 1);
      }
    },

    updateProceduralTexturesUsingThisCanvas(canvas, exceptComponent = undefined) {
      for (let component of this.proceduralTextureComponents) {
        if (exceptComponent === component) {
          continue
        }

        if (Object.keys(component.uniforms).some( (name) => {
          const uniform = component.uniforms[name];
          return uniform.type === "texture" && 
            (Array.isArray(uniform.value) ? uniform.value.any(texture => texture.image === canvas) : uniform.value.image === canvas)
        } )) {
          // if another procedural texture is using 
          component.update(component.data);
        }
      }
    },
  });

  AFRAME.registerComponent("procedural-texture", {
    dependencies: ["geometry"], // this is for the case where 'dest' is not set
    schema: {
      shader: { type: "string" },
      dest: { type: "selector" }
    },
    multiple: true,

    init() {
      this.dest = undefined;
      this.system.registerComponent(this);
    },

    remove() {
      this.system.unregisterComponent(this);
    },

    updateSchema(newData) {
      if (!this.data || this.data.shader !== newData.shader) {
        this.shaderProgram = "";
        this.uniforms = {};

        if (newData.shader) {
          let shaderEl = document.querySelector(newData.shader);
          if (shaderEl) {
            this.shaderProgram = shaderEl.textContent;
          } else if (/main\(/.test(newData.shader)) {
            this.shaderProgram = newData.shader;
          } else {
            console.warn(`unknown shader: ${newData.shader}`);
          }
          this.uniforms = this.parseShaderUniforms(this.shaderProgram);
        }
      }

      let newSchema = this.uniformsToSchema(this.uniforms);

      if (!newData.dest) {
        newSchema.width = { type: "int", value: 256 };
        newSchema.height = { type: "int", value: 256 };
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    update(oldData) {
      const data = this.data;

      if (data.dest !== oldData.dest) {
        this.dest = (data.dest && data.dest instanceof HTMLCanvasElement) ? data.dest : undefined;
      }

      if (!data.dest && !this.dest) {
        this.dest = document.createElement("canvas");
        this.dest.width = data.width || 256;
        this.dest.height = data.height || 256;

        const mesh = this.el.getObject3D("mesh");
        if (mesh && mesh.material) {
          mesh.material.map = new THREE.CanvasTexture(this.dest);
        }
      }

      if (this.dest && this.shaderProgram) {
        if (!this.scene) {
          this.setupScene(this.dest, this.shaderProgram);
        }
        this.renderScene(data);

        updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, this.dest);
        this.system.updateProceduralTexturesUsingThisCanvas(this.dest);
      }
    },

    setupScene(canvas, shader) {
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.camera.position.z = 1;
      
      this.uniforms = this.parseShaderUniforms(shader);
      const fullFragmentShader = proceduralFragmentShader + shader;

      var shaderMaterial = new THREE.ShaderMaterial( {
        uniforms: this.uniforms,
        vertexShader: proceduralVertexShader,
        fragmentShader: fullFragmentShader,
      } );
    
      const mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), shaderMaterial );
      this.scene.add( mesh );
    
      // this.renderer = new THREE.WebGLRenderer({canvas, alpha: true});
      // this.renderer.setPixelRatio( window.devicePixelRatio );
      // this.renderer.setSize( canvas.width, canvas.height );
      // this.renderer.autoClear = true; // when a shader fails we will see black, rather than the last shader output

      this.ctx = canvas.getContext("2d");
    },
    
    renderScene(data) {
      this.updateUniforms(this.uniforms, data);

      // this.renderer.render( this.scene, this.camera );

      const canvas = this.ctx.canvas;
      const width = canvas.width;
      const height = canvas.height;

      this.system.renderer.setSize( width, height );
      this.system.renderer.render( this.scene, this.camera );

      this.ctx.drawImage(this.system.renderer.domElement, 0, 0);
    },

    parseShaderUniforms(shader) {
      const varRegEx = /uniform (vec2|vec3|vec4|float|int|uint|bool|sampler2D) ([a-zA-Z0-9_]+)(\[(\d+)\])?;/;
      let uniforms = {};
    
      shader.split("\n").forEach(line => {
        const match = varRegEx.exec(line);
        if (match) {
          const uniformType = match[1];
          const name = match[2];
          const arrayCount = typeof match[4] !== "undefined" ? parseInt(match[4], 10) : 0;
          if (name) {
            const newUniform = uniforms[name] || this.allocateUniform(uniformType, arrayCount);
            uniforms[name] = newUniform;
          }
        }
      });
    
      return uniforms
    },

    uniformsToSchema(uniforms) {
      let newSchema = [];

      for (let key in uniforms) {
        const uniform = uniforms[key];
        switch (uniform.type) {
          case "texture":
            newSchema[key] = { type: "string" };
            break
          case "float32array": 
          case "int32array":
            newSchema[key] = { type: "string" };
            break
          default:
            newSchema[key] = { type: uniform.count > 1 ? "string" : uniform.type };
        }
      }

      return newSchema
    },
    
    updateUniforms: (function () {
      let colArray = new Array(4);
      const toNumber = x => Number(x);
      const isNumber = x => !isNaN(x);

      function setValue(type, dataValue, setFn, el = undefined) {
        switch (type) {
          case "texture":
            const materialSystem = el.sceneEl.systems["material"];
            const textureEl = document.querySelector(dataValue);          
            const textureRef = textureEl ? textureEl : dataValue;
            materialSystem.loadTexture(textureRef, {src: textureRef}, (texture) => {
              setFn(texture);
            });
            break
          case "number":
            setFn(parseFloat(dataValue));
            break
          case "boolean":
            setFn(!!dataValue);
            break
          case "float32array":
          case "int32array":
            let vec = dataValue.split(" ").map(toNumber).filter(isNumber);
            if (vec.length == 0) {
              let col = parse(dataValue);
              if (col) {
                colArray.fill(1); // default, white, alpha 1
                vec = toArray(colArray, col);
              }
            }

            if (vec.length > 0) {
              setFn(vec);
            }
            break
        }
      }

      return function updateUniforms(uniforms, data) {
        for (let name in uniforms) {
          const dataStr = data[name];
          const uniform = uniforms[name];
      
          if (typeof dataStr === "undefined") {
            console.warn(`no attribute for uniform: ${name}`);
          } else {
            const dataValues = (typeof dataStr === "string" ? nestedSplit(dataStr) : [dataStr.toString()]).map(x => x.trim());
              
            if (uniform.arrayCount > 0) {
              for (let i = 0; i < dataValues.length; i++) {
                const dataValue = dataValues[i];

                switch (uniform.type) {
                  case "texture":
                    setValue(uniform.type, dataValue, v => uniform.value[i] = v, this.el);
                    break
                  case "number":
                  case "boolean":
                    setValue(uniform.type, dataValue, v => uniform.value[i] = v, this.el);
                    break
                  case "float32array":
                  case "in32array":
                    setValue(uniform.type, dataValue, v => uniform.value.set(v.slice(0, uniform.size), i*uniform.size));
                    break
                }
              }
            } else {
              switch (uniform.type) {
                case "texture": 
                case "number":
                case "boolean":
                  setValue(uniform.type, dataValues[0], v => uniform.value = v, this.el);
                  break
                case "float32array":
                case "in32array":
                  setValue(uniform.type, dataValues[0], v => uniform.value.set(v.slice(0, uniform.size)));
                  break
              }
            }
          }
        }
      }
    })(),
    
    allocateUniform(type, arrayCount) {
      const blockCount = Math.max(1, arrayCount);
      switch (type) {
        case "sampler2D":
          return { type: "texture", value: arrayCount > 0 ? new Array(arrayCount).fill(undefined) : undefined, arrayCount }
        case "float":
        case "int": 
          return { type: "number", value: arrayCount > 0 ? new Array(arrayCount).fill(0) : 0, arrayCount }
        case "bool": 
          return { type: "boolean", value: arrayCount > 0 ? new Array(arrayCount).fill(false) : false, arrayCount }
        case "ivec2":
        case "bvec2":
        case "vec2": 
          return { type: "float32array", value: new Float32Array(2*blockCount), size: 2, arrayCount }
        case "vec3": 
          return { type: "float32array", value: new Float32Array(3*blockCount), size: 3, arrayCount }
        case "vec4": 
          return { type: "float32array", value: new Float32Array(4*blockCount), size: 4, arrayCount }
        case "ivec3": 
        case "bvec3":
          return { type: "int32array", value: new Int32Array(3*blockCount), size: 3, arrayCount }
        case "ivec4": 
        case "bvec4":
          return { type: "int32array", value: new Int32Array(4*blockCount), size: 4, arrayCount }
        default:
          console.warn(`unknown uniform type ${type}`);
      }
    }, 
  });

  // Copyright 2019 harlyq

  /**
   * Based on donmccurdy/aframe-extras/sphere-collider.js
   *
   * Implement bounding sphere collision detection for entities
   */
  AFRAME.registerComponent("simple-hands", {
    schema: {
      objects: {default: ""},
      offset: {type: "vec3"},
      radius: {default: 0.05},
      watch: {default: true},
      bubble: {default: true},
      debug: {default: false},
    },

    init() {
      this.observer = null;
      this.els = [];
      this.hoverEl = undefined;
      this.grabEl = undefined;
      this.sphereDebug = undefined;
      
      this.onTriggerUp = this.onTriggerUp.bind(this);
      this.onTriggerDown = this.onTriggerDown.bind(this);
    },

    remove() {
      this.pause();
    },

    play() {
      const sceneEl = this.el.sceneEl;

      if (this.data.watch) {
        this.observer = new MutationObserver(this.update.bind(this, null));
        this.observer.observe(sceneEl, {childList: true, subtree: true});
      }

      this.el.addEventListener("triggerdown", this.onTriggerDown);
      this.el.addEventListener("triggerup", this.onTriggerUp);
    },

    pause() {
      this.el.removeEventListener("triggerdown", this.onTriggerDown);
      this.el.removeEventListener("triggerup", this.onTriggerUp);

      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    },

    /**
     * Update list of entities to test for collision.
     */
    update(oldData) {
      const data = this.data;
      let objectEls;

      // Push entities into list of els to intersect.
      if (data.objects) {
        objectEls = this.el.sceneEl.querySelectorAll(data.objects);
      } else {
        // If objects not defined, intersect with everything.
        objectEls = this.el.sceneEl.children;
      }

      if (!AFRAME.utils.deepEqual(data.offset, oldData.offset) || data.radius !== oldData.radius) {

        if (data.debug) {
          if (this.sphereDebug) {
            this.el.object3D.remove( this.sphereDebug );
          }
          let sphereGeo = new THREE.SphereBufferGeometry(data.radius, 6, 6);
          sphereGeo.translate(data.offset.x, data.offset.y, data.offset.z);
          let wireGeo = new THREE.WireframeGeometry(sphereGeo);
          this.sphereDebug = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({color: 0xffff00}) );
          this.el.object3D.add(this.sphereDebug);
        }
    
      }

      // Convert from NodeList to Array
      this.els = Array.prototype.slice.call(objectEls);
    },

    tick: (function () {
      let obj3DPosition = new THREE.Vector3();
      let handOffset = new THREE.Vector3();

      return function () {
        const data = this.data;
        const handObject3D = this.el.object3D;
        const handRadius = data.radius;

        let newHoverEl = undefined;

        if (!this.grabEl) {

          let minScore = Number.MAX_VALUE;
    
          handOffset.copy(data.offset).applyMatrix4(handObject3D.matrixWorld);

          for (let el of this.els) {
            if (!el.isEntity || !el.object3D) { 
              continue 
            }
    
            let obj3D = el.object3D;  
            if (!obj3D.boundingSphere || !obj3D.boundingBox || obj3D.boundingBox.isEmpty()) {
              this.generateBoundingBox(obj3D);
            }
    
            if (obj3D.boundingBox.isEmpty()) { 
              continue 
            }
    
            // Bounding sphere collision detection
            obj3DPosition.copy(obj3D.boundingSphere.center).applyMatrix4(obj3D.matrixWorld);
            const radius = obj3D.boundingSphere.radius*Math.max(obj3D.scale.x, obj3D.scale.y, obj3D.scale.z);
            const distance = handOffset.distanceTo(obj3DPosition);
            if (distance < radius + handRadius) {

              // Bounding box collision check
              const distanceToBox = pointToBox(handOffset, obj3D.boundingBox.min, obj3D.boundingBox.max, obj3D.matrixWorld.elements);
              // console.log("box", el.id, distanceToBox)

              if (distanceToBox < handRadius) {
                const score = volume( obj3D.boundingBox );
                // console.log("score", el.id, score)
                if (score < minScore) {
                  minScore = score;
                  newHoverEl = el;
                }
              }
            }
          }

          // if (newHoverEl) console.log("closest", newHoverEl.id)
        }

        if (this.hoverEl && this.hoverEl !== newHoverEl) {
          this.sendEvent(this.hoverEl, "hoverend");
        }
        if (newHoverEl && newHoverEl !== this.hoverEl) {
          this.sendEvent(newHoverEl, "hoverstart");
        } 
        this.hoverEl = newHoverEl;
      }
    })(),

    generateBoundingBox(obj3D) {
      // cache boundingBox and boundingSphere
      obj3D.boundingBox = obj3D.boundingBox || new THREE.Box3();
      obj3D.boundingSphere = obj3D.boundingSphere || new THREE.Sphere();
      setFromObject3D(obj3D.boundingBox, obj3D);

      if (!obj3D.boundingBox.isEmpty()) {
        obj3D.boundingBox.getBoundingSphere(obj3D.boundingSphere);

        if (this.data.debug) {
          let tempBox = new THREE.Box3();
          tempBox.copy(obj3D.boundingBox);
          obj3D.boundingBoxDebug = new THREE.Box3Helper(tempBox);
          obj3D.boundingBoxDebug.name = "simpleHandsDebug";
          obj3D.add(obj3D.boundingBoxDebug);
        }
      }
    },

    sendEvent(targetEl, eventName) {
      const bubble = this.data.bubble;
      // console.log(eventName, targetEl.id)
      targetEl.emit(eventName, {hand: this.el}, bubble);
      this.el.emit(eventName, {target: targetEl}, bubble);
    },

    onTriggerDown(e) {
      if (this.hoverEl) {
        this.grabEl = this.hoverEl;
        this.sendEvent(this.grabEl, "grabstart");
      }
    },

    onTriggerUp(e) {
      if (this.grabEl) {
        this.sendEvent(this.grabEl, "grabend");
        this.grabEl = undefined;
      }
    }
  });

  // Copyright 2018-2019 harlyq
  // License MIT

  const TIME_PARAM = 0; // [0].x
  const ID_PARAM = 1; // [0].y
  const RADIAL_X_PARAM = 2; // [0].z
  const DURATION_PARAM = 3; // [0].w
  const SPAWN_TYPE_PARAM = 4; // [1].x
  const SPAWN_RATE_PARAM = 5; // [1].y
  const SEED_PARAM = 6; // [1].z
  const VERTEX_COUNT_PARAM = 7; // [1].w
  const PARTICLE_SIZE_PARAM =  8; // [2].x
  const USE_PERSPECTIVE_PARAM = 9; // [2].y
  const DIRECTION_PARAM = 10; // [2].z
  const DRAG_PARAM = 11; // [2].w
  const TRAIL_INTERVAL_PARAM = 12; // [3].x
  const PARTICLE_COUNT_PARAM = 13; // [3].y
  const TRAIL_COUNT_PARAM = 14; // [3].z
  const SCREEN_DEPTH_OFFSET_PARAM = 15; // [3].w
  const RIBBON_WIDTH_PARAM = 16; // [4].x
  const RIBBON_UV_MULTIPLIER_PARAM = 17; // [4].y
  const RIBBON_UV_TYPE_PARAM = 18; // [4].z
  const RADIAL_Y_PARAM = 19; // [4].w
  const PARAMS_LENGTH = 5; // 0..4

  const MODEL_MESH = "mesh";
  const VERTS_PER_RIBBON = 2;

  const RANDOM_REPEAT_COUNT = 131072; // random numbers will start repeating after this number of particles

  const degToRad = THREE.Math.degToRad;

  const ATTR_TO_DEFINES = {
    acceleration: "USE_PARTICLE_ACCELERATION",
    angularAcceleration: "USE_PARTICLE_ANGULAR_ACCELERATION",
    angularVelocity: "USE_PARTICLE_ANGULAR_VELOCITY",
    color: "USE_PARTICLE_COLOR",
    textureFrame: "USE_PARTICLE_FRAMES",
    textureCount: "USE_PARTICLE_FRAMES",
    textureLoop: "USE_PARTICLE_FRAMES",
    position: "USE_PARTICLE_OFFSET",
    opacity: "USE_PARTICLE_OPACITY",
    radialAcceleration: "USE_PARTICLE_RADIAL_ACCELERATION",
    radialPosition: "USE_PARTICLE_RADIAL_OFFSET",
    radialVelocity: "USE_PARTICLE_RADIAL_VELOCITY",
    scale: "USE_PARTICLE_SCALE",
    velocity: "USE_PARTICLE_VELOCITY",
    orbitalVelocity: "USE_PARTICLE_ORBITAL",
    orbitalAcceleration: "USE_PARTICLE_ORBITAL",
    drag: "USE_PARTICLE_DRAG",
    destinationWeight: "USE_PARTICLE_DESTINATION",
    screenDepthOffset: "USE_PARTICLE_SCREEN_DEPTH_OFFSET",
    source: "USE_PARTICLE_SOURCE",
    model: "USE_PARTICLE_SOURCE",
  };

  const UV_TYPE_STRINGS = ["overtime", "interval"];
  const PARTICLE_ORDER_STRINGS = ["newest", "oldest", "original"];
  const AXES_NAMES = ["x", "y", "z"];

  // Bring all sub-array elements into a single array e.g. [[1,2],[[3],4],5] => [1,2,3,4,5]
  const flattenDeep = arr1 => arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);

  // Convert a vector range string into an array of elements. def defines the default elements for each vector
  const parseVecRange = (str, def) => {
    let parts = str.split("..").map(a => a.trim().split(" ").map(b => {
      const num = Number(b);
      return isNaN(num) ? undefined : num
    }));
    if (parts.length === 1) parts[1] = parts[0]; // if there is no second part then copy the first part
    parts.length = 2;
    return flattenDeep( parts.map(a => def.map((x,i) => typeof a[i] === "undefined" ? x : a[i])) )
  };

  // parse a ("," separated) list of vector range elements
  const parseVecRangeArray = (str, def) => {
    return flattenDeep( str.split(",").map(a => parseVecRange(a, def)) )
  };

  // parse a ("," separated) list of color range elements
  const parseColorRangeArray = (str) => {
    return flattenDeep( str.split(",").map(a => { 
      let parts = a.split("..");
      if (parts.length === 1) parts[1] = parts[0]; // if there is no second part then copy the first part
      parts.length = 2;
      return parts.map(b => new THREE.Color(b.trim())) 
    }) )
  };

  const toLowerCase = x => x.toLowerCase();

  // console.assert(AFRAME.utils.deepEqual(parseVecRange("", [1,2,3]), [1,2,3,1,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5", [1,2,3]), [5,2,3,5,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6", [1,2,3]), [5,6,3,5,6,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6 7 8", [1,2,3]), [5,6,7,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("8 9..10", [1,2,3]), [8,9,3,10,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("..5 6 7", [1,2,3]), [1,2,3,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("2 3 4..5 6 7", [1,2,3]), [2,3,4,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6 7..", [1,2,3]), [5,6,7,1,2,3]))

  // console.assert(AFRAME.utils.deepEqual(parseVecRangeArray("5 6 7..,9..10 11 12", [1,2,3]), [5,6,7,1,2,3,9,2,3,10,11,12]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRangeArray("1,2,,,3", [10]), [1,1,2,2,10,10,10,10,3,3]))

  // console.assert(AFRAME.utils.deepEqual(parseColorRangeArray("black..red,blue,,#ff0..#00ffaa").map(a => a.getHexString()), ["000000","ff0000","0000ff","0000ff","ffffff","ffffff","ffff00","00ffaa"]))

  let WHITE_TEXTURE = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat);
  WHITE_TEXTURE.needsUpdate = true;

  const BLENDING_MAP = {
    "none": THREE.NoBlending,
    "normal": THREE.NormalBlending,
    "additive": THREE.AdditiveBlending,
    "subtractive": THREE.SubtractiveBlending,
    "multiply": THREE.MultiplyBlending,
  };

  const SIDE_MAP = {
    "double": THREE.DoubleSide,
    "front": THREE.FrontSide,
    "back": THREE.BackSide,
  };

  AFRAME.registerComponent("sprite-particles", {
    schema: {
      texture: { type: "map" },
      delay: { default: 0 },
      duration: { default: -1 },
      spawnType: { default: "continuous", oneOf: ["continuous", "burst"], parse: toLowerCase },
      spawnRate: { default: 10 },
      source: { type: "selector" },
      textureFrame: { type: "vec2", default: {x: 1, y: 1} },
      textureCount: { type: "int", default: 0 },
      textureLoop: { default: 1 },
      randomizeFrames: { default: false },
      trailInterval: { default: 0 },
      trailLifeTime: { default: "0" },
      trailType: { default: "particle", oneOf: ["particle", "ribbon", "ribbon3d"] },
      ribbonWidth: { default: 1, },
      ribbonShape: { default: "flat", oneOf: ["flat", "taperin", "taperout", "taper"], parse: toLowerCase },
      ribbonUVType: { default: "overtime", oneOf: UV_TYPE_STRINGS, parse: toLowerCase },
      emitterColor: { type: "color" },

      lifeTime: { default: "1" },
      position: { default: "0 0 0" },
      velocity: { default: "0 0 0" },
      acceleration: { default: "0 0 0" },
      radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circlexz"], parse: toLowerCase },
      radialPosition: { default: "0" },
      radialVelocity: { default: "0" },
      radialAcceleration: { default: "0" },
      angularVelocity: { default: "0 0 0" },
      angularAcceleration: { default: "0 0 0" },
      orbitalVelocity: { default: "0" },
      orbitalAcceleration: { default: "0" },
      scale: { default: "1" },
      color: { default: "white", parse: toLowerCase },
      rotation: { default: "0" }, // if rotating textureFrames important to have enough space so overlapping parts of frames are blank (circle of sqrt(2) around the center of the frame will be viewable while rotating)
      opacity: { default: "1" },
      velocityScale: { default: 0 },
      velocityScaleMinMax: { type: "vec2", default: {x: 0, y: 3} },
      drag: { default: 0 },
      destination: { type: "selector" },
      destinationOffset: { default: "0 0 0" },
      destinationWeight: { default: "0" },

      enable: { default: true },
      emitterTime: { default: 0 },
      model: { type: "selector" },
      modelFill: { default: "triangle", oneOf: ["triangle", "edge", "vertex"], parse: toLowerCase },
      direction: { default: "forward", oneOf: ["forward", "backward"], parse: toLowerCase },
      particleOrder: { default: "original", oneOf: PARTICLE_ORDER_STRINGS },
      ribbonUVMultiplier: { default: 1 },
      materialSide: { default: "front", oneOf: ["double", "front", "back"], parse: toLowerCase },
      screenDepthOffset: { default: 0 },
      alphaTest: { default: 0 },
      fog: { default: true },
      depthWrite: { default: false },
      depthTest: { default: true },
      blending: { default: "normal", oneOf: ["none", "normal", "additive", "subtractive", "multiply"], parse: toLowerCase },
      transparent: { default: true },
      particleSize: { default: 100 },
      usePerspective: { default: true },
      seed: { type: "number", default: -1 },
      overTimeSlots: { type: "int", default: 5 },
      frustumCulled: { default: true },
      editorObject: { default: true },
    },
    multiple: true,
    help: "https://github.com/harlyq/aframe-sprite-particles-component",

    init() {
      this.handleObject3DSet = this.handleObject3DSet.bind(this);

      this.count = 0;
      this.trailCount = 0;
      this.overTimeArrayLength = 0;
      this.emitterTime = 0;
      this.delayTime = 0;
      this.lifeTime = [1,1];
      this.trailLifeTime = [0,0]; // if 0, then use this.lifeTime

      // this.useTransparent = false
      this.textureFrames = new Float32Array(4); // xy is TextureFrame, z is TextureCount, w is TextureLoop
      this.offset = new Float32Array(2*4).fill(0); // xyz is position, w is radialPosition
      this.velocity = new Float32Array(2*4).fill(0); // xyz is velocity, w is radialVelocity
      this.acceleration = new Float32Array(2*4).fill(0); // xyz is acceleration, w is radialAcceleration
      this.angularVelocity = new Float32Array(2*4).fill(0); // xyz is angularVelocity, w is lifeTime
      this.angularAcceleration = new Float32Array(2*4).fill(0); // xyz is angularAcceleration
      this.orbital = new Float32Array(2*2).fill(0); // x is orbitalVelocity, y is orbitalAcceleration
      this.colorOverTime; // color is xyz and opacity is w. created in update()
      this.rotationScaleOverTime; // x is rotation, y is scale. created in update()
      this.params = new Float32Array(5*4).fill(0); // see ..._PARAM constants
      this.velocityScale = new Float32Array(3).fill(0); // x is velocityScale, y is velocityScaleMinMax.x and z is velocityScaleMinMax.y
      this.emitterColor = new THREE.Vector3(); // use vec3 for color
      this.destination = new Float32Array(2*4).fill(0); // range value, xyz is destinationEntity.position + destinationOffset, w is destinationWeight
      this.destinationOffset; // parsed value for destinationOffset, this will be blended into destination
      this.destinationWeight; // parsed value for destinationWeight
      this.nextID = 0;
      this.nextTime = 0;
      this.numDisabled = 0;
      this.numEnabled = 0;
      this.startDisabled = !this.data.enable; // if we start disabled then the tick is disabled, until the component is enabled
      this.manageIDs = false;

      this.params[ID_PARAM] = -1; // unmanaged IDs
    },

    remove() {
      if (this.mesh) {
        this.el.removeObject3D(this.mesh.name);
      }
      if (this.data.model) {
        this.data.model.removeEventListener("object3dset", this.handleObject3DSet);
      }
    },

    update(oldData) {
      const data = this.data;
      
      let boundsDirty = data.particleSize !== oldData.particleSize;
      let overTimeDirty = false;

      // can only change overTimeSlots while paused, as it will rebuild the shader (see updateDefines())
      if (data.overTimeSlots !== oldData.overTimeSlots && !this.isPlaying) {
        this.overTimeArrayLength = this.data.overTimeSlots*2 + 1; // each slot represents 2 glsl array elements pluse one element for the length info
        this.colorOverTime = new Float32Array(4*this.overTimeArrayLength).fill(0); // color is xyz and opacity is w
        this.rotationScaleOverTime = new Float32Array(2*this.overTimeArrayLength).fill(0); // x is rotation, y is scale
        overTimeDirty = true;
      }

      this.params[PARTICLE_SIZE_PARAM] = data.particleSize;
      this.params[USE_PERSPECTIVE_PARAM] = data.usePerspective ? 1 : 0;
      this.params[DIRECTION_PARAM] = data.direction === "forward" ? 0 : 1;
      this.params[DRAG_PARAM] = THREE.Math.clamp(data.drag, 0, 1);
      this.params[SCREEN_DEPTH_OFFSET_PARAM] = data.screenDepthOffset*1e-5;
      this.params[RIBBON_WIDTH_PARAM] = data.ribbonWidth;
      this.params[RIBBON_UV_MULTIPLIER_PARAM] = data.ribbonUVMultiplier;

      this.textureFrames[0] = data.textureFrame.x;
      this.textureFrames[1] = data.textureFrame.y;
      this.textureFrames[2] = data.textureCount > 0 ? data.textureCount : data.textureFrame.x * data.textureFrame.y;
      this.textureFrames[3] = data.textureLoop;

      this.velocityScale[0] = data.velocityScale;
      this.velocityScale[1] = data.velocityScaleMinMax.x;
      this.velocityScale[2] = data.velocityScaleMinMax.y;

      if (this.material) {
        this.material.alphaTest = data.alphaTest;
        this.material.depthTest = data.depthTest;
        this.material.depthWrite = data.depthWrite;
        this.material.blending = BLENDING_MAP[data.blending];
        this.material.fog = data.fog;
      }

      if (data.seed !== oldData.seed) {
        this.seed = data.seed;
        this.params[SEED_PARAM] = data.seed >= 0 ? data.seed : Math.random();
      }

      if (data.ribbonUVType !== oldData.ribbonUVType) {
        this.params[RIBBON_UV_TYPE_PARAM] = UV_TYPE_STRINGS.indexOf(data.ribbonUVType) === -1 ? 0 : UV_TYPE_STRINGS.indexOf(data.ribbonUVType);
      }

      if (data.radialType !== oldData.radialType) {
        this.params[RADIAL_X_PARAM] = ["sphere", "circlexy", "circle"].includes(data.radialType) ? 1 : 0;
        this.params[RADIAL_Y_PARAM] = ["sphere", "circlexz"].includes(data.radialType) ? 1 : 0;
      }

      if (this.mesh && data.frustumCulled !== oldData.frustumCulled) {
        this.mesh.frustumCulled = data.frustumCulled;
      }

      if (data.emitterColor !== oldData.emitterColor) {
        const col = new THREE.Color(data.emitterColor);
        this.emitterColor.set(col.r, col.g, col.b);
      }

      if (data.position !== oldData.position || data.radialPosition !== oldData.radialPosition) {
        this.updateVec4XYZRange(data.position, "offset");
        this.updateVec4WRange(data.radialPosition, [0], "offset");
        boundsDirty = true;
      }

      if (data.velocity !== oldData.velocity || data.radialVelocity !== oldData.radialVelocity) {
        this.updateVec4XYZRange(data.velocity, "velocity");
        this.updateVec4WRange(data.radialVelocity, [0], "velocity");
        boundsDirty = true;
      }

      if (data.acceleration !== oldData.acceleration || data.radialAcceleration !== oldData.radialAcceleration) {
        this.updateVec4XYZRange(data.acceleration, "acceleration");
        this.updateVec4WRange(data.radialAcceleration, [0], "acceleration");
        boundsDirty = true;
      }

      if (data.rotation !== oldData.rotation || data.scale !== oldData.scale || overTimeDirty) {
        this.updateRotationScaleOverTime();
        boundsDirty = true;
      }

      if (data.color !== oldData.color || data.opacity !== oldData.opacity || overTimeDirty) {
        this.updateColorOverTime();
      }

      if (data.lifeTime !== oldData.lifeTime) {
        this.lifeTime = this.updateVec4WRange(data.lifeTime, [1], "angularVelocity");
      }

      if (data.angularVelocity !== oldData.angularVelocity) {
        this.updateAngularVec4XYZRange(data.angularVelocity, "angularVelocity");
      }

      if (data.trailLifeTime !== oldData.trailLifeTime) {
        // if trailLifeTime is 0 then use the lifeTime values, and always ensure that trailLifeTime never exceeds the lifeTime
        this.trailLifeTime = parseVecRange(data.trailLifeTime, [0]).map((x,i) => x > 0 ? x : this.lifeTime[i]);
        this["angularAcceleration"][3] = this.trailLifeTime[0]; // angularAcceleration[0].w
        this["angularAcceleration"][7] = this.trailLifeTime[1]; // angularAcceleration[1].w
      }

      if (data.angularAcceleration !== oldData.angularAcceleration) {
        this.updateAngularVec4XYZRange(data.angularAcceleration, "angularAcceleration");
      }

      if (data.orbitalVelocity !== oldData.orbitalVelocity) {
        this.updateAngularVec2PartRange(data.orbitalVelocity, [0], "orbital", 0); // x part
      }

      if (data.orbitalAcceleration !== oldData.orbitalAcceleration) {
        this.updateAngularVec2PartRange(data.orbitalAcceleration, [0], "orbital", 1); // y part
      }

      if (data.destinationOffset !== oldData.destinationOffset) {
        this.destinationOffset = this.updateVec4XYZRange(data.destinationOffset, "destination");
      }

      if (data.destinationWeight !== oldData.destinationWeight) {
        this.destinationWeight = this.updateVec4WRange(data.destinationWeight, [0], "destination");
      }

      if (data.duration !== oldData.duration || data.delay !== oldData.delay || data.emitterTime !== oldData.emitterTime) {
        // restart the particles
        this.params[DURATION_PARAM] = data.duration;
        this.emitterTime = data.emitterTime;
        this.delayTime = data.delay;
      }

      if (data.spawnType !== oldData.spawnType || data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime || data.trailInterval !== oldData.trailInterval) {
        const maxParticleLifeTime = this.lifeTime[1];
        const maxTrailLifeTime = data.trailInterval > 0 ? this.trailLifeTime[1] : 0;
        const maxAge = maxParticleLifeTime + maxTrailLifeTime;
        const particleCount = Math.max( 1, Math.ceil(maxAge*data.spawnRate) );
        this.trailCount = 1 + ( data.trailInterval > 0 ? Math.ceil( Math.min(maxTrailLifeTime, maxParticleLifeTime)/data.trailInterval ) : 0 ); // +1 because the trail includes the lead particle

        if (this.isRibbon()) { 
          this.trailCount++; // short ribbons will need an extra vert so they can bend around an interval, but why the extra vert for long ribbons?
          this.count = particleCount * this.trailCount * VERTS_PER_RIBBON;
        } else {
          this.count = particleCount * this.trailCount;
        }

        this.params[SPAWN_TYPE_PARAM] = data.spawnType === "burst" ? 0 : 1;
        this.params[SPAWN_RATE_PARAM] = data.spawnRate;
        this.params[VERTEX_COUNT_PARAM] = this.count;
        this.params[PARTICLE_COUNT_PARAM] = particleCount;
        this.params[TRAIL_INTERVAL_PARAM] = data.trailInterval;
        this.params[TRAIL_COUNT_PARAM] = this.trailCount;
        this.updateAttributes();
      }

      if (data.enable && this.startDisabled) {
        this.startDisabled = false;
      }

      if (data.model !== oldData.model && data.model && "getObject3D" in data.model) {
        if (oldData.model) { oldData.model.removeEventListener("object3dset", this.handleObject3DSet); }
        this.updateModelMesh(data.model.getObject3D(MODEL_MESH));
        if (data.model) { data.model.addEventListener("object3dset", this.handleObject3DSet); }
      }

      if (data.particleOrder !== "original" && data.source) {
        console.warn(`changing particleOrder to 'original' (was '${data.particleOrder}'), because particles use a source`);
      }

      if (!this.mesh) {
        this.createMesh();
      } else {
        this.updateDefines();
      }

      if (data.materialSide !== oldData.materialSide) {
        this.material.side = SIDE_MAP[data.materialSide];
      }

      if (boundsDirty) {
        this.updateBounds(); // call after createMesh()
      }

      if (this.paused && data.editorObject !== oldData.editorObject) {
        this.enableEditorObject(data.editorObject);
      }

      // for managedIDs the CPU defines the ID - and we want to avoid this if at all possible
      // once managed, always managed
      this.manageIDs = this.manageIDs || !data.enable || data.source || typeof this.el.getDOMAttribute(this.attrName).enable !== "undefined" || data.model || data.delay > 0;

      // call loadTexture() after createMesh() to ensure that the material is available to accept the texture
      if (data.texture !== oldData.texture) {
        this.loadTexture(data.texture);
      }
    },

    tick(time, deltaTime) {
      const data = this.data;

      if (this.startDisabled) { return }

      if (deltaTime > 100) deltaTime = 100; // ignore long pauses
      const dt = deltaTime/1000; // dt is in seconds

      if (data.enable) { this.delayTime -= dt; }
      if (this.delayTime >= 0) { return }

      if (!data.model || this.modelVertices) {
        this.emitterTime += dt;
        this.params[TIME_PARAM] = this.emitterTime;

        if (this.geometry && this.manageIDs) {
          this.updateWorldTransform(this.emitterTime);
        } else {
          this.params[ID_PARAM] = -1;
        }

        if (data.destination && data.destination.object3D && (this.destinationWeight[0] > 0 || this.destinationWeight[1] > 0)) {
          this.updateDestinationEntity();
        }
      }
    },

    pause() {
      this.paused = true;
      this.enableEditorObject(this.data.editorObject);
    },

    play() {
      this.paused = false;
      this.enableEditorObject(false);
    },

    handleObject3DSet(event) {
      if (event.target === this.data.model && event.detail.type === MODEL_MESH) {
        this.updateModelMesh(this.data.model.getObject3D(MODEL_MESH));
      }
    },

    loadTexture(filename) {
      if (filename) {
        let materialSystem = this.el.sceneEl.systems["material"];
        materialSystem.loadTexture(filename, {src: filename}, (texture) => {
          if (this.isRibbon()) {
            texture.wrapS = THREE.RepeatWrapping; // needed by ribbonUVMultipler
          }
          this.material.uniforms.map.value = texture;          
        });
      } else {
        this.material.uniforms.map.value = WHITE_TEXTURE;
      }
    },

    isRibbon() {
      return this.data.trailInterval > 0 && this.data.trailType !== "particle"
    },

    createMesh() {
      const data = this.data;

      this.geometry = new THREE.BufferGeometry();

      this.updateAttributes();

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          map: { type: "t", value: WHITE_TEXTURE },
          textureFrames: { value: this.textureFrames },

          params: { value: this.params },
          offset: { value: this.offset },
          velocity: { value: this.velocity },
          acceleration: { value: this.acceleration },
          angularVelocity: { value: this.angularVelocity },
          angularAcceleration: { value: this.angularAcceleration },
          orbital: { value: this.orbital },
          colorOverTime: { value: this.colorOverTime },
          rotationScaleOverTime: { value: this.rotationScaleOverTime },
          velocityScale: { value: this.velocityScale },
          emitterColor: { value: this.emitterColor },
          destination: { value: this.destination },

          fogDensity: { value: 0.00025 },
          fogNear: { value: 1 },
          fogFar: { value: 2000 },
          fogColor: { value: new THREE.Color( 0xffffff ) }
        },

        fragmentShader: particleFragmentShader,
        vertexShader: particleVertexShader,

        transparent: data.transparent,
        alphaTest: data.alphaTest,
        blending: BLENDING_MAP[data.blending],
        fog: data.fog,
        depthWrite: data.depthWrite,
        depthTest: data.depthTest,
        defines: {}, // updated in updateDefines()
      });

      this.updateDefines();

      if (this.isRibbon()) {
        // // this.material.side = THREE.DoubleSide
        // this.material.side = THREE.FrontSide
        this.mesh = new THREE.Mesh(this.geometry, [this.material]); // geometry groups need an array of materials
        this.mesh.drawMode = THREE.TriangleStripDrawMode;
      } else {
        this.mesh = new THREE.Points(this.geometry, this.material);
      }

      this.mesh.frustumCulled = data.frustumCulled;
      this.mesh.name = this.attrName;
      this.material.name = this.mesh.name;
      this.el.setObject3D(this.mesh.name, this.mesh);
    },

    updateColorOverTime() {
      let color = parseColorRangeArray(this.data.color);
      let opacity = parseVecRangeArray(this.data.opacity, [1]);

      const maxSlots = this.data.overTimeSlots;
      if (color.length > maxSlots*2) color.length = maxSlots*2;
      if (opacity.length > maxSlots*2) opacity.length = maxSlots*2;

      this.colorOverTime.fill(0);

      // first colorOverTime block contains length information
      // divide by 2 because each array contains min and max values
      this.colorOverTime[0] = color.length/2;  // glsl colorOverTime[0].x
      this.colorOverTime[1] = opacity.length/2; // glsl colorOverTime[0].y

      // set k to 4 because the first vec4 of colorOverTime is use for the length params
      let n = color.length;
      for (let i = 0, k = 4; i < n; i++, k += 4) {
        let col = color[i];
        this.colorOverTime[k] = col.r; // glsl colorOverTime[1..].x
        this.colorOverTime[k+1] = col.g; // glsl colorOverTime[1..].y
        this.colorOverTime[k+2] = col.b; // glsl colorOverTime[1..].z
      }

      n = opacity.length;
      for (let i = 0, k = 4; i < n; i++, k += 4) {
        let alpha = opacity[i];
        this.colorOverTime[k+3] = alpha; // glsl colorOverTime[1..].w
        // this.useTransparent = this.useTransparent || alpha < 1
      }
    },

    updateRotationScaleOverTime() {
      const maxSlots = this.data.overTimeSlots;
      let rotation = parseVecRangeArray(this.data.rotation, [0]);
      let scale = parseVecRangeArray(this.data.scale, [1]);


      if (rotation.length > maxSlots*2) rotation.length = maxSlots*2; // 2 rotations per range
      if (scale.length > maxSlots*2) scale.length = maxSlots*2; // 2 scales per range

      // first vec4 contains the lengths of the rotation and scale vectors
      this.rotationScaleOverTime.fill(0);
      this.rotationScaleOverTime[0] = rotation.length/2;
      this.rotationScaleOverTime[1] = scale.length/2;

      // set k to 2 because the first vec2 of rotationScaleOverTime is use for the length params
      // update i by 1 becase rotation is 1 numbers per vector, and k by 2 because rotationScaleOverTime is 2 numbers per vector
      let n = rotation.length;
      for (let i = 0, k = 2; i < n; i ++, k += 2) {
        this.rotationScaleOverTime[k] = degToRad(rotation[i]); // glsl rotationScaleOverTime[1..].x
      }

      n = scale.length;
      for (let i = 0, k = 2; i < n; i++, k += 2) {
        this.rotationScaleOverTime[k+1] = scale[i]; // glsl rotationScaleOverTime[1..].y
      }
    },

    updateVec4XYZRange(vecData, uniformAttr) {
      const vecRange = parseVecRange(vecData, [0,0,0]);
      for (let i = 0, j = 0; i < vecRange.length; ) {
        this[uniformAttr][j++] = vecRange[i++]; // x
        this[uniformAttr][j++] = vecRange[i++]; // y
        this[uniformAttr][j++] = vecRange[i++]; // z
        j++; // skip the w
      }
      return vecRange
    },

    updateAngularVec4XYZRange(vecData, uniformAttr) {
      const vecRange = parseVecRange(vecData, [0,0,0]);
      for (let i = 0, j = 0; i < vecRange.length; ) {
        this[uniformAttr][j++] = degToRad(vecRange[i++]); // x
        this[uniformAttr][j++] = degToRad(vecRange[i++]); // y
        this[uniformAttr][j++] = degToRad(vecRange[i++]); // z
        j++; // skip the w
      }
    },

    updateAngularVec2PartRange(vecData, def, uniformAttr, part) {
      const vecRange = parseVecRange(vecData, def);
      this[uniformAttr][part] = degToRad(vecRange[0]);
      this[uniformAttr][part + 2] = degToRad(vecRange[1]);
    },

    // update just the w component
    updateVec4WRange(floatData, def, uniformAttr) {
      let floatRange = parseVecRange(floatData, def);
      this[uniformAttr][3] = floatRange[0]; // floatData value is packed into the 4th part of each vec4
      this[uniformAttr][7] = floatRange[1];

      return floatRange
    },

    updateBounds() {
      const data = this.data;
      let maxAge = Math.max(this.lifeTime[0], this.lifeTime[1]);
      const STRIDE = 4;
      let extent = [new Array(STRIDE), new Array(STRIDE)]; // extent[0] = min values, extent[1] = max values

      if (data.drag > 0) {
        maxAge = maxAge*(1 - .5*data.drag);
      }

      // Use offset, velocity and acceleration to determine the extents for the particles
      for (let j = 0; j < 2; j++) { // index for extent
        const compare = j === 0 ? Math.min: Math.max;

        for (let i = 0; i < STRIDE; i++) { // 0 = x, 1 = y, 2 = z, 3 = radial
          const offset = compare(this.offset[i], this.offset[i + STRIDE]);
          const velocity = compare(this.velocity[i], this.velocity[i + STRIDE]);
          const acceleration = compare(this.acceleration[i], this.acceleration[i + STRIDE]);

          // extent at time tmax
          extent[j][i] = offset + (velocity + 0.5 * acceleration * maxAge) * maxAge;

          // extent at time t0
          extent[j][i] = compare(extent[j][i], offset);

          // extent at turning point
          const turningPoint = -velocity/acceleration;
          if (turningPoint > 0 && turningPoint < maxAge) {
            extent[j][i] = compare(extent[j][i], offset - 0.5*velocity*velocity/acceleration);
          }
        }
      }

      // include the bounds the base model
      if (this.modelBounds) {
        extent[0][0] += this.modelBounds.min.x;
        extent[0][1] += this.modelBounds.min.y;
        extent[0][2] += this.modelBounds.min.z;
        extent[1][0] += this.modelBounds.max.x;
        extent[1][1] += this.modelBounds.max.y;
        extent[1][2] += this.modelBounds.max.z;
      }

      // apply the radial extents to the XYZ extents
      const domAttrs = this.el.getDOMAttribute(this.attrName);
      const maxScale = this.rotationScaleOverTime.reduce((max, x, i) => (i & 1) ? Math.max(max, x) : max, 0); // scale is every second number
      const maxRadial = Math.max(Math.abs(extent[0][3]), Math.abs(extent[1][3])) + data.particleSize*0.00045*maxScale;
      const isSphere = data.radialType === "sphere" || domAttrs.angularVelocity || domAttrs.angularAcceleration || domAttrs.orbitalVelocity || domAttrs.orbitalAcceleration;

      extent[0][0] -= maxRadial;
      extent[0][1] -= maxRadial;
      extent[0][2] -= isSphere ? maxRadial : 0;
      extent[1][0] += maxRadial;
      extent[1][1] += maxRadial;
      extent[1][2] += isSphere ? maxRadial : 0;

      // discard the radial element
      extent[0].length = 3;
      extent[0].length = 3;

      // TODO include destination

      const maxR = Math.max(...extent[0].map(Math.abs), ...extent[1].map(Math.abs));
      if (!this.geometry.boundingSphere) {
        this.geometry.boundingSphere = new THREE.Sphere();
      }
      this.geometry.boundingSphere.radius = maxR;

      if (!this.geometry.boundingBox) {
        this.geometry.boundingBox = new THREE.Box3();
      }
      this.geometry.boundingBox.min.set(...extent[0]);
      this.geometry.boundingBox.max.set(...extent[1]);

      const existingMesh = this.el.getObject3D("mesh");

      // update any bounding boxes to the new bounds
      if (existingMesh && existingMesh.isParticlesEditorObject) {
        this.enableEditorObject(true);
      }
    },

    updateDestinationEntity: (function() {
      let dest = new THREE.Vector3();
      let selfPos = new THREE.Vector3();

      return function updateDestinationEntity() {
        const data = this.data;

        data.destination.object3D.getWorldPosition(dest);
        this.el.object3D.getWorldPosition(selfPos);
        dest.sub(selfPos);

        // this.destination is a vec4, this.destinationOffset is a vec3
        for (let i = 0, n = AXES_NAMES.length; i < n; i++) {
          this.destination[i] = dest[AXES_NAMES[i]] + this.destinationOffset[i]; // min part of range
          this.destination[i + 4] = dest[AXES_NAMES[i]] + this.destinationOffset[i + 3]; // max part of range
        }
      }
    })(),

    enableEditorObject(enable) {
      const existingMesh = this.el.getObject3D("mesh");

      if (enable && (!existingMesh || existingMesh.isParticlesEditorObject)) {
        const BOX_SIZE = 0.25;
        const maxBound = new THREE.Vector3(BOX_SIZE, BOX_SIZE, BOX_SIZE).max(this.geometry.boundingBox.max);
        const minBound = new THREE.Vector3(-BOX_SIZE, -BOX_SIZE, -BOX_SIZE).min(this.geometry.boundingBox.min);
        let box3 = new THREE.Box3(minBound, maxBound);
        let box3Mesh = new THREE.Box3Helper(box3, 0x808000);
        box3Mesh.isParticlesEditorObject = true;
        box3Mesh.visible = false;
        this.el.setObject3D("mesh", box3Mesh); // the inspector puts a bounding box around the "mesh" object
      } else if (!enable && existingMesh && existingMesh.isParticlesEditorObject) {
        this.el.removeObject3D("mesh");
      }
    },

    updateAttributes() {
      if (this.geometry) {
        const n = this.count;

        let vertexIDs = new Float32Array(n);
        if (this.startDisabled || this.data.delay > 0 || this.data.model) {
          vertexIDs.fill(-1);

          this.numEnabled = 0;
          this.numDisabled = n;  
        } else {
          for (let i = 0; i < n; i++) {
            vertexIDs[i] = i;
          }

          this.numEnabled = n;
          this.numDisabled = 0;
        }

        this.geometry.addAttribute("vertexID", new THREE.Float32BufferAttribute(vertexIDs, 1)); // gl_VertexID is not supported, so make our own id
        this.geometry.addAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(0), 3));

        if (this.data.source) {
          this.geometry.addAttribute("quaternion", new THREE.Float32BufferAttribute(new Float32Array(n*4).fill(0), 4));
        }

        // the ribbons are presented as triangle strips, so each vert pairs with it's two previous verts to
        // form a triangle.  To ensure each particle ribbon is not connected to other ribbons we place each
        // one in a group containing only the verts for that ribbon
        if (this.isRibbon()) {
          this.geometry.clearGroups();

          const m = this.trailCount * VERTS_PER_RIBBON;
          for (let i = 0; i < n; i += m) {
            this.geometry.addGroup(i, m, 0);
          }
        }
      }
    },

    // to get the fastest shader possible we remove unused glsl code via #if defined(USE_...) clauses,
    // with each clause matching to one or more component attributes. updateDefines() maps each 
    // attribute to its equivalent USE_... define, and determines if any defines have changed.
    // If a define has changed and we are playing we generate an error, otherwise (i.e. in the Inspector)
    // we update the material and rebuild the shader program
    updateDefines() {
      const data = this.data;
      const domAttrs = Object.keys(this.el.getDOMAttribute(this.attrName));
      const domDefines = domAttrs.map(a => ATTR_TO_DEFINES[a]).filter(b => b);

      let defines = {
        PARAMS_LENGTH,
        OVER_TIME_ARRAY_LENGTH: this.overTimeArrayLength,
        RANDOM_REPEAT_COUNT,
        USE_MAP: true,
      };
      for (let key of domDefines) {
        defines[key] = true;
      }

      if (data.velocityScale > 0) {
        defines.USE_PARTICLE_VELOCITY_SCALE = true;
      }

      if (data.trailInterval > 0) {
        if (this.isRibbon()) {
          if (data.trailType === "ribbon") {
            defines.USE_RIBBON_TRAILS = true;
          } else {
            defines.USE_RIBBON_3D_TRAILS = true;
          }
        }
        else {
          defines.USE_PARTICLE_TRAILS = true;
        }
      }

      if (data.randomizeFrames) {
        defines.USE_PARTICLE_RANDOMIZE_FRAMES = true;
      }

      if (domAttrs.includes("rotation")) {
        if (this.isRibbon()) {
          defines.USE_RIBBON_ROTATION = true;
        } else {
          defines.USE_PARTICLE_ROTATION = true;
        }
      }

      let ribbonShapeFunction = "1.";
      if (data.ribbonShape === "taperout") {
        ribbonShapeFunction = "1. - p";
      } else if (data.ribbonShape === "taperin") {
        ribbonShapeFunction = "p";
      } else if (data.ribbonShape === "taper") {
        ribbonShapeFunction = "2. * ( p < .5 ? p : 1. - p )";
      } else if (data.ribbonShape[0] === "=") {
        ribbonShapeFunction = data.ribbonShape.slice(1);
      }
      defines.RIBBON_SHAPE_FUNCTION = ribbonShapeFunction;

      if (data.source) {
        defines.PARTICLE_ORDER = 2;
      } else {
        defines.PARTICLE_ORDER = PARTICLE_ORDER_STRINGS.indexOf(data.particleOrder);
      }
      defines.PARTICLE_TRAIL_ORDER = PARTICLE_ORDER_STRINGS.indexOf(data.particleOrder);

      const extraDefines = Object.keys(defines).filter(b => this.material.defines[b] !== defines[b]);

      if (extraDefines.length > 0) {
        if (this.isPlaying) {
          const extraAttrs = domAttrs.filter(a => {
            const b = ATTR_TO_DEFINES[a];
            return b && !this.material.defines[b]
          });
          console.error(`cannot add attributes (${extraAttrs.join(",")}) at run-time`);
        } else {
          this.material.defines = defines;
          this.material.needsUpdate = true;
        }
      }
    },

    updateModelMesh(mesh) {
      if (!mesh) { return }

      this.modelBounds = new THREE.Box3();
      this.modelVertices;
      let offset = 0;
      let numFloats = 0;
      let stage = 0;

      const parseModel = (obj3D) => {
        if (!obj3D.geometry) { return }

        let positions = obj3D.geometry.getAttribute("position");
        if (positions && positions.itemSize !== 3) { return } // some text geometry uses 2D positions 

        if (stage == 0) {
          numFloats += positions.array.length;
        } else {
          this.modelVertices.set(positions.array, offset);
          offset += positions.array.length;
        }
      };

      stage = 0;
      mesh.traverse(parseModel);

      if (numFloats > 0) {
        stage = 1;
        this.modelVertices = new Float32Array(numFloats);
        mesh.traverse(parseModel);

        applyScale(this.modelVertices, mesh.el.object3D.scale);

        this.modelBounds.setFromArray(this.modelVertices);
        this.updateBounds();
      }
    },

    updateWorldTransform: (function() {
      let position = new THREE.Vector3();
      let quaternion = new THREE.Quaternion();
      let scale = new THREE.Vector3();
      let modelPosition = new THREE.Vector3();
      let m4 = new THREE.Matrix4();

      return function(emitterTime) {
        const data = this.data;
        const n = this.count;

        // for particles using a source the CPU sets the instancePosition and instanceQuaternion
        // of the new particles to the current object3D position/orientation, and tells the GPU
        // the ID of last emitted particle (this.params[ID_PARAM])
        const spawnRate = this.data.spawnRate;
        const isBurst = data.spawnType === "burst";
        const spawnDelta = isBurst ? 0 : 1/spawnRate; // for burst particles spawn everything at once
        const isEnableDisable = data.enable ? this.numEnabled < n : this.numDisabled < n;
        const hasSource = data.source && data.source.object3D != null;
        const isUsingModel = this.modelVertices && this.modelVertices.length;
        const isRibbon = this.isRibbon();
        const isIDUnique = isUsingModel || hasSource;

        let particleVertexID = this.geometry.getAttribute("vertexID");
        let particlePosition = this.geometry.getAttribute("position");
        let particleQuaternion = this.geometry.getAttribute("quaternion");

        if (hasSource) {
          this.el.object3D.updateMatrixWorld();
          data.source.object3D.updateMatrixWorld();

          // get source matrix in our local space
          m4.getInverse(this.el.object3D.matrixWorld);
          m4.multiply(data.source.object3D.matrixWorld);
          m4.decompose(position, quaternion, scale);
          this.geometry.boundingSphere.center.copy(position);
        }

        let startIndex = this.nextID % n;
        let numSpawned = 0; // number of particles and/or trails
        let index = startIndex;
        let id = this.nextID;

        let modelFillFn = randomPointInTriangle;
        switch (data.modelFill) {
          case "edge": modelFillFn = randomPointOnTriangleEdge; break
          case "vertex": modelFillFn = randomVertex; break
        }

        // the nextTime represents the startTime for each particle, so while the nextTime
        // is less than this frame's time, keep emitting particles. Note, if the spawnRate is
        // low, we may have to wait several frames before a particle is emitted, but if the 
        // spawnRate is high we will emit several particles per frame
        while (this.nextTime < emitterTime && numSpawned < this.count) {

          if (isUsingModel) {
            modelFillFn(this.modelVertices, modelPosition);
          }

          // for each particle, update all of its trails. if there are no trails, then
          // trailcount is 1
          for (let particleVert = 0, particleVertCount = isRibbon ? VERTS_PER_RIBBON : 1; particleVert < particleVertCount; particleVert++ ) {
            for (let trail = 0; trail < this.trailCount; trail++) {
              id = this.nextID;

              if (isUsingModel) {
                particlePosition.setXYZ(index, modelPosition.x, modelPosition.y, modelPosition.z);
              }
    
              if (hasSource) {
                particlePosition.setXYZ(index, position.x, position.y, position.z);
                particleQuaternion.setXYZW(index, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
              }
    
              particleVertexID.setX(index, data.enable ? id : -1); // id is unique and is tied to position and quaternion
    
              if (isEnableDisable) {
                // if we're enabled then increase the number of enabled and reset the number disabled, once we 
                // reach this.numEnabled === n, all IDs would have been set and isEnableDisable will switch to false.
                // vice versa if we are disabled. these numbers represent the number of consecutive enables or disables.
                this.numEnabled = data.enable ? this.numEnabled + 1 : 0;
                this.numDisabled = data.enable ? 0 : this.numDisabled + 1;
              }  

              index = (index + 1) % n;
              numSpawned++;

              if (isIDUnique) {
                this.nextID++;
              } else {
                this.nextID = index; // wrap around to 0 if we'd emitted the last particle in our stack
              }
            }
          }

          this.nextTime += spawnDelta;
        }

        if (numSpawned > 0) {
          const trailVertCount = this.trailCount * (isRibbon ? VERTS_PER_RIBBON : 1);
          this.params[ID_PARAM] = Math.floor(id/trailVertCount); // particle ID

          if (isBurst) { // if we did burst emit, then wait for maxAge before emitting again
            this.nextTime += this.lifeTime[1];
            if (data.trailInterval > 0) { 
              this.nextTime += this.trailLifeTime[1];
            }
          }

          // if the buffer was wrapped, we cannot send just the end and beginning of a buffer, so submit everything
          if (index < startIndex) {
            startIndex = 0;
            numSpawned = this.count;
          }

          if (hasSource || isUsingModel) {
            particlePosition.updateRange.offset = startIndex;
            particlePosition.updateRange.count = numSpawned;
            particlePosition.needsUpdate = true;
          }

          if (hasSource) {
            particleQuaternion.updateRange.offset = startIndex;
            particleQuaternion.updateRange.count = numSpawned;
            particleQuaternion.needsUpdate = true;
          }

          // if (changeIDs) {
            particleVertexID.updateRange.offset = startIndex;
            particleVertexID.updateRange.count = numSpawned;
            particleVertexID.needsUpdate = true;
          // }

          // this will cause a glitch in the appearance as we reset the IDs to prevent them from overflowing
          this.nextID = this.nextID % RANDOM_REPEAT_COUNT;
        }
      }
    })(),
  });

  const applyScale = (vertices, scale) => {
    if (scale.x !== 1 && scale.y !== 1 && scale.z !== 1) {
      for (let i = 0, n = vertices.length; i < n; i+=3) {
        vertices[i] *= scale.x;
        vertices[i+1] *= scale.y;
        vertices[i+2] *= scale.z;
      }
    }
  };

  const randomPointInTriangle = (function() {
    let v1 = new THREE.Vector3();
    let v2 = new THREE.Vector3();

    // see http://mathworld.wolfram.com/TrianglePointPicking.html
    return function randomPointInTriangle(vertices, pos) {
      // assume each set of 3 vertices (each vertex has 3 floats) is a triangle
      let triangleOffset = Math.floor(Math.random()*vertices.length/9)*9;
      v1.fromArray(vertices, triangleOffset);
      v2.fromArray(vertices, triangleOffset + 3);
      pos.fromArray(vertices, triangleOffset + 6);

      let r1, r2;
      do {
        r1 = Math.random();
        r2 = Math.random();
      } while (r1 + r2 > 1) // discard points outside of the triangle

      v2.sub(v1).multiplyScalar(r1);
      pos.sub(v1).multiplyScalar(r2).add(v2).add(v1);
    }  
  })();

  const randomPointOnTriangleEdge = (function() {
    let v1 = new THREE.Vector3();
    let v2 = new THREE.Vector3();
    let v3 = new THREE.Vector3();

    return function randomPointOnTriangleEdge(vertices, pos) {
      // assume each set of 3 vertices (each vertex has 3 floats) is a triangle
      let triangleOffset = Math.floor(Math.random()*vertices.length/9)*9;
      v1.fromArray(vertices, triangleOffset);
      v2.fromArray(vertices, triangleOffset + 3);
      v3.fromArray(vertices, triangleOffset + 6);
      let r1 = Math.random();
      if (r1 > 2/3) {
        pos.copy(v1).sub(v3).multiplyScalar(r1*3 - 2).add(v3);
      } else if (r1 > 1/3) {
        pos.copy(v3).sub(v2).multiplyScalar(r1*3 - 1).add(v2);
      } else {
        pos.copy(v2).sub(v1).multiplyScalar(r1*3).add(v1);
      }
    }  
  })();

  function randomVertex(vertices, pos) {
    let index = Math.floor(Math.random()*vertices.length/3)*3;
    pos.fromArray(vertices, index);
  }

  // based upon https://github.com/mrdoob/three.js/blob/master/src/renderers/shaders/ShaderLib/points_vert.glsl
  const particleVertexShader = `
#include <common>
// #include <color_pars_vertex>
#include <fog_pars_vertex>
// #include <morphtarget_pars_vertex>
// #include <logdepthbuf_pars_vertex>
// #include <clipping_planes_pars_vertex>

attribute float vertexID;

#if defined(USE_PARTICLE_SOURCE)
attribute vec4 quaternion;
#endif

uniform vec4 params[PARAMS_LENGTH];
uniform vec4 offset[2];
uniform vec4 velocity[2];
uniform vec4 acceleration[2];
uniform vec4 angularVelocity[2];
uniform vec4 angularAcceleration[2];
uniform vec2 orbital[2];
uniform vec4 colorOverTime[OVER_TIME_ARRAY_LENGTH];
uniform vec2 rotationScaleOverTime[OVER_TIME_ARRAY_LENGTH];
uniform vec4 textureFrames;
uniform vec3 velocityScale;
uniform vec4 destination[2];

varying vec4 vParticleColor;
varying vec2 vCosSinRotation;
varying vec2 vUv;
varying float vOverTimeRatio;
varying float vFrame;

float VERTS_PER_RIBBON = 2.;

// alternative random algorithm, used for the initial seed.  Provides a better
// result than using rand()
float pseudoRandom( const float seed )
{
  return mod( 1664525.*seed + 1013904223., 4294967296. )/4294967296.; // we don't have enough precision in 32-bit float, but results look ok
}

// each call to random will produce a different result by varying randI
float randI = 0.;
float random( const float seed )
{
  randI += 0.001;
  return rand( vec2( seed, randI ));
}

vec3 randVec3Range( const vec3 range0, const vec3 range1, const float seed )
{
  vec3 lerps = vec3( random( seed ), random( seed ), random( seed ) );
  return mix( range0, range1, lerps );
}

vec2 randVec2Range( const vec2 range0, const vec2 range1, const float seed )
{
  vec2 lerps = vec2( random( seed ), random( seed ) );
  return mix( range0, range1, lerps );
}

float randFloatRange( const float range0, const float range1, const float seed )
{
  float lerps = random( seed );
  return mix( range0, range1, lerps );
}

// theta.x is the angle in XY, theta.y is the angle in XZ
vec3 radialToVec3( const float r, const vec2 theta )
{
  vec2 cosTheta = cos(theta);
  vec2 sinTheta = sin(theta);
  float rc = r * cosTheta.x;
  float x = rc * cosTheta.y;
  float y = r * sinTheta.x;
  float z = rc * sinTheta.y;
  return vec3( x, y, z );
}

// array lengths are stored in the first slot, followed by actual values from slot 1 onwards
// colors are packed min,max,min,max,min,max,...
// color is packed in xyz and opacity in w, and they may have different length arrays

vec4 calcColorOverTime( const float r, const float seed )
{
  vec3 color = vec3(1.);
  float opacity = 1.;

#if defined(USE_PARTICLE_COLOR)
  int colorN = int( colorOverTime[0].x );
  if ( colorN == 1 )
  {
    color = randVec3Range( colorOverTime[1].xyz, colorOverTime[2].xyz, seed );
  }
  else if ( colorN > 1 )
  {
    float ck = r * ( float( colorN ) - 1. );
    float ci = floor( ck );
    int i = int( ci )*2 + 1;
    vec3 sColor = randVec3Range( colorOverTime[i].xyz, colorOverTime[i + 1].xyz, seed );
    vec3 eColor = randVec3Range( colorOverTime[i + 2].xyz, colorOverTime[i + 3].xyz, seed );
    color = mix( sColor, eColor, ck - ci );
  }
#endif

#if defined(USE_PARTICLE_OPACITY)
  int opacityN = int( colorOverTime[0].y );
  if ( opacityN == 1 )
  {
    opacity = randFloatRange( colorOverTime[1].w, colorOverTime[2].w, seed );
  }
  else if ( opacityN > 1 )
  {
    float ok = r * ( float( opacityN ) - 1. );
    float oi = floor( ok );
    int j = int( oi )*2 + 1;
    float sOpacity = randFloatRange( colorOverTime[j].w, colorOverTime[j + 1].w, seed );
    float eOpacity = randFloatRange( colorOverTime[j + 2].w, colorOverTime[j + 3].w, seed );
    opacity = mix( sOpacity, eOpacity, ok - oi );
  }
#endif

  return vec4( color, opacity );
}

// as per calcColorOverTime but euler rotation is packed in xyz and scale in w

vec2 calcRotationScaleOverTime( const float r, const float seed )
{
  float rotation = 0.;
  float scale = 1.;

#if defined(USE_PARTICLE_ROTATION) || defined(USE_RIBBON_ROTATION)
  int rotationN = int( rotationScaleOverTime[0].x );
  if ( rotationN == 1 )
  {
    rotation = randFloatRange( rotationScaleOverTime[1].x, rotationScaleOverTime[2].x, seed );
  }
  else if ( rotationN > 1 )
  {
    float rk = r * ( float( rotationN ) - 1. );
    float ri = floor( rk );
    int i = int( ri )*2 + 1; // *2 because each range is 2 vectors, and +1 because the first vector is for the length info
    float sRotation = randFloatRange( rotationScaleOverTime[i].x, rotationScaleOverTime[i + 1].x, seed );
    float eRotation = randFloatRange( rotationScaleOverTime[i + 2].x, rotationScaleOverTime[i + 3].x, seed );
    rotation = mix( sRotation, eRotation, rk - ri );
  }
#endif

#if defined(USE_PARTICLE_SCALE)
  int scaleN = int( rotationScaleOverTime[0].y );
  if ( scaleN == 1 )
  {
    scale = randFloatRange( rotationScaleOverTime[1].y, rotationScaleOverTime[2].y, seed );
  }
  else if ( scaleN > 1 )
  {
    float sk = r * ( float( scaleN ) - 1. );
    float si = floor( sk );
    int j = int( si )*2 + 1; // *2 because each range is 2 vectors, and +1 because the first vector is for the length info
    float sScale = randFloatRange( rotationScaleOverTime[j].y, rotationScaleOverTime[j + 1].y, seed );
    float eScale = randFloatRange( rotationScaleOverTime[j + 2].y, rotationScaleOverTime[j + 3].y, seed );
    scale = mix( sScale, eScale, sk - si );
  }
#endif

  return vec2( rotation, scale );
}

// assumes euler order is YXZ (standard convention for AFrame)
vec4 eulerToQuaternion( const vec3 euler )
{
  // from https://github.com/mrdoob/three.js/blob/master/src/math/Quaternion.js

  vec3 c = cos( euler * .5 );
  vec3 s = sin( euler * .5 );

  return vec4(
    s.x * c.y * c.z + c.x * s.y * s.z,
    c.x * s.y * c.z - s.x * c.y * s.z,
    c.x * c.y * s.z - s.x * s.y * c.z,
    c.x * c.y * c.z + s.x * s.y * s.z
  );
}

// from http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm
vec4 axisAngleToQuaternion( const vec3 axis, const float angle ) 
{
  return vec4( axis * sin( angle*.5 ), cos( angle*.5 ) );
}

vec3 applyQuaternion( const vec3 v, const vec4 q )
{
  return v + 2. * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
}

vec3 displacement( const vec3 v, const vec3 a, const float t )
{
  return (v + 0.5 * a * t) * t;
}

float displacement1D( const float v, const float a, const float t )
{
  return (v + 0.5 * a * t) * t;
}

float ribbonShape( const float p )
{
  return RIBBON_SHAPE_FUNCTION;
}

vec3 particleMotion( const vec3 p, const vec3 v, const vec3 a, const vec3 av, const vec3 aa, const vec3 axis, const float ov, const float oa, const vec3 dest, const float weight, const float t )
{
  vec3 pos = p + displacement(v, a, t);

#if defined(USE_PARTICLE_ANGULAR_VELOCITY) || defined(USE_PARTICLE_ANGULAR_ACCELERATION)
  pos = applyQuaternion( pos, eulerToQuaternion( displacement(av, aa, t) ) );
#endif

#if defined(USE_PARTICLE_ORBITAL)
  pos = applyQuaternion( pos, axisAngleToQuaternion( axis, displacement1D(ov, oa, t) ) );
#endif

#if defined(USE_PARTICLE_SOURCE)
  pos = applyQuaternion( pos, quaternion );
#endif

pos += position;

#if defined(USE_PARTICLE_DESTINATION)
  pos = mix( pos, dest, weight );
#endif

  return pos;
}

vec2 toScreen( const vec4 clipSpacePos )
{
  return clipSpacePos.xy / clipSpacePos.w;
}

void main() {

  float time = params[0].x;
  float cpuID = params[0].y;
  float radialTypeX = params[0].z;
  float radialTypeY = params[4].w;
  float duration = params[0].w;
  float spawnType = params[1].x;
  float spawnRate = params[1].y;
  float baseSeed = params[1].z;
  float vertexCount = params[1].w;
  float direction = params[2].z; // 0 is forward, 1 is backward  
  float trailInterval = params[3].x;
  float particleCount = params[3].y;
  float trailCount = params[3].z;
  float maxParticleLifeTime = angularVelocity[1].w; // lifeTime packed into w component of angularVelocity
  float maxTrailLifeTime = angularAcceleration[1].w; // trailLifeTime packed into angularAcceleration.w
  float particleLoopTime = particleCount / spawnRate;
  float motionAge = -1.; // used to determine the age for particle movement

#if defined(USE_PARTICLE_TRAILS) || defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  float maxAge = maxParticleLifeTime + maxTrailLifeTime;
#else
  float maxAge = maxParticleLifeTime;
#endif

  // the CPU manages IDs if it sets the position or disables particles, otherwise cpuID is -1
  float particleID0 = cpuID > -EPSILON ? cpuID : floor( mod( time, particleLoopTime ) * spawnRate ); // this will lose precision eventually

  vOverTimeRatio = -1.; // the vOverTimeRatio will be used for the lerps on over-time attributes

  // particles are either emitted in a burst (spawnType == 0) or spread evenly
  // throughout 0..particleLoopTime (spawnType == 1).  We calculate the ID of the last spawned particle particleID0 
  // for this frame, any vertex IDs after particleID0 are assumed to belong to the previous loop

  // vertex 0 = trail0 of particle0, vertex 1 = trail1 of particle0, ..., vertex k = trail0 of particle1, ...
#if defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  float rawParticleID = floor( vertexID / VERTS_PER_RIBBON / trailCount );
#else
  float rawParticleID = floor( vertexID / trailCount );
#endif

  float particleLoop = floor( time / particleLoopTime );

#if defined(USE_PARTICLE_SOURCE)
  // find particleID relative to the last loop
  float particleID = rawParticleID - floor( particleID0 / particleCount ) * particleCount;
#else // defined(USE_PARTICLE_SOURCE)

#if PARTICLE_ORDER == 0
  float particleID = particleID0 - (particleCount - 1. - rawParticleID); // newest last
#elif PARTICLE_ORDER == 1
  float particleID = particleID0 - rawParticleID; // oldest last
#else
  float particleID = rawParticleID > particleID0 ? rawParticleID - particleCount : rawParticleID; // cyclic (original)
#endif

#endif // defined(USE_PARTICLE_SOURCE)

  // for burst mode we use the rawParticleID, because the concept of particleID0 is irrelevant
  particleID = mix( rawParticleID, particleID, spawnType ); 

  float particleStartTime = particleLoop * particleLoopTime + particleID / spawnRate * spawnType;

  // we use the id as a seed for the randomizer, but because the IDs are fixed in 
  // the range 0..particleCount we calculate a virtual ID by taking into account
  // the number of loops that have occurred (note, particles from the previous 
  // loop will have a negative particleID). We use the modoulo of the RANDOM_REPEAT_COUNT 
  // to ensure that the virtualID doesn't exceed the floating point precision

  float virtualID = mod( particleID + particleLoop * particleCount, float( RANDOM_REPEAT_COUNT ) );
  float seed = pseudoRandom( virtualID*baseSeed*110. );

  float particleLifeTime = randFloatRange( angularVelocity[0].w, angularVelocity[1].w, seed );

  float particleAge = time - particleStartTime;
  particleAge = particleAge + direction * ( particleLoopTime - 2. * particleAge );

  // don't show particles that would be emitted after the duration
  if ( duration > 0. && time - particleAge >= duration ) 
  {
    particleAge = -1.;
  } 

  // always calculate the trailLifeTime, even if we don't use it, so the particles
  // with the same seed give consistent results
  float trailLifeTime = randFloatRange( angularAcceleration[0].w, angularAcceleration[1].w, seed );

#if defined(USE_PARTICLE_TRAILS)

  // +1 beceause we show both the lead particle and the first trail at the start
  // we cap the particleAge to ensure it never goes past the particleLifeTime
  float cappedParticleAge = min( particleLifeTime - trailInterval, particleAge );
  float trailID0 = floor( cappedParticleAge / trailInterval ) + 1.;
  float rawTrailID = mod( vertexID, trailCount );

#if PARTICLE_TRAIL_ORDER == 0
  float trailID = trailID0 - ( trailCount - 1. - rawTrailID ); // newest last
#elif PARTICLE_TRAIL_ORDER == 1
  float trailID = trailID0 - rawTrailID; // oldest last
#else
  float trailID = floor( trailID0 / trailCount ) * trailCount;
  trailID += rawTrailID > mod( trailID0, trailCount ) ? rawTrailID - trailCount : rawTrailID; // cyclic (original)
#endif

  float trailStartAge = trailID * trailInterval;
  
  if (particleAge > -EPSILON && trailStartAge > -EPSILON && trailStartAge < particleLifeTime + EPSILON)
  {
    if (particleAge < trailStartAge)
    {
      motionAge = particleAge;
      vOverTimeRatio = 0.;
    }
    else if (particleAge < trailStartAge + trailLifeTime)
    {
      motionAge = trailStartAge;
      vOverTimeRatio = (particleAge - trailStartAge)/trailLifeTime;
    }
  }

#elif defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)

  // +1 to the trailID0 because the ribbon needs two elements to start
  // we cap the particleAge to ensure it never goes past the particleLifeTime
  float cappedParticleAge = min( particleLifeTime - trailInterval, particleAge );
  float trailID0 = floor( cappedParticleAge / trailInterval ) + 1.;
  float rawTrailID = floor( mod( vertexID / VERTS_PER_RIBBON, trailCount ) );
  float trailID = max( 0., trailID0 - ( trailCount - 1. - rawTrailID ) ); // newest last

  float trailStartAge = trailID * trailInterval;

  if (particleAge > -EPSILON && trailStartAge > -EPSILON && trailStartAge < particleLifeTime + EPSILON)
  {
    // motionAge will typically be the trailStartAge, but the lead particle will be the 
    // cappedParticleAge, and the last particle will be the particleAge - trailLifeTime

    motionAge = min( cappedParticleAge, max( particleAge - trailLifeTime, trailStartAge ) );
    vOverTimeRatio = ( particleAge - motionAge ) / trailLifeTime;
  }
  else
  {
    motionAge = particleLifeTime;
    vOverTimeRatio = 1.0;
  }

#else // defined(USE_PARTICLE_TRAILS) || defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)

  motionAge = particleAge;
  vOverTimeRatio = particleAge/particleLifeTime;

#endif // defined(USE_PARTICLE_TRAILS) || defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)

  // these checks were around large blocks of code above, but this caused instability
  // in some of the particle systems, so instead we do all of the work, then cancel 
  // it out here
  if ( particleStartTime < 0. || vertexID < 0. )
  {
    vOverTimeRatio = -1.;
  }

#if defined(USE_PARTICLE_DRAG)
  // simulate drag by blending the motionAge to (1-.5*drag)*particleLifeTime
  float drag = params[2].w;
  motionAge = mix( .5*drag*vOverTimeRatio, 1. - .5*drag, vOverTimeRatio ) * particleLifeTime;
#endif

  vec3 p = vec3(0.); // position
  vec3 v = vec3(0.); // velocity
  vec3 a = vec3(0.); // acceleration
  vec3 av = vec3(0.); // angular velocity
  vec3 aa = vec3(0.); // angular acceleration
  vec3 axis = vec3( 1., 0., 0. ); // axis of orbital motion
  float ov = 0.; // orbital velocity
  float oa = 0.; // orbital acceleration
  vec3 dest = vec3(0.); // destination position
  float destWeight = 0.; // destination weighting

#if defined(USE_PARTICLE_OFFSET)
  p = randVec3Range( offset[0].xyz, offset[1].xyz, seed );
#endif

#if defined(USE_PARTICLE_VELOCITY)
  v = randVec3Range( velocity[0].xyz, velocity[1].xyz, seed );
#endif

#if defined(USE_PARTICLE_ACCELERATION)
  a = randVec3Range( acceleration[0].xyz, acceleration[1].xyz, seed );
#endif

#if defined(USE_PARTICLE_RADIAL_OFFSET) || defined(USE_PARTICLE_RADIAL_VELOCITY) || defined(USE_PARTICLE_RADIAL_ACCELERATION)
  vec2 ANGLE_RANGE[2];
  vec2 radialDir = vec2( radialTypeX, radialTypeY );
  ANGLE_RANGE[0] = vec2( 0., 0. ) * radialDir;
  ANGLE_RANGE[1] = vec2( 2.*PI, 2.*PI ) * radialDir;

  vec2 theta = randVec2Range( ANGLE_RANGE[0], ANGLE_RANGE[1], seed );
#endif

#if defined(USE_PARTICLE_RADIAL_OFFSET)
  float pr = randFloatRange( offset[0].w, offset[1].w, seed );
  vec3 p2 = radialToVec3( pr, theta );
  p += p2;
#endif

#if defined(USE_PARTICLE_RADIAL_VELOCITY)
  float vr = randFloatRange( velocity[0].w, velocity[1].w, seed );
  vec3 v2 = radialToVec3( vr, theta );
  v += v2;
#endif

#if defined(USE_PARTICLE_RADIAL_ACCELERATION)
  float ar = randFloatRange( acceleration[0].w, acceleration[1].w, seed );
  vec3 a2 = radialToVec3( ar, theta );
  a += a2;
#endif

#if defined(USE_PARTICLE_ANGULAR_VELOCITY)
  av = randVec3Range( angularVelocity[0].xyz, angularVelocity[1].xyz, seed );
#endif

#if defined(USE_PARTICLE_ANGULAR_ACCELERATION)
  aa = randVec3Range( angularAcceleration[0].xyz, angularAcceleration[1].xyz, seed );
#endif

#if defined(USE_PARTICLE_ORBITAL)
  if ( length(p) > EPSILON ) {
    ov = randFloatRange( orbital[0].x, orbital[1].x, seed );
    float oa = randFloatRange( orbital[0].y, orbital[1].y, seed );
    float angle = displacement1D(ov, oa, motionAge);

    vec3 randomOribit = vec3( random( seed ), random( seed ), random( seed ) ); // should never equal p or 0,0,0
    axis = normalize( cross( normalize( p ), normalize( randomOribit ) ) );
  }
#endif

#if defined(USE_PARTICLE_DESTINATION)
  destWeight = randFloatRange( destination[0].w, destination[1].w, seed );
  dest = randVec3Range( destination[0].xyz, destination[1].xyz, seed );
#endif

  vec3 transformed = particleMotion( p, v, a, av, aa, axis, ov, oa, dest, motionAge/particleLifeTime*destWeight, motionAge );

  vec2 rotScale = calcRotationScaleOverTime( vOverTimeRatio, seed );
  float particleScale = rotScale.y;
  float c = cos( rotScale.x );
  float s = sin( rotScale.x );

  vParticleColor = calcColorOverTime( vOverTimeRatio, seed ); // rgba format

#if defined(USE_PARTICLE_VELOCITY_SCALE)
  // We repeat all of the displacement calculations at motionAge + a small amount (velocityScaleDelta).
  // We convert the current position and the future position in screen space and determine
  // the screen space velocity. VelocityScaleDelta is reasonably small to give better
  // results for the angular and orbital displacement, and when drag is applied the effective
  // velocity will tend to 0 as the vOverTimeRatio increases

  float velocityScaleDelta = .02;

#if defined(USE_PARTICLE_DRAG)
  float futureT = motionAge + velocityScaleDelta*mix(1., 1. - drag, vOverTimeRatio);
#else
  float futureT = motionAge + velocityScaleDelta;
#endif

  vec4 pos2D = projectionMatrix * modelViewMatrix * vec4( transformed, 1. );

  // use min(1) to ensure the particle stops at the destination position
  vec3 transformedFuture = particleMotion( p, v, a, av, aa, axis, ov, oa, dest, min( 1., futureT/particleLifeTime )*destWeight, futureT );

  vec4 pos2DFuture = projectionMatrix * modelViewMatrix * vec4( transformedFuture, 1. );

  vec2 screen = pos2DFuture.xy / pos2DFuture.z - pos2D.xy / pos2D.z; // TODO divide by 0?
  screen /= velocityScaleDelta; // gives screen units per second

  float lenScreen = length( screen );
  vec2 sinCos = vec2(screen.x, screen.y)/max( EPSILON, lenScreen); // 0 degrees is y == 1, x == 0
  float c2 = c*sinCos.y + s*sinCos.x; // cos(a-b)
  float s2 = s*sinCos.y - c*sinCos.x; // sin(a-b)

  // replace rotation with our new rotation
  c = c2;
  s = s2;

  // rescale the particle length by the z depth, because perspective will be applied later
  float screenScale = clamp( lenScreen * pos2D.z * velocityScale.x, velocityScale.y, velocityScale.z );

  particleScale *= screenScale;

#endif // defined(USE_PARTICLE_VELOCITY_SCALE)

  vCosSinRotation = vec2( c, s );

  // #include <color_vertex>
  // #include <begin_vertex> replaced by code above
  // #include <morphtarget_vertex>
  // #include <project_vertex> replaced below

#if defined(USE_RIBBON_3D_TRAILS)
  float ribbonID = mod( vertexID, VERTS_PER_RIBBON );
  
  {
    float nextT = motionAge + trailInterval;
    float ribbonWidth = params[4].x * ribbonShape( vOverTimeRatio );

    vec3 nextPosition = particleMotion( p, v, a, av, aa, axis, ov, oa, dest, min( 1., nextT/particleLifeTime )*destWeight, nextT );
    vec3 dir = nextPosition - transformed;
    float dirLen = length( dir );

    vec3 normal = dir;
    vec3 up = vec3( 0., c, -s ); // rotation in YZ
    if ( dirLen > EPSILON && abs( dot( dir, up ) ) < dirLen * 0.99 ) {
      normal = normalize( cross( up, dir ) );
    }

    transformed += ribbonWidth * normal * ( 0.5 - ribbonID );  // +normal for ribbonID 0, -normal for ribbonID 1
  }
#endif

  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  float usePerspective = params[2].y;

#if defined(USE_RIBBON_TRAILS)
  float ribbonID = mod( vertexID, VERTS_PER_RIBBON );
  
  {
    mat4 m = projectionMatrix * modelViewMatrix;
    vec2 curr = toScreen( gl_Position );

    float nextT = motionAge + trailInterval;
    vec3 nextPosition = particleMotion( p, v, a, av, aa, axis, ov, oa, dest, min( 1., nextT/particleLifeTime )*destWeight, nextT );
    vec2 next2D = toScreen( m * vec4( nextPosition, 1. ) ) - curr;

    vec2 dir = normalize( next2D );
    vec2 normal = vec2( -dir.y, dir.x );

    float ribbonWidth = params[4].x * ribbonShape( vOverTimeRatio );
    float halfWidth = .5 * ribbonWidth * mix( 1., 1. / - mvPosition.z, usePerspective );
  
    gl_Position.xy += halfWidth * normal * ( 1. - ribbonID * 2. ); // +normal for ribbonID 0, -normal for ribbonID 1
  }
#endif

#if defined(USE_PARTICLE_SCREEN_DEPTH_OFFSET)
  float screenDepthOffset = params[3].w;

#if defined(USE_PARTICLE_TRAILS) || defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  // multiply trailCount by 2 because trailID ranges from [-trailCount, trailCount]
  gl_Position.z -= (particleID*trailCount*2. + trailID - trailID0)*gl_Position.w*screenDepthOffset/vertexCount;
#else
  gl_Position.z -= particleID*gl_Position.w*screenDepthOffset/vertexCount;
#endif

#endif // defined(USE_PARTICLE_SCREEN_DEPTH_OFFSET)

// vFrame is an int, but we must pass it as a float, so add .5 now and floor() in the
// fragment shader to ensure there is no rounding error
#if defined(USE_PARTICLE_RANDOMIZE_FRAMES)
  vFrame = floor ( random( seed ) * textureFrames.z ) + .5;
#else
  float textureCount = textureFrames.z;
  float textureLoop = textureFrames.w;

  vFrame = floor( mod( vOverTimeRatio * textureCount * textureLoop, textureCount ) ) + .5;
#endif

#if !defined(USE_RIBBON_TRAILS) && !defined(USE_RIBBON_3D_TRAILS)
  float particleSize = params[2].x;

  gl_PointSize = particleSize * particleScale * mix( 1., 1. / - mvPosition.z, usePerspective );
#endif

  // #include <logdepthbuf_vertex>
  // #include <clipping_planes_vertex>
  // #include <worldpos_vertex>
  #include <fog_vertex>

#if defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  float ribbonUVMultiplier = params[4].y;
  float ribbonUVType = params[4].z;

  vUv = vec2( mix( 1. - vOverTimeRatio, motionAge/trailInterval, ribbonUVType ) * ribbonUVMultiplier, 1. - ribbonID );
#endif
}`;

    // based upon https://github.com/mrdoob/three.js/blob/master/src/renderers/shaders/ShaderLib/points_frag.glsl
    const particleFragmentShader = `
#include <common>
#include <packing>
// #include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <fog_pars_fragment>
// #include <logdepthbuf_pars_fragment>
// #include <clipping_planes_pars_fragment>

uniform vec4 textureFrames;
uniform vec3 emitterColor;

varying vec4 vParticleColor;
varying vec2 vCosSinRotation;
varying vec2 vUv;
varying float vOverTimeRatio;
varying float vFrame;

void main() {
  if ( vOverTimeRatio < 0. || vOverTimeRatio > 1. ) {
    discard;
  }

  #include <clipping_planes_fragment>

  vec3 outgoingLight = vec3( 0. );
  vec4 diffuseColor = vec4( emitterColor, 1. );
  mat3 uvTransform = mat3( 1. );

#if defined(USE_PARTICLE_ROTATION) || defined(USE_PARTICLE_FRAMES) || defined(USE_PARTICLE_VELOCITY_SCALE)
  {
    vec2 invTextureFrame = 1. / textureFrames.xy;
    float textureCount = textureFrames.z;
    float textureLoop = textureFrames.w;

    float frame = floor(vFrame);
    float c = vCosSinRotation.x;
    float s = vCosSinRotation.y;
    float tx = mod( frame, textureFrames.x ) * invTextureFrame.x;
    float ty = (textureFrames.y - 1. - floor( frame * invTextureFrame.x )) * invTextureFrame.y; // assumes textures are flipped on y
    float sx = invTextureFrame.x;
    float sy = invTextureFrame.y;
    float cx = tx + invTextureFrame.x * .5;
    float cy = ty + invTextureFrame.y * .5;
  
    uvTransform[0][0] = sx * c;
    uvTransform[0][1] = -sx * s;
    uvTransform[1][0] = sy * s;
    uvTransform[1][1] = sy * c;
    uvTransform[2][0] = c * tx + s * ty - ( c * cx + s * cy ) + cx;
    uvTransform[2][1] = -s * tx + c * ty - ( -s * cx + c * cy ) + cy;
  }
#endif // defined(USE_PARTICLE_ROTATION) || defined(USE_PARTICLE_FRAMES) || defined(USE_PARTICLE_VELOCITY_SCALE)

  // #include <logdepthbuf_fragment>
  // #include <map_particle_fragment>
  // #include <color_fragment>

#ifdef USE_MAP

#if defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  vec2 uv = ( uvTransform * vec3( vUv, 1. ) ).xy;
#else
  vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1. ) ).xy;
#endif

  vec4 mapTexel = texture2D( map, uv );
  diffuseColor *= mapTexelToLinear( mapTexel );
#endif // USE_MAP

  #include <alphatest_fragment>

  diffuseColor *= vParticleColor;
  outgoingLight = diffuseColor.rgb;

  gl_FragColor = diffuseColor;

  // #include <premultiplied_alpha_fragment>
  // #include <tonemapping_fragment>
  // #include <encodings_fragment>
  #include <fog_fragment>
}`;

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
      this.sendEvents = this.sendEvents.bind(this);
      this.mediaEl = undefined;
      this.restartMedia = false;
      this.clockStartTime = Date.now();
      this.targets = [];
    },

    remove() {
      this.removeListeners();
    },

    updateSchema(newData) {
      const originalSchema = AFRAME.components["timer-emit"].schema;
      let newSchema = {};

      for (let key in newData) {
        if (!(key in originalSchema)) {
          newSchema[key] = { type: "string" }; // key is the name of the event to send, and the value is a list of time stamps
        }
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    pause() {
      const data = this.data;

      this.removeListeners();

      if (data.stopOnPause) {
        this.pauseTime = Date.now(); // used to pause the clock while in the Inspector
        clearTimeout(this.sendEventsTimer);
        this.sendEventsTimer = undefined;

        if (this.mediaEl && !this.mediaEl.paused) {
          this.mediaEl.pause();
          this.restartMedia = true;
        }
      }
    },

    play() {
      if (this.pauseTime) {
        this.clockStartTime += Date.now() - this.pauseTime;
        delete this.pauseTime;
      }

      if (this.mediaEl) {
        this.addListeners();

        if (this.restartMedia) {
          this.mediaEl.play();
          this.restartMedia = false;
        }
      }

      this.sendEvents();
    },

    update(oldData) {
      const data = this.data;
      const originalSchema = AFRAME.components["timer-emit"].schema;

      if (oldData.src !== data.src) {
        this.removeListeners();
        this.mediaEl = data.src instanceof HTMLMediaElement ? data.src : undefined;
      }

      if (oldData.target !== data.target) {
        this.targets = this.querySelectorAll(data.targetScope, data.target);
      }

      this.events = [];

      for (let attr in data) {
        if (!(attr in originalSchema)) {
          let times = data[attr].split(",").map(a => Number(a));
          for (let time of times) {
            if (!isNaN(time)) {
              this.events.push([time, attr]);
            }
          }
        }
      }

      this.events.sort((a,b) => a[0] - b[0]); // ascending by time
      this.lastSendEventsTime = -1;
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
        this.mediaEl.addEventListener("play", this.sendEvents);
      }
    },

    removeListeners() {
      if (this.mediaEl) {
        this.mediaEl.removeEventListener("play", this.sendEvents);
      }
    },

    sendEvents() {
      if (this.mediaEl && this.mediaEl.paused) {
        return
      }

      let time = this.mediaEl ? this.mediaEl.currentTime : (Date.now() - this.clockStartTime)/1000;
      let nextTime;
      let eventsToSend = [];

      for (let event of this.events) {
        if (event[0] <= this.lastSendEventsTime) continue

        if (event[0] <= time) {
          eventsToSend.push(event[1]);
        } else {
          nextTime = event[0];
          break
        }
      }

      if (eventsToSend.length > 0) {
        const data = this.data;
        const source = this.el;

        for (let target of this.targets) {
          const eventData = {source, target};
          
          for (let tag of eventsToSend) {
            target.emit(tag, eventData);
          }
        }
      }

      this.lastSendEventsTime = time;

      if (nextTime) {
        this.sendEventsTimer = setTimeout(this.sendEvents, (nextTime - time)*1000);
      }
    }
  });

  // Copyright 2018-2019 harlyq
  // MIT license

  function ScopedListener() {
    let elements = [];
    let event;
    let callback;

    function set(el, selector, scope, eventName, callbackFn) {
      remove();
      elements = getElementsInScope(el, selector, scope);
      event = eventName;
      callback = callbackFn;
    }

    function add() {
      if (event && callback) {
        for (let el of elements) {
          // console.log("scopedListener:add", el.id, event)
          el.addEventListener(event, callback);
        }
      }
    }

    function remove() {
      if (event && callback) {
        for (let el of elements) {
          // console.log("scopedListener:remove", el.id, event)
          el.removeEventListener(event, callback);
        }
      }
    }

    function getElementsInScope(el, selector, scope, eventEl) {
      switch (scope) {
        case "self": return selector === "" ? [el] : el.querySelectorAll(selector) || [el]
        case "parent": return selector === "" ? [el] : el.parentNode.querySelectorAll(selector) || [el]
        case "event": {
          const bestEl = eventEl ? eventEl : el;
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

  // Copyright 2018-2019 harlyq
  // MIT license

  function BasicTimer() {
    let sendEventTimer;
    let timeOfStart;
    let timeoutCallback;
    let timeRemaining;

    function start(delay, callback) {
      stop();
      
      if (delay > 0) {
        sendEventTimer = setTimeout(callback, delay*1000);
        timeOfStart = Date.now();
        timeoutCallback = callback;
      } else {
        callback();
      }
    }

    function stop() {
      // @ts-ignore
      clearTimeout(self.sendEventTimer);
      sendEventTimer = undefined;
      timeOfStart = undefined;
      timeRemaining = undefined;
      timeoutCallback = undefined;
    }

    function pause() {
      if (sendEventTimer) {
        let remaining = Date.now() - timeOfStart;
        stop();
        timeRemaining = remaining;
      }
    }

    function resume() {
      if (timeRemaining) {
        start(timeRemaining, timeoutCallback);
        timeRemaining = undefined;
      }
    }

    return {
      start,
      stop,
      pause,
      resume
    }
  }

  // Copyright 2018-2019 harlyq

  /**
   * Creates an HTML Element that matches a given selector string e.g. div.door#door1[state=open], 
   * creates a "div" with className "door", id "door1" and attribute "state=open".  If no type is
   * provided then defaults to a-entity.
   * 
   * @param {string} str - selector string to create
   * @return {object} returns an HTMLElement matching the selector string
   */
  function createElementFromSelector(str) {
    let info = parse$2(str);
    let type = info.type || 'a-entity';
    let newEl = document.createElement(type);
    if (newEl) {
      if (info.id) newEl.id = info.id;
      if (info.classes.length > 0) newEl.classList.add(...info.classes);

      for (let attr in info.attrs) {
        AFRAME.utils.entity.setComponentProperty(newEl, attr, trimQuotes(info.attrs[attr]));
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
    str = str.trim();
    const start = (str[0] === "'" || str[0] === '"') ? 1 : 0;
    const n = str.length;
    let end = (str[n - 1] === "'" || str[n - 1] === '"') ? n - 1 : n;
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
      this.addRemoveEntities = this.addRemoveEntities.bind(this);
      this.startDelay = this.startDelay.bind(this);

      this.waitTimer = BasicTimer();
      this.waitListener = ScopedListener();
    },

    update(oldData) {
      const data = this.data;
      if (oldData.event !== data.event || oldData.source !== data.source || oldData.sourceScope !== data.sourceScope) {
        this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.startDelay);
      }
      
      if (oldData.delay !== data.delay && (this.timer || data.event === "")) {
        this.startDelay();
      }
    },

    pause() {
      this.waitTimer.pause();
      this.waitListener.remove();
    },

    play() {
      this.waitListener.add();
      this.waitTimer.resume();
    },

    startDelay() {
      this.waitTimer.start(this.data.delay, this.addRemoveEntities);
    },

    addRemoveEntities() {
      const data = this.data;
      for (let removeSelector of data.remove) {
        let descendants = this.el.querySelectorAll(removeSelector);
        descendants.forEach(el => this.el.removeChild(el));
      }

      for (let i = 0; i < data.addRepeat; ++i) {
        for (let addSelector of data.add) {
          let newEl = createElementFromSelector(addSelector); // TODO should we createElement in the update, and only do the append here?
          if (newEl) {
            this.el.appendChild(newEl);
          }
        }
      }
    }
  });

  // Copyright 2018-2019 harlyq

  //-----------------------------------------------------------------------------
  // "wait-emit" component for emitting events on this or other elements after a delay or event
  // 
  AFRAME.registerComponent("wait-emit", {
    schema: {
      "event": { default: "" },
      "delay": { default: 0 },
      "source": { default: "" },
      "sourceScope": { default: "document", oneOf: ["parent", "self", "document"] },
      "out": { default: "" },
      "target": { default: "" },
      "targetScope": { default: "document", oneOf: ["parent", "self", "document"] },
    },
    multiple: true,

    init() {
      this.sendEvent = this.sendEvent.bind(this);
      this.startTimer = this.startTimer.bind(this);
      this.onEvent = this.onEvent.bind(this);
      this.sources = [];

      this.waitTimer = BasicTimer();
      this.waitListener = ScopedListener();
    },

    remove() {
      this.waitListener.remove();
      this.waitTimer.stop();
    },

    update(oldData) {
      const data = this.data;

      if (data.event !== oldData.event || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.onEvent);
      }

      if (data.delay !== oldData.delay && (this.sendwaitTimer || data.event === "")) {
        this.waitTimer.start(data.delay, this.sendEvent);
      }
    },

    pause() {
      this.waitListener.remove();
      this.waitTimer.pause();
    },

    play() {
      this.waitListener.add();
      this.waitTimer.resume();
    },

    onEvent() {
      this.waitTimer.start(this.data.delay, this.sendEvent);
    },

    sendEvent(evt) {
      const data = this.data;
      const targets = this.waitListener.getElementsInScope(this.el, data.target, data.targetScope, evt.target);
      const eventData = Object.assign({ source: this.el }, evt);
      const event = data.out ? data.out : data.event;

      for (let target of targets) {
        target.emit(event, eventData);
      }
    },

  });

  // Copyright 2018-2019 harlyq

  //-----------------------------------------------------------------------------
  // "wait-set" component for setting attributes on this or other elements after a delay or event
  // 
  AFRAME.registerComponent("wait-set", {
    schema: {
      delay: { default: 0 },
      event: { default: "" },
      source: { default: "" },
      sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
      target: { default: "" },
      targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
      seed: { type: "int", default: -1 },
    },
    multiple: true,

    init() {
      this.setProperties = this.setProperties.bind(this);
      this.startDelay = this.startDelay.bind(this);

      this.eventTargetEl = undefined;
      this.rules = {};
      this.sources = [];

      this.waitListener = ScopedListener();
      this.waitTimer = BasicTimer();
      this.lcg = lcg();
    },

    remove() {
      this.waitListener.remove();
      this.waitTimer.stop();
    },

    updateSchema(newData) {
      const originalSchema = AFRAME.components[this.name].schema;
      let newSchema = {};

      for (let prop in newData) {
        if (!(prop in originalSchema)) {
          newSchema[prop] = { default: "" };
        }
      }

      // extend the schema so the new rules appear in the inspector
      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    update(oldData) {
      const originalSchema = AFRAME.components[this.name].schema;
      const data = this.data;

      if (data.seed !== oldData.seed) {
        this.lcg.setSeed(data.seed);
      }

      for (let prop in this.rules) {
        if (!(prop in data)) {
          delete this.rules[prop]; // property is no longer present
        }
      }

      for (let prop in data) {
        if (!(prop in originalSchema) && data[prop] !== oldData[prop]) {
          this.rules[prop] = parse$1(data[prop]);
        }
      }

      if (data.event !== oldData.event || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.waitListener.set(this.el, data.source, data.sourceScope, data.event, this.startDelay);
      }

      if (data.delay !== oldData.delay && (this.delayTimer || data.event === "")) {
        this.startDelay();
      }
    },

    pause() {
      this.waitListener.remove();
      this.waitTimer.pause();
    },

    play() {
      this.waitTimer.resume();
      this.waitListener.add();
    },

    startDelay(e) {
      // console.log("wait-set:startDelay", e.target.id, this.data.event)
      this.eventTargetEl = e ? e.target : undefined;
      this.waitTimer.start(this.data.delay, this.setProperties);
    },

    setProperties() {
      const elements = this.waitListener.getElementsInScope(this.el, this.data.target, this.data.targetScope, this.eventTargetEl);

      for (let el of elements) {
        for (let prop in this.rules) {
          let rule = this.rules[prop];

          const value = stringify( randomize(rule, this.lcg.random) );
          // console.log("wait-set:setProperties", el.id, prop, value)
          setProperty(el, prop, value);
        }
      }
    },
  });

}));
