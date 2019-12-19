(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
}((function () { 'use strict';

  // @ts-ignore
  const UP_VECTOR = new THREE.Vector3(0,1,0);
  const MAX_HISTORY_LENGTH = 3;

  AFRAME.registerComponent("arm-swinger", {
    schema: {
      handSelectors: { type: "selectorAll" },
      startEvent: { default: "gripdown" },
      endEvent: { default: "gripup"},
      cameraRig: { type: "selector" },
      scaling: { default: 1 },
      enabled: { default: true },
    },

    init() {
      this.onStartEvent = this.onStartEvent.bind(this);
      this.onEndEvent = this.onEndEvent.bind(this);
      this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);

      this.newOffset = new THREE.Vector3();
      this.isMoving = false;
      this.isEnabled = false;

      this.sides = [];
    },

    update(oldData) {
      const data = this.data;

      if (oldData.handSelectors !== data.handSelectors) {
        this.sides.length = 0;

        if (data.handSelectors) {
          for (let handEl of data.handSelectors) {
            this.sides.push( { handEl, active: false, positions: [], forwards: [] } );
          }
        }
      }

      if (oldData.enabled !== data.enabled) {
        if (data.enabled) {
          this.enable();
        } else {
          this.disable();
        }
      }
    },

    play() {
      if (this.data.enabled) {
        this.enable();
      }
    },

    pause() {
      this.disable();
    },

    tick(time, deltaTime) {
      const data = this.data;
      const dt = deltaTime*0.001;

      let [dLeft, forwardLeft] = this.sides.length > 0 ? this.tickSide(this.sides[0]) : [undefined, undefined];
      let [dRight, forwardRight] = this.sides.length > 1 ? this.tickSide(this.sides[1]) : [undefined, undefined];

      this.isMoving = false;
      if (forwardLeft || forwardRight) {
        this.newOffset.set(0,0,0);
        let d = 0;

        if (forwardLeft) {
          this.newOffset.add(forwardLeft);
          d = Math.max(d, dLeft);
        }

        if (forwardRight) {
          this.newOffset.add(forwardRight);
          d = Math.max(d, dRight);
        }

        this.newOffset.y = 0;
        this.newOffset.normalize().multiplyScalar(-data.scaling*d*dt);
        this.isMoving = true;
      }
    },

    tock() {
      // positioning the camera in the tock because the tick is throttled
      const data = this.data;

      const cameraRig3D = data.cameraRig ? data.cameraRig.object3D : this.el.object3D;
      if ( this.isMoving && cameraRig3D ) {
        cameraRig3D.position.add( this.newOffset );
      }
    },

    enable() {
      if (!this.isEnabled) {
        for (let side of this.sides) {
          this.addListeners(side.handEl);
        }
        this.isEnabled = true;
      }
    },

    disable() {
      if (this.isEnabled) {
        for (let side of this.sides) {
          this.deactivate(side);
          this.removeListeners(side.handEl);
        }
        this.isEnabled = false;
      }
    },

    onStartEvent(e) {
      for (let side of this.sides) {
        if (e.target === side.handEl) {
          this.activate(side);
        }
      }
    },

    onEndEvent(e) {
      for (let side of this.sides) {
        if (e.target === side.handEl) {
          this.deactivate(side);
        }
      }
    },

    addListeners(handEl) {
      if (handEl) {
        handEl.addEventListener(this.data.startEvent, this.onStartEvent);
        handEl.addEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    removeListeners(handEl) {
      if (handEl) {
        handEl.removeEventListener(this.data.startEvent, this.onStartEvent);
        handEl.removeEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    activate(side) {
      side.active = true;
      side.positions.length = 0;
      side.forwards.length = 0;
    },

    deactivate(side) {
      side.active = false;
    },

    tickSide(side) {
      if (!side.active) {
        return [undefined, undefined]
      }

      let position;
      let forward;
      if (side.positions.length >= MAX_HISTORY_LENGTH) {
        position = side.positions.shift(); // reuse the matrix from the first entry
        forward = side.forwards.shift();
      } else {
        position = new THREE.Vector3();
        forward = new THREE.Vector3();
      }
      const handMatrixWorld = side.handEl.object3D.matrixWorld;
      side.positions.push( position.setFromMatrixPosition(handMatrixWorld) );
      side.forwards.push( forward.setFromMatrixColumn(handMatrixWorld, 0).cross(UP_VECTOR) );

      let distance = 0;
      const n = side.positions.length;
      for (let i = 1; i < n; i++) {
        distance += side.positions[i].distanceTo(side.positions[i-1]);
      }

      // console.log("distance", distance.toFixed(2), "forward", forward.x.toFixed(2), forward.y.toFixed(2), forward.z.toFixed(2))
      return [distance, forward]
    }  

  });

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
      this.context = undefined;
      this.analysers = {};
    },

    getOrCreateAnalyser: function() {
      if (!this.context) {
        // only create if needed to avoid the warning:
        // The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://goo.gl/7K7WLu
        this.context = new AudioContext();
      }

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

    updateSchema: function (newData) {
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
      let newRules = {};

      for (let key in newData) {
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

  /** @type {<T extends VecXYZ, TA extends VecXYZ>(out: T, a: TA) => T} */
  function copy(out, a) {
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    return out
  }

  // elementwise maximum
  /** @type {<T extends VecXYZ, TA extends VecXYZ, TB extends VecXYZ>(out: T, a: TA, b: TB) => T} */
  function max(out, a, b) {
    out.x = Math.max(a.x, b.x);
    out.y = Math.max(a.y, b.y);
    out.z = Math.max(a.z, b.z);
    return out
  }

  // elementwise minimum
  /** @type {<T extends VecXYZ, TA extends VecXYZ, TB extends VecXYZ>(out: T, a: TA, b: TB) => T} */
  function min(out, a, b) {
    out.x = Math.min(a.x, b.x);
    out.y = Math.min(a.y, b.y);
    out.z = Math.min(a.z, b.z);
    return out
  }

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

  /** @type {<T extends VecXYZ, TA extends Affine4, TV extends VecXYZ>(out: T, aff: TA, v: TV) => T} */
  function multiplyVecXYZ(out, aff, v) {
    const vx = v.x, vy = v.y, vz = v.z;

    out.x = aff[0]*vx + aff[4]*vy + aff[8]*vz + aff[12];
    out.y = aff[1]*vx + aff[5]*vy + aff[9]*vz + aff[13];
    out.z = aff[2]*vx + aff[6]*vy + aff[10]*vz + aff[14];

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

  /**
   * @typedef {{r: number, g: number, b: number}} RGBColor
   */

  /** @type {<T>(list: T[], randFn: () => number) => T} */
  function entry(list, randFn = Math.random) {
    return list[ index(list.length, randFn) ]
  }

  /** @type {(length: number, randFn: () => number) => number} */
  function index(length, randFn = Math.random) {
    return ~~( Math.min( length - 1, randFn()*length ) ) // must never exceed length-1
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

  /** @type {<T extends {x:number, y:number, z?:number, w?:number}>(out: T, vecMin: T, vecMax: T, randFn: () => number) => T} */
  function vector(out, vecMin, vecMax, randFn = Math.random) {
    out.x = float(vecMin.x, vecMax.x, randFn);
    out.y = float(vecMin.y, vecMax.y, randFn);
    if ('z' in vecMin && 'z' in vecMax) { out.z = float(vecMin.z, vecMax.z, randFn); }
    if ('w' in vecMin && 'w' in vecMax) { out.w = float(vecMin.w, vecMax.w, randFn); }
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

  /** @type { (maxBlocks: number) => { allocate: (requestedSize: number) => number | undefined, release: (index: number) => boolean, maxUsed: () => number } } */
  function blocks(maxBlocks) {
    const freeBlocks = [ { index: 0, size: maxBlocks } ]; // list of available blocks, sorted by increasing index
    const usedBlocks = [];

    function allocate(requestedSize) {
      // search from the end of the free block list so we prefer to re-use
      // previously allocated blocks, rather than the larger initial block
      for (let j = freeBlocks.length - 1; j >= 0; j--) {
        const block = freeBlocks[j];
        const remainder = block.size - requestedSize;

        if (remainder >= 0) {
          // new block is the beginning of the free block
          let newBlock;

          if (remainder > 0) {
            newBlock = { index: block.index, size: requestedSize };
            block.index += requestedSize;
            block.size = remainder;
          } else {
            newBlock = block;
            freeBlocks.splice(j, 1);
          }

          usedBlocks.push(newBlock);
          return newBlock.index
        }
      }

      return undefined
    }

    function release(index) {
      for (let i = 0; i < usedBlocks.length; i++) {
        const block = usedBlocks[i];
        if (block.index === index) {
          const freedCount = block.size;
          usedBlocks.splice(i, 1);
          insertFreeBlock(block);
          return freedCount
        }
      }
      return 0
    }

    function maxUsed() {
      return usedBlocks.reduce((highest, block) => Math.max(highest, block.index + block.size), 0)
    }

    function insertFreeBlock(mergeBlock) {
      let freed = false;

      for (let j = 0; !freed && j < freeBlocks.length; j++) {
        const otherBlock = freeBlocks[j];
        if (otherBlock.index == mergeBlock.index + mergeBlock.size) {
          // otherBlock immediately after mergeBlock
          otherBlock.index = mergeBlock.index;
          otherBlock.size += mergeBlock.size;
          freed = true;

        } else if (otherBlock.index + otherBlock.size === mergeBlock.index) {
          // otherBlock immediately before mergeBlock
          otherBlock.size += mergeBlock.size;

          // if the mergeBlock also joins to the next block, then merge 
          // otherBlock, mergeBlock and nextBlock
          const nextBlock = freeBlocks[j + 1];
          if (nextBlock && nextBlock.index === otherBlock.index + otherBlock.size) {
            otherBlock.size += nextBlock.size;
            freeBlocks.splice(j + 1, 1); // remove nextBlock
          }
          freed = true;

        } else if (otherBlock.index > mergeBlock.index) {
          // otherBlock is after merge block, but not joined
          freeBlocks.splice(j, 0, mergeBlock);
          freed = true;

        }
      }

      if (!freed) {
        // add the block to the end of the list
        freeBlocks.push(mergeBlock);
      }
    }

    return {
      allocate,
      release,
      maxUsed,
    }
  }

  // remix of https://github.com/mrdoob/three.js/blob/master/src/math/Color.js

  /**
   * @typedef {{r:number, g:number, b:number}} RGBColor
   * @typedef {{r:number, g:number, b:number, a:number}} RGBAColor
   */

  /** @type {(a: any) => boolean} */
  function isColor(a) {
    return typeof a === "object" && "r" in a && "g" in a && "b" in a
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
            const rgb = {
              r: Math.min( 255, parseInt( color[ 1 ], 10 ) ) / 255,
              g: Math.min( 255, parseInt( color[ 2 ], 10 ) ) / 255,
              b: Math.min( 255, parseInt( color[ 3 ], 10 ) ) / 255,
            };
            if (color[5]) {
              rgb.a = parseFloat( color[5] );
            }
            return rgb
          }

          if ( color = /^(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec( components ) ) {

            // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
            const rgb = {
              r: Math.min( 100, parseInt( color[ 1 ], 10 ) ) / 100,
              g: Math.min( 100, parseInt( color[ 2 ], 10 ) ) / 100,
              b: Math.min( 100, parseInt( color[ 3 ], 10 ) ) / 100,
            };
            if (color[5]) {
              rgb.a = parseFloat( color[5] );
            }
            return rgb
          }
          break;

        case 'hsl':
        case 'hsla':

          if ( color = /^([0-9]*\.?[0-9]+)\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(,\s*([0-9]*\.?[0-9]+)\s*)?$/.exec( components ) ) {

            // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
            const rgb = setHSL({r:0,g:0,b:0,a:0}, parseFloat( color[ 1 ] )/360, parseInt( color[ 2 ], 10 )/100, parseInt( color[ 3 ], 10 )/100);
            if (color[5]) {
              rgb.a = parseFloat( color[5] );
            }
            return rgb
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

  // returns a value from a 'root' and an array of 'properties', each property is considered the child of the previous property
  /** @type {(root: {[key: string]: any}, properties: string[]) => any} */
  function getWithPath(root, properties) {
    let path = root;
    let parts = properties && Array.isArray(properties) ? properties.slice().reverse() : [];
    while (path && parts.length > 0) {
      path = path[parts.pop()];
    }

    return path
  }

  const IDENTITY_FN = x => x;
  const MODIFIER_NESTED = Symbol("nested");

  const OPTIONS_SEPARATOR = "|";
  const RANGE_SEPARATOR = "->";

  /**
   * @typedef {{x: number, y: number}} VecXY
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{x: number, y: number, z: number, w: number}} VecXYZW
   * @typedef {{r: number, g: number, b: number}} RGBColor
   * @typedef {number | VecXY | VecXYZ | VecXYZW | RGBColor | string} AttributePart
   */

   /**
   * @template T
   * @typedef {{range?: T[], options?: T[], variable?: string}} Attribute<T>
   */

  /** @type {<T>(str: string, parsePartFn?: (str: string) => T, conversionFn?: (value: T) => T) => Attribute<T>} */
  function parse$1(str, parsePartFn = parsePartAny, conversionFn = IDENTITY_FN) {
    const result = parseRangeOptionVariable( str.trim() );
    if (result.variable) {
      return { variable: result.variable }
    } else if (result.range) {
      return { range: result.range.map( part => conversionFn( parsePartFn(part) ) ) }
    } else {
      return { options: result.options.map( part => conversionFn( parsePartFn(part) ) ) }
    }
  }

  /** @typedef {(str: string) => any} parsePartAnyFn */
  /** @type {parsePartAnyFn} */
  const parsePartAny = (function() {
    const toNumber = str => Number(str.trim());
    
    return /** @type {parsePartAnyFn} */function parsePartAny(str) {
      if (str === "") {
        return ""
      }

      let vec = str.split(" ").filter(x => x !== "").map(toNumber);
      if (!vec.some(isNaN)) {
        switch (vec.length) {
          case 1: return vec[0]
          case 2: return {x: vec[0], y: vec[1]}
          case 3: return {x: vec[0], y: vec[1], z: vec[2]}
          case 4: return {x: vec[0], y: vec[1], z: vec[2], w: vec[3]}
        }
      }
    
      let col = parse(str.trim());
      if (col) {
        return col
      }
    
      return str.trim()
    }
  })();

  function strToVector(str) {
    return str.split(" ").filter(x => x !== "").map(x => Number( x.trim() ))
  }

  function parsePartNumber(str) {
    const num = Number( str.trim() );
    return !str || isNaN(num) ? undefined : num
  }

  function parsePartVec3(str) {
    const vec = strToVector(str);
    return vec.length < 3 || vec.some(isNaN) ? undefined : { x: Number(vec[0]), y: Number(vec[1]), z: Number(vec[2]) }
  }

  function parsePartColor(str) {
    return parse( str.trim() )
  }

  function validateNumber(number) {
    return typeof number === "number"
  }

  function validateVec3(vec3) {
    return typeof vec3 === "object" && "x" in vec3 && "y" in vec3 && "z" in vec3 && typeof vec3.x === "number" && typeof vec3.y === "number" && typeof vec3.z === "number"
  }

  function validateColor(color) {
    return typeof color === "object" && "r" in color && "g" in color && "b" in color && typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number"
  }

  function validateRangeOptionVariable(part, validateItemFn) {
    if (part.range) { return part.range.every(validateItemFn) }
    if (part.options) { return part.options.every(validateItemFn) }
    if (part.variable) { return true } // can only assume that the variables will be the correct type
    return false
  }

  /** @type {<T>(str: string, parsePartFn: (str:string) => T, validateFn: (value:T) => boolean, conversionFn: (value:T) => T) => Attribute<T>} */
  function parseValue(str, parsePartFn, validateFn, conversionFn = IDENTITY_FN) {
    const result = parse$1(str, parsePartFn, conversionFn);
    return validateRangeOptionVariable(result, validateFn) ? result : undefined
  }

  /** @type {<T>(str: string, parsePartFn: (str:string) => T, validateFn: (value:T) => boolean, isSparse: boolean, conversionFn: (value:T) => T) => Attribute<T>[]} */
  function parseArray(str, parsePartFn, validateFn, isSparse, conversionFn = IDENTITY_FN) {
    if (str.trim() === "") {
      return []
    }
    
    const rangeOptions = nestedSplit(str, ",").flatMap( partStr => {
      const str = partStr.trim();
      return !isSparse || str ? parse$1(str, parsePartFn, conversionFn) : undefined
     } );
    return rangeOptions.every( part => isSparse && part === undefined ? true : validateRangeOptionVariable(part, validateFn) ) ? rangeOptions : undefined
  }

  /** @type {(str: string, conversionFn: (RGBColor) => RGBColor) => Attribute<RGBColor>[]} */
  function parseColorArray(str, conversionFn = IDENTITY_FN) {
    return parseArray(str, parsePartColor, validateColor, false, conversionFn)
  }

  /** @type {(str: string, conversionFn: (number) => number) => Attribute<number>} */
  function parseNumber(str, conversionFn = IDENTITY_FN) {
    return parseValue(str, parsePartNumber, validateNumber, conversionFn)
  }

  /** @type {(str: string, conversionFn: (number) => number) => Attribute<number>[]} */
  function parseNumberArray(str, conversionFn = IDENTITY_FN) {
    return parseArray(str, parsePartNumber, validateNumber, false, conversionFn)
  }

  /** @type {(str: string, conversionFn: (value:VecXYZ) => VecXYZ) => Attribute<VecXYZ>} */
  function parseVec3(str, conversionFn = IDENTITY_FN) {
    return parseValue(str, parsePartVec3, validateVec3, conversionFn)
  }


  /** @type {(rule: Attribute<number>) => number} */
  function getMaximum(rule) {
    if (rule.options) {
      if (rule.options.length > 0 && typeof rule.options[0] === "number") {
        // @ts-ignore
        return Math.max(...rule.options)
      }
    } else if (rule.range) {
      if (typeof rule.range[0] === "number") {
        // @ts-ignore
        return Math.max(...rule.range)
      }
    }
    return undefined
  } 

  const varRegEx = /\$([\.\w]+)\$/g;

  // Convert a string "1..3" into {range: ["1","3"]}
  // Convert a string "1|2|3" into {options: ["1","2","3"]}
  // Convert a string "$ab.c.d$" into {variable: "ab.c.d"}
  /** @type { (str: string) => {options?: string[], range?: string[], variable?: string} } */
  function parseRangeOptionVariable(str) {
    if (varRegEx.test(str)) {
      return { variable: str }
    }

    const options = str.split(OPTIONS_SEPARATOR);
    if (options.length > 1) {
      return { options }
    }

    const range = str.split(RANGE_SEPARATOR);
    if (range.length > 1) {
      return { range: [ range[0], range[1] ] } 
    }

    return { options }
  }

  /** @type {(att: Attribute<any>, randomFn: () => number) => any} */
  function randomize(attr, randomFn = Math.random) {
    if (attr && attr.range) {
      const min = attr.range[0];
      const max = attr.range[1];

      if (isColor(min)) {
        return color({r:0, g:0, b:0}, /** @type {RGBColor} */ (min), /** @type {RGBColor} */ (max), randomFn)
      } else if (typeof min === "object" && "x" in min && typeof max === "object" && "x" in max) {
        return vector({x:0, y: 0}, (min), (max), randomFn)
      } else if (typeof min === "number" && typeof max === "number") {
        return float(min, max, randomFn)
      } else {
        return min
      }
      
    } else if (attr && attr.options) {
      return entry(attr.options, randomFn)
    }
  }

  /** @type {<T extends AttributePart>(att: Attribute<T>[], randomFn: () => number) => T[]} */
  function randomizeArray(attrArray, randomFn = Math.random) {
    return attrArray && attrArray.map(part => randomize(part, randomFn))
  }

  /** @type {(attr: any) => string} */
  function stringify(attr) {
    if (typeof attr === "object") {
      if (attr.range) { return stringify(attr.range[0]) + RANGE_SEPARATOR + stringify(attr.range[1]) }
      if (attr.options) { return attr.options.map(option => stringify(option)).join(OPTIONS_SEPARATOR) }
      if (isColor(attr)) { return toString(attr) }
      if ("x" in attr && "y" in attr) { return attr.x + " " + attr.y + ("z" in attr ? " " + attr.z : "") + ("w" in attr ? " " + attr.w : "") }
      if (attr.length && "0" in attr) { return attr.join(",") }
      if (attr instanceof HTMLElement) { return "#" + attr.id }
    }
    return typeof attr !== "undefined" ? attr.toString() : undefined
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


  const DEFAULT = Symbol('default');
  const LAST = Symbol("last");
  const FIRST = Symbol("first");
  const APPEND = Symbol("append");

  // if the setStyle is MODIFIER_NESTED then each set() needs a corresponding unset(), for
  // MODIFIER_OVERWRITE multiple set()s to the same source,target,attribute combination will
  // overwrite previous sets
  function modifierStack(defaultFn = (target, attribute) => undefined, setStyle = MODIFIER_NESTED) {
    const map = new Map();
    
    let indices = [];

    function set(source, target, attribute, value, mode = LAST) {
      if (!map.has(target)) {
        map.set(target, new Array());
      }

      const list = map.get(target);
      if ( findAttributeIndices(indices, list, attribute).length === 0 ) {
        list.push( { source: DEFAULT, mode, attribute, value: defaultFn(target, attribute) } ); // new attribute, set the default first
      }

      const sourceIndex = indices.find(i => list[i].source === source);
      if (setStyle === MODIFIER_NESTED) {

        list.push( {source, mode, attribute, value} ); // add one entry per set()
      } else {

        if (sourceIndex === undefined) {
          list.push( {source, mode, attribute, value} ); // new source for existing attribute
        } else {
          list[sourceIndex].value = value; // existing source and attribute
        }
      }

      findAttributeIndices(indices, list, attribute);
      console.assert(indices.length > 0);

      const firstIndex = indices[0];
      return indices.length === 1 ? list[firstIndex].value : indices.map( i => list[i].value )
    }
    
    function unset(source, target, attribute) {
      if (map.has(target)) {
        const list = map.get(target);

        // remove the last matching item
        for (let i = list.length - 1; i >= 0; i--) {
          const item = list[i];
          if (item.attribute === attribute && item.source === source) {
            list.splice(i, 1);
            break
          }
        }

        indices = findAttributeIndices(indices, list, attribute);
        if (indices.length > 0) {
          const firstIndex = indices[0];
          const newValue = indices.length === 1 ? list[firstIndex].value : indices.map( i => list[i].value );
    
          if (indices.length === 1 && list[firstIndex].source === DEFAULT) {
            list.splice(firstIndex, 1); // remove DEFAULT if it's the only source remaining
          }
    
          return newValue
        }
      }
    }
    
    function findAttributeIndices(outIndices, list, attribute) {
      outIndices.length = 0;

      // FIRST returns the first non-default, or the default if there are no non-default entries
      // LAST returns the last entry (which may be the default)
      // APPEND returns a list of entries, which includes the default

      for (let i = 0, k = 0; i < list.length; i++) {
        const item = list[i];

        if (item.attribute === attribute) {
          outIndices[k] = i;

          if (item.mode === APPEND) {
            k++;
          } else if (item.mode === FIRST && item.source !== DEFAULT) {
            break
          }
        }
      }    

      return outIndices
    }

    return {
      set,
      unset,
      APPEND,
      FIRST,
      LAST,
    }
  }

  function hasAncestor(node, ancestor) {
    let parent = node;
    while (parent && ancestor !== parent) {
      parent = parent.parentNode;
    }
    return !!parent
  }

  function findMatchingAncestor(node, selector) {
    let parent = node;
    while (parent && 'matches' in parent && !parent.matches(selector)) {
      parent = parent.parentNode;
    }
    return parent && 'matches' in parent ? parent : undefined
  }

  function getDebugName(el) {
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length > 0 ? '.' + Array.from( el.classList ).join('.') : '')
  }

  // for large DOMs with few changes, checking the mutations is faster than querySelectorAll()
  function applyNodeMutations(elements, mutations, selector) {
    for (let mutation of mutations) {
      for (let addedEl of mutation.addedNodes) {
        if (addedEl.matches(selector)) {
          elements.push(addedEl);
        }
      }

      for (let removedEl of mutation.removedNodes) {
        if (removedEl.matches(selector)) {
          elements.splice(elements.indexOf(removedEl), 1);
        }
      }
    }
  }

  // *value* can be boolean, string, color or array of numbers
  /** 
   * @typedef { (target: object, prop: string, value: any) => void } SetPropertyFn
   * @type { SetPropertyFn } 
   * */
  const setProperty = (() => {
    const trim = x => x.trim();
    const OBJECT3D_FAST_SET = {
      // @ts-ignore
      "rotation": x => isNaN(x) ? 0 : THREE.Math.degToRad(x),
      "position": x => isNaN(x) ? 0 : x,
      "scale": x => isNaN(x) ? 1 : x,
    };
    
    return /** @type { SetPropertyFn } */function setProperty(target, prop, value) {
      let fn = OBJECT3D_FAST_SET[prop];
      if (fn) {
        if (!Array.isArray(value)) {
          if (typeof value === "object") {
            value = [value.x, value.y, value.z];
          } else if (typeof value === "number") {
            value = [value];
          } else {
            value = value.split(" ").map(trim);
          }        
        }
        value.length = 3;
        target.object3D[prop].set(...value.map(fn));
        return
      }
    
      const parts = prop.split(".");
      if (parts.length <= 2) {
        // component or component.property
        parts[0] = parts[0].replace(/[A-Z]/g, x => "-" + x.toLowerCase()); // convert component names from camelCase to kebab-case
        if (value || typeof value === "boolean" || typeof value === "number") {
          // @ts-ignore
          AFRAME.utils.entity.setComponentProperty(target, parts.join("."), stringify(value));
        } else {
          target.removeAttribute(parts[0], parts[1]); // removes a component or mixin, resets an attribute to default, or removes the attribute if not in the schema
        }
        return
      }
    
      // e.g. object3dmap.mesh.material.uniforms.color
      const path = getWithPath(target, parts.slice(0, -1));
      if (path) {
        // this only works for boolean, string, color and number
        path[ parts[parts.length - 1] ] = value;
      } else {
        console.warn(`unknown path for setProperty() '${prop}'`);
      }
    }   
    
  })();

  /** @type {(el: HTMLElement, prop: string) => string} */
  function getProperty(el, prop) {
    const parts = prop.split(".");

    if (parts.length === 1) {
      return el.getAttribute(prop)

    } else if (parts.length <= 2) {
      parts[0] = parts[0].replace(/[A-Z]/g, x => "-" + x.toLowerCase()); // convert component names from camelCase to kebab-case
      
      const attr = el.getAttribute(parts[0]);
      return typeof attr === "object" ? attr[parts[1]] : undefined
      
    } else {
      const value = getWithPath(el, parts);
      return value
    }
  }

  /** @type {() => {startTimer: (delay: number, callback: () => void) => any, clearTimer: (timer: any) => void, clearAllTimers: () => void, pause: () => void, resume: () => void }} */
  function basicClock() {
    let timers = [];

    function startTimerInternal( timer, delay, callback ) {
      timer.id = setTimeout( () => { clearTimer( timer ); callback(); }, delay*1000);
      timer.startTime = Date.now();
      timer.callback = callback;
    }

    function startTimer( delay, callback ) {
      if (delay > 0) {
        const newTimer = {};
        startTimerInternal( newTimer, delay, callback );
        timers.push( newTimer );
        return newTimer

      } else {
        callback();
      }
    }

    function clearTimer( timer ) {
      const index = timers.indexOf( timer );
      if ( index >= 0 ) {
        clearTimeout( timer.id );
        timers.splice( index, 1 );
      }
    }

    function clearAllTimers() {
      for ( let timer of timers ) {
        clearTimeout( timer.id );
      }
      timers.length = 0;
    }

    function pause() {
      for ( let timer of timers ) {
        timer.resumeTime = Date.now() - timer.startTime;
        clearTimeout( timer.id );
      }
    }

    function resume() {
      for ( let timer of timers ) {
        if ( timer.resumeTime ) {
          startTimerInternal( timer, timer.resumeTime, timer.callback );
          delete timer.resumeTime;
        }
      }
    }

    return {
      startTimer,
      clearTimer,
      clearAllTimers,
      pause,
      resume
    }
  }


  function getElementsInScope( el, selector, selectorScope, eventEl ) {
    switch ( selectorScope ) {
      case "self": return selector ? el.querySelectorAll( selector ) : [ el ]
      case "parent": return selector ? el.parentNode.querySelectorAll( selector ) : [ el ]
      case "event": return selector && eventEl instanceof HTMLElement ? eventEl.querySelectorAll( selector ) : [ el ]
      case "document": 
      default:
        return selector ? document.querySelectorAll( selector ) : [ el ]
    }
  }


  /** @type { ( eventNames: string, callback: EventListener ) => any } */
  function scopedEvents( thisEl, callback ) {
    let eventNames, source, scope;
    let hasListeners = false;
    let elements = [];
    let eventTypes = parseEventNames( eventNames );
   
    function parseEventNames( eventNames ) {
      return eventNames && typeof eventNames === "string" ? eventNames.split( "," ).map( x => x.trim() ) : []
    }

    function set( newEventNames, newSource, newScope ) {
      const wasListening = hasListeners;

      if ( wasListening && ( newEventNames !== eventNames || newSource !== source || newScope !== scope ) ) {
        remove();
      }

      source = newSource;
      scope = newScope;

      if ( eventNames !== newEventNames ) {
        eventNames = newEventNames;
        eventTypes = parseEventNames( eventNames );
      }

      elements = getElementsInScope( thisEl, source, scope, undefined );

      if ( wasListening ) {
        add();
      }
    }

    function add() {
      if ( !hasListeners ) {
        for ( let el of elements ) {
          for ( let type of eventTypes ) {
            el.addEventListener( type, callback );
          }
        }
        hasListeners = true;
      }
    }

    function remove() {
      if ( hasListeners ) {
        for ( let el of elements ) {
          for ( let type of eventTypes ) {
            el.removeEventListener( type, callback );
          }
        }
        hasListeners = false;
      }
    }

    return {
      set,
      add,
      remove,
    }
  }

  function loadTemplate(template, testString, callback) {
    const match = template && template.match(/url\((.+)\)/);
    if (match) {
      const filename = match[1];
      // @ts-ignore
      const fileLoader = new THREE.FileLoader();
      fileLoader.load(
        filename, 
        (data) => callback(data),
        () => {},
        (err) => {
          console.error(`unable to load: ${filename} `, err);
        }
      );
    
    } else if ( testString && template.includes(testString) ) {
      callback( template.trim() );

    } else {
      const templateEl = template ? document.querySelector(template) : undefined;
      callback( templateEl ? templateEl.textContent.trim() : template.trim() );
      
    }
  }

  function log(component, ...msg) {
    console.log(getComponentDebugName(component), ...msg);
  }

  function warn(component, ...msg) {
    console.warn(getComponentDebugName(component), ...msg);
  }

  function error(component, ...msg) {
    console.error(getComponentDebugName(component), ...msg);
  }

  function getComponentDebugName(component) {
    return getDebugName(component.el) + '[' + component.attrName + ']'
  }

  const FEN_DEFAULT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const FEN_CODES = "prnbqkPRNBQK";
  const CASTLE_REGEX = /(O\-O)(\-O)?([\#|\+]?)/;
  const SAN_REGEX = /([RNBKQ]?[a-h]?[1-8]?)(x?)([a-h][1-8])(=[RNBQ])?([\#|\+]?)/;
  const PGN_RESULT_REGEX = /1\-0|0\-1|1\/2\-1\/2|\*/;
  const PGN_TAG_REGEX = /\[\s*(\w+)\s*\"([^\"]*)\"\s*\]/;
  const PGN_MOVETEXT_REGEX = /([\d\.]+)\s*([a-zA-Z][\w\=\#\+\-\/\*]*)\s+([a-zA-Z][\w\=\#\+\-\/\*]*)?\s*(\d\-\/\*)?\s*(\{[^\}*]\})?\s*/;

  function decodeFile(fileStr) {
    return fileStr.charCodeAt(0) - 96
  }

  function decodeRank(rankStr) {
    return rankStr.charCodeAt(0) - 48
  }

  function fileToString(file) {
    return String.fromCharCode(file + 96)
  }

  function rankToString(rank) {
    return String.fromCharCode(rank + 48)
  }

  function moveNumberToMoveOffset(number, player) {
    return (number - 1)*2 + (player === "white" ? 0 : 1)
  }

  // rank "a"->"h" => 1->8, file "1"->"8" -> 1->8
  function coordToFileRank(coord) {
    return coord.length === 2 ? [decodeFile(coord[0]), decodeRank(coord[1])] : undefined
  }

  // rank 1->8 => "a"->"h", file 1->8 -> "1"->"8"
  function fileRankToCoord(file, rank) {
    return String.fromCharCode(file + 96, rank + 48)
  }

  function parseFEN(fenStr) {
    const syntax = { 
      layout: [],
      player: "white",
      whiteKingCastle: false,
      whiteQueenCastle: false,
      blackKingCastle: false,
      blackQueenCastle: false,
      enPassant: undefined,
      halfMove: 0,
      fullMove: 1,
      capturedPieces: []
    };
    const chunks = fenStr.split(" ");

    if (chunks.length < 5) {
      throw Error(`malformed fen`)
    }

    const rankChunks = chunks[0].split("/");

    function appendRank(layout, rank, rankChunk) {
      let file = 1;
      for (let i = 0; i < rankChunk.length; i++) {
        const c = rankChunk[i];
        if (FEN_CODES.includes(c)) {
          layout.push( { code: c, file, rank } );
          file++;
        } else if (Number(c) == c) {
          file += Number(c);
        } else {
          throw Error(`unknown letter "${c}" in fen rank chunk "${rankChunk}"`)
        }
      }
    }

    const numRanks = rankChunks.length;
    for (let i = 0; i < numRanks; i++) {
      const rankChunk = rankChunks[i];
      appendRank(syntax.layout, numRanks - i, rankChunk); // chunks start with the highest rank, all ranks numbered from 1 up
    }

    syntax.player = chunks[1] === "b" ? "black" : "white";

    syntax.whiteKingCastle = chunks[2].includes("K");
    syntax.whiteQueenCastle = chunks[2].includes("Q");
    syntax.blackKingCastle = chunks[2].includes("k");
    syntax.blackQueenCastle = chunks[2].includes("q");

    if (chunks[3] && chunks[3] !== "-") {
      const [file, rank] = coordToFileRank(chunks[3]);
      syntax.enPassant = {file, rank};
    }

    syntax.halfMove = chunks[4] ? Number(chunks[4]) : 0;
    syntax.fullMove = chunks[5] ? Number(chunks[5]) : 1;

    return syntax
  }

  function fenToString(fen) {
    if (!fen) {
      return undefined
    }

    const sortedPieces = fen.layout.sort((a,b) => (b.rank - a.rank)*10 + a.file - b.file); // descending rank, ascending file

    let rankChunks = [];
    let chunk = "";
    let file = 1;
    let rank = 8;
    let pieceIndex = 0;
    let piece = sortedPieces[0];

    while (rank >= 1) {
      if (!piece || rank !== piece.rank) {
        if (file <= 8) {
          chunk += ((8 - file) + 1);
        }
        rankChunks.push(chunk);
        chunk = "";
        file = 1;
        rank--;
      }

      while (piece && piece.rank === rank) {
        if (piece.file > file) {
          chunk += (piece.file - file);
        }
        
        chunk += piece.code;
        file = piece.file + 1;
        piece = sortedPieces[++pieceIndex];
      }
    }

    const starting = fen.player === "white" ? "w" : "b";
    let castle = (fen.whiteKingCastle ? "K" : "") + (fen.whiteQueenCastle ? "Q" : "") + (fen.blackKingCastle ? "k" : "") + (fen.blackQueenCastle ? "q" : "");
    castle = castle ? castle : "-";
    const enPassant = fen.enPassant ? fileRankToCoord(fen.enPassant.file, fen.enPassant.rank) : "-";
    return `${rankChunks.join("/")} ${starting} ${castle} ${enPassant} ${fen.halfMove} ${fen.fullMove}`
  }

  function findEnPassantPiece(fen) {
    if (fen.enPassant) {
      const piece = findPieceByFileRank(fen.layout, fen.enPassant.file, fen.enPassant.rank === 6 ? 5 : 4);
      return piece && piece.code.toLowerCase() === "p" ? piece : undefined
    }
  }

  function decodeCoordMove(fen, moveStr) {
    const fromFile = moveStr.charCodeAt(0) - 96;
    const fromRank = moveStr.charCodeAt(1) - 48;
    const toFile = moveStr.charCodeAt(2) - 96;
    const toRank = moveStr.charCodeAt(3) - 48;
    const promotion = moveStr[4];

    const movePiece = findPieceByFileRank(fen.layout, fromFile, fromRank);
    if (!movePiece) {
      throw Error(`unable to find piece for move ${moveStr}`)
    }
    const enPassantPiece = (fen.enPassant && movePiece.code.toLowerCase() === "p" && toFile === fen.enPassant.file && toRank === fen.enPassant.rank) ? findEnPassantPiece(fen) : undefined;
    const capturedPiece = findPieceByFileRank(fen.layout, toFile, toRank) || enPassantPiece;

    const isBlack = movePiece.code === movePiece.code.toLowerCase();
    const isCastle = (movePiece.code === "k" || movePiece.code === "K") && Math.abs(fromFile - toFile) === 2;
    const kingside = toFile > fromFile;
    const castle = !isCastle ? "" : ( isBlack ? (kingside ? "k" : "q") : (kingside ? "K" : "Q") );
    const promote = !promotion ? "" : ( isBlack ? promotion.toLowerCase() : promotion.toUpperCase() );

    return {
      code: movePiece.code, // k for black king, K for white king
      fromFile,
      fromRank,
      capture: !!capturedPiece,
      toFile,
      toRank,
      promote,
      castle,
      check: "", // unknown
    }
  }

  function coordToString(move) {
    return fileRankToCoord(move.fromFile, move.fromRank) + fileRankToCoord(move.toFile, move.toRank) + move.promote
  }

  function decodeSAN(player, sanStr) {
    const isWhite = player === "white";
    const castleParts = sanStr.match(CASTLE_REGEX);
    
    if (castleParts) {
      const code = isWhite ? "K" : "k";
      const castle = castleParts[2] ? (isWhite ? "Q" : "q") : (isWhite ? "K" : "k");
      const toFile = castleParts[2] ? 3 : 7;
      const toRank = isWhite ? 1 : 8;

      return {
        code, // k for black king, K for white king
        fromFile: undefined,
        fromRank: undefined,
        capture: false,
        toFile,
        toRank,
        promote: "",
        castle, // one of kqKQ, uppercase for white, k for king side, q for queen side
        check: castleParts[3], // + # or empty
      }
    }

    const parts = sanStr.match(SAN_REGEX);
    if (!parts) {
      return undefined
    }

    const pieceStr = parts[1];
    const c0 = pieceStr[0];

    let code = undefined;
    let fromRank = undefined;
    let fromFile = undefined;
    let fileRankOffset = 0;

    if ("PRNBKQ".includes(c0)) {
      code = isWhite ? c0.toUpperCase() : c0.toLowerCase();
      fileRankOffset = 1;
    } else {
      code = isWhite ? "P" : "p";
    }

    if (fileRankOffset < pieceStr.length) {
      fromFile = decodeFile(pieceStr[fileRankOffset]);
      fromRank = decodeRank(pieceStr[pieceStr.length - 1]); // rank is always last, if used
      fromFile = fromFile >= 1 && fromFile <= 8 ? fromFile : undefined;
      fromRank = fromRank >= 1 && fromRank <= 8 ? fromRank : undefined;
    }

    const [toFile, toRank] = coordToFileRank(parts[3]);
    const promote = !parts[4] ? "" : isWhite ? parts[4][1].toUpperCase() : parts[4][1].toLowerCase();
    
    return parts ? {
      code: code, // one of prnbqkPRNBQK (upper case for white)
      fromFile, // may be undefined or in the range (1,8)
      fromRank, // may be undefined or in the range (1,8)
      capture: parts[2] === "x", // true or false
      toFile, // in the range (1,8)
      toRank, // in the range (1,8)
      promote, // one of rnbqRNBQ or empty (upper case for white)
      castle: "",
      check: parts[5], // + # or empty
    } : undefined
  }

  function sanToString(san) {
    if (san) {
      const code = san.code.toUpperCase() !== "P" && !san.castle ? san.code.toUpperCase() : "";
      const fromFile = san.fromFile ? fileToString(san.fromFile) : "";
      const fromRank = san.fromRank ? rankToString(san.fromRank) : "";
      const to = !san.castle ? fileRankToCoord(san.toFile, san.toRank) : "";
      const promote = san.promote ? "=" + san.promote.toUpperCase() : "";
      const capture = san.capture ? "x" : "";
      if (san.castle) {
        return (san.castle.toUpperCase() === "K" ? "O-O" : "O-O-O") + san.check
      } else {
        return code + fromFile + fromRank + capture + to + promote + san.check
      }
    }
  }

  function parsePGN(pgn) {
    let game = {moves: []};
    const text = pgn.replace(/\r\n|\n/, " ");

    let i = 0;
    let lookForTags = true;
    let lookForMoves = true;

    while (lookForTags && i < text.length) {
      const nextText = text.slice(i);
      const tagMatch = nextText.match(PGN_TAG_REGEX);
      if (tagMatch) {
        game[tagMatch[1]] = tagMatch[2];
        i += tagMatch[0].length + tagMatch.index;
      } else {
        lookForTags = false;
      }
    }


    while (lookForMoves && i < text.length) {
      const nextText = text.slice(i);
      const moveMatch = nextText.match(PGN_MOVETEXT_REGEX);
      if (moveMatch) {
        let player = moveMatch[1].includes("...") ? "black" : "white";

        if (game.moves.length === 0) {
          const moveNumber = Number( moveMatch[1].slice( 0, moveMatch[1].indexOf(".") ) );
          game.moveOffset = moveNumberToMoveOffset(moveNumber, player);
        }

        game.moves.push( decodeSAN(player, moveMatch[2]) );
    
        if ( moveMatch[3] && player === "white" && !PGN_RESULT_REGEX.test(moveMatch[3]) ) {
          game.moves.push( decodeSAN("black", moveMatch[3]) );
        }
    
        i += moveMatch[0].length + moveMatch.index;
      } else {
        lookForMoves = false;
      }
    }

    return game
  }

  // is a move feasible for this piece, given it's current location? 
  // Note, it may include illegal moves e.g. en passant without another pawn,
  // moving through other pieces, moving through check for castling
  // Bote, both rank and file are numbers between 1 and 8 inclusive
  function isMovePossible(piece, move) {
    const fromFile = piece.file;
    const fromRank = piece.rank;
    const toFile = move.toFile;
    const toRank = move.toRank;

    if (fromFile === toFile && fromRank === toRank) {
      return false
    }

    const isBlack = piece.code === piece.code.toLowerCase();

    switch(piece.code) {
      case "p":
      case "P":
        if (fromFile === toFile && !move.capture) {
          if (isBlack && fromRank === 7) {
            return toRank === 6 || toRank === 5
          } else if (!isBlack && fromRank === 2) {
            return toRank === 3 || toRank === 4
          } else {
            return toRank === fromRank + (isBlack ? -1 : 1)
          }
        } else if ( move.capture && (fromFile - 1 === toFile || fromFile + 1 === toFile) ) {
          return toRank === fromRank + (isBlack ? -1 : 1)
        }
        return false

      case "r":
      case "R":
        return fromFile === toFile || fromRank === toRank

      case "n":
      case "N": {
        const colDelta = Math.abs(fromFile - toFile);
        const rowDelta = Math.abs(fromRank - toRank);
        return (colDelta === 2 && rowDelta === 1) || (colDelta === 1 && rowDelta === 2)
      }

      case "b":
      case "B":
        return Math.abs(fromFile - toFile) === Math.abs(fromRank - toRank)

      case "q":
      case "Q":
        return Math.abs(fromFile - toFile) === Math.abs(fromRank - toRank) || fromFile === toFile || fromRank === toRank

      case "k":
      case "K":
        return (Math.abs(fromFile - toFile) <= 1 && Math.abs(fromRank - toRank) <= 1) || // king move
          ( !move.capture && fromFile === 5 && (fromRank === (isBlack ? 8 : 1)) && (toFile === 3 || toFile === 7) && (fromRank === toRank) ) // castle
    }
  }

  function isMoveBlocked(layout, piece, move) {
    if (piece.code.toUpperCase() !== "N") {
      const fileDelta = Math.sign(move.toFile - piece.file);
      const rankDelta = Math.sign(move.toRank - piece.rank);
      let file = piece.file + fileDelta; // don't check (piece.file,piece.rank)
      let rank = piece.rank + rankDelta;

      while (file !== move.toFile || rank !== move.toRank) {
        if (findPieceByFileRank(layout, file, rank)) {
          return true
        }
        file += fileDelta;
        rank += rankDelta;
      }  
    }

    return move.capture ? false : !!findPieceByFileRank(layout, move.toFile, move.toRank) // only check (move.toFile,move.toRank) for captures
  }

  function findPieceByFileRank(layout, file, rank) {
    return layout.find(piece => {
      return piece.file === file && piece.rank === rank
    })
  }

  function findPieceByMove(layout, move) {
    return layout.find(piece => {
      if (piece.code === move.code) {
        if (isMovePossible(piece, move)) {
          if (!move.fromFile && !move.fromRank) {
            return !isMoveBlocked(layout, piece, move)
          } else {
            return (!move.fromFile || piece.file === move.fromFile) && (!move.fromRank || piece.rank === move.fromRank)
          }
        }
      }
    })
  }

  function applyMove(fen, move) {
    const actions = [];

    const piece = findPieceByMove(fen.layout, move);
    if (!piece) {
      throw Error(`unable to find piece for move`)
    }

    const isPawn = piece.code === "P" || piece.code === "p";
    const isBlack = piece.code === piece.code.toLowerCase();

    if (move.castle) {
      const kingside = move.castle.toUpperCase() === 'K';
      const rook = findPieceByFileRank(fen.layout, kingside ? 8 : 1, isBlack ? 8 : 1);
      if (!rook) {
        throw Error(`unable to find rook to castle`)
      }

      actions.push({ type: 'castle', king: piece, rook, kingside });

      piece.file = kingside ? 7 : 3;
      rook.file = kingside ? 6 : 4;
      fen.enPassant = undefined;

    } else {

      actions.push({ type: 'move', piece, fromFile: piece.file, fromRank: piece.rank, toFile: move.toFile, toRank: move.toRank } );

      if (move.capture) {
        const capturedPiece = findPieceByFileRank(fen.layout, move.toFile, move.toRank) || (isPawn && findEnPassantPiece(fen));
        if (!capturedPiece) {
          throw Error(`unable to find piece to capture`)
        }
    
        actions.push({ type: "capture", capturedPiece, capturedIndex: fen.capturedPieces.length });
    
        fen.capturedPieces.push(capturedPiece);  
        fen.layout.splice( fen.layout.indexOf(capturedPiece), 1 );
    
      }

      if (isPawn && Math.abs(piece.rank - move.toRank) == 2) {
        fen.enPassant = { file: piece.file, rank: (piece.rank + move.toRank)/2 };
      } else {
        fen.enPassant = undefined;
      }
    
      // must be after the capturedPiece check
      piece.file = move.toFile;
      piece.rank = move.toRank;

      if (move.promote) {
        const newPiece = {code: move.promote, file: move.toFile, rank: move.toRank};
    
        actions.push({ type: "promote", piece, newPiece, file: move.toFile, rank: move.toRank, capturedIndex: fen.capturedPieces.length });

        fen.layout.splice( fen.layout.indexOf(piece), 1 );
        fen.capturedPieces.push(piece);
        fen.layout.push(newPiece);
      }

    }

    if (!isPawn && !move.capture) {
      fen.halfMove++;
    } else {
      fen.halfMove = 0;
    }

    if (isBlack) {
      fen.blackKingCastle = fen.blackKingCastle && piece.code !== "k" && (piece.code !== "r" || piece.file !== 8);
      fen.blackQueenCastle = fen.blackKingCastle && piece.code !== "k" && (piece.code !== "r" || piece.file !== 1);
      fen.fullMove++;
    } else {
      fen.whiteKingCastle = fen.whiteKingCastle && piece.code !== "K" && (piece.code !== "R" || piece.file !== 8);
      fen.whiteQueenCastle = fen.whiteKingCastle && piece.code !== "K" && (piece.code !== "R" || piece.file !== 1);
    }

    return actions
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

  /** @type {<T extends Vertices>(out: T, x: number, y: number, z: number, oi: number) => T} */
  function set(out, x=0, y=0, z=0, oi=0) {
    out[oi] = x;
    out[oi+1] = y;
    out[oi+2] = z;
    return out
  }

  /** @type {<T extends Vertices, TA extends Vertices, TB extends Vertices>(out: T, a: TA, b: TB, ai: number, bi: number, oi: number) => T} */
  function sub(out, a, b, ai = 0, bi = 0, oi = 0) {
    out[oi] = a[ai] - b[bi];
    out[oi+1] = a[ai+1] - b[bi+1];
    out[oi+2] = a[ai+2] - b[bi+2];
    return out
  }

  /** @type {<T extends Vertices, TA extends Vertices>(out: T, a: TA, ai: number, oi: number) => T} */
  function normalize(out, a, ai = 0, oi = 0) {
    const ax = a[ai], ay = a[ai+1], az = a[ai+2];
    const len = Math.hypot(ax, ay, az) || 1;
    out[oi] = ax/len;
    out[oi+1] = ay/len;
    out[oi+2] = az/len;
    return out
  }

  /** @type {<TA extends Vertices, TB extends Vertices>(a: TA, b: TB, ai: number, bi: number, oi: number) => number} */
  function dot(a, b, ai = 0, bi = 0) {
    return a[ai]*b[bi] + a[ai+1]*b[bi+1] + a[ai+2]*b[bi+2]
  }

  // out = a + b*s
  /** @type {<T extends Vertices, TA extends Vertices, TB extends Vertices>(out: T, a: TA, b: TB, s: number, ai: number, bi: number, oi: number) => T} */
  function scaleAndAdd(out, a, b, s, ai = 0, bi = 0, oi = 0) {
    out[oi] = a[ai] + b[bi]*s;
    out[oi+1] = a[ai+1] + b[bi+1]*s;
    out[oi+2] = a[ai+2] + b[bi+2]*s;
    return out
  }

  /** @type {<TA extends Vertices, TB extends Vertices>(a: TA, b: TB, tolerance: number) => boolean} */
  function equals(a, b, tolerance = 0.00001, ai = 0, bi = 0) {
    return Math.abs(a[ai] - b[bi]) < tolerance && Math.abs(a[ai+1] - b[bi+1]) < tolerance && Math.abs(a[ai+2] - b[bi+2]) < tolerance
  }

  /** @type {<T extends Vertices, TA extends Vertices, TB extends Vertices>(out: T, a: TA, b: TB, ai: number, bi: number, oi: number) => T} */
  function cross(out, a, b, ai = 0, bi = 0, oi = 0) {
    const ax = a[ai], ay = a[ai+1], az = a[ai+2];
    const bx = b[bi], by = b[bi+1], bz = b[bi+2];
    out[oi] = ay*bz - az*by;
    out[oi+1] = az*bx - ax*bz;
    out[oi+2] = ax*by - ay*bx;
    return out
  }

  // sets the vector to the normal of the plane formed by points p0, p1 and p2
  /** @typedef {<T extends Vertices, TP0 extends Vertices, TP1 extends Vertices, TP2 extends Vertices>(out: T, a: TP0, b: TP1, c: TP2, ai?: number, bi?: number, ci?: number, oi?: number) => T} SetFromCoplanarPointsFn */
  /** @type {SetFromCoplanarPointsFn} */
  const setFromCoplanarPoints = (function() {
    let vbc = new Float32Array(3);
    let vba = new Float32Array(3);
    let crossProduct = new Float32Array(3);

    return /** @type {SetFromCoplanarPointsFn} */function setFromCoplanerPoints(out, a, b, c, ai = 0, bi = 0, ci = 0, oi = 0) {
      sub(vbc, c, b, ci, bi);
      sub(vba, a, b, ai, bi);
      return normalize( out, cross(crossProduct, vbc, vba), 0, oi )
    }
  })();

  // from https://en.wikipedia.org/wiki/Centroid
  /** @type {<T extends Vertices, TV extends Vertices>(out: T, vertices: TV, indices: number[], oi?: number) => T} */
  function centroidFromIndices(out, vertices, indices, oi = 0) {
    const n = indices.length;

    let x = 0, y = 0, z = 0;

    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      x += vertices[i]/n;
      y += vertices[i+1]/n;
      z += vertices[i+2]/n;
    }

    return set(out, x, y, z, oi)
  }

  // from https://en.wikipedia.org/wiki/Coplanarity
  /** @typedef {<TA extends Vertices, TB extends Vertices, TC extends Vertices, TD extends Vertices>(a: TA, b: TB, c: TC, d: TD, tolerance: number, ai: number, bi: number, ci: number, di: number) => boolean} AreCoplanarFn */
  /** @type {AreCoplanarFn} */
  const areCoplanar = (function() {
    const ba = new Float32Array(3);
    const ca = new Float32Array(3);
    const da = new Float32Array(3);
    return /** @type {AreCoplanarFn} */ function areCoplanar(a, b, c, d, tolerance = 1e-5, ai=0, bi=0, ci=0, di=0) {
      sub(ba, b, a, bi, ai);
      sub(ca, c, a, ci, ai);
      sub(da, d, a, di, ai);

      // ideally we would use normalized vectors, but do we want the extra cost?
      return Math.abs( dot( da, cross(ba, ba, ca) ) ) < tolerance
    }
  })();

  /** @type {<T extends Vertices, TA extends Vertices>(out: T, a: TA, s: number, ai?: number, oi?: number) => T} */
  function multiplyScalar(out, a, s, ai=0, oi=0) {
    out[oi] = a[ai]*s;
    out[oi+1] = a[ai+1]*s;
    out[oi+2] = a[ai+2]*s;
    return out
  }

  /** @type {<T extends Vertices, TV extends Vertices, TA extends Affine4>(out: T, vertices: TV, aff: TA, vi?: number, oi?: number) => T} */
  function applyAffine4(out, vertices, aff, vi=0, oi=0) {
    const vx = vertices[vi], vy = vertices[vi+1], vz = vertices[vi+2];

    out[oi] = aff[0]*vx + aff[4]*vy + aff[8]*vz + aff[12];
    out[oi+1] = aff[1]*vx + aff[5]*vy + aff[9]*vz + aff[13];
    out[oi+2] = aff[2]*vx + aff[6]*vy + aff[10]*vz + aff[14];

    return out
  }

  // import hullCModule from "../build/hull.c.mjs"

  /**
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{x: number, y: number, z: number, w: number}} QuatXYZW
   * @typedef {number[] | Float32Array} Vertices
   */

  function generateHullTriangles(vertices, stride = 3) {
    const numVertices = vertices.length;
    if (numVertices < 12) {
      return undefined // too few triangles for a hull
    }

    /** @typedef { {ai: number, bi: number, ci: number, normal: Vertices, } } HullFace */
    /** @type { HullFace[] } */
    const hullFaces = [];
    const hullCenter = new Float32Array(3); // the centroid is used to determine the outward normals
    const vec3 = new Float32Array(3);
    const TOLERANCE = 1e-5; // tolerance for rounding errors in calculations

    /** @type {(ai: number, bi: number, ci: number) => HullFace} */
    function buildFace(ai, bi, ci) {
      const normal = new Float32Array(3);

      setFromCoplanarPoints(normal, vertices, vertices, vertices, ai, bi, ci);

      // if the normal is in the same direction as the centroid to vertex ai, then ai,bi,ci are counter-clockwise
      // and the normal is correct, otherwise ai,bi,ci are clockwise, so swap bi and ci and reverse the normal
      if (dot(normal, sub(vec3, vertices, hullCenter, ai)) > 0) {
        return { ai, bi, ci, normal }
      } else {
        return { ai, bi:ci, ci:bi, normal: multiplyScalar(normal, normal, -1) }
      }
    }

    /** @type {(fi: number) => number[]} */
    function getFacingFaces(fi) {
      let faceIndices = [];

      for (let i = 0; i < hullFaces.length; i++) {
        normalize( vec3, sub(vec3, vertices, vertices, fi, hullFaces[i].ai) );
        const dot$1 = dot( vec3, hullFaces[i].normal );
        if (dot$1 > TOLERANCE) {
          faceIndices.push(i);
        }
      }
      return faceIndices
    }

    /** @type {(faceIndices: number[]) => number[][]} */
    function getEdgesFromFaces(faceIndices) {
      return faceIndices.flatMap(index => {
        const face = hullFaces[index];
        return [[face.ai,face.bi], [face.ai,face.ci], [face.bi,face.ci]]
      })
    }

    /** @type {(edges: number[][]) => number[][]} */
    function removeDuplicateEdges(edges) {
      for (let i = 0; i < edges.length; ) {
        let removed = false;

        for (let j = i + 1; j < edges.length; j++) {
          if ( (edges[i][0] === edges[j][0] && edges[i][1] === edges[j][1]) ||
               (edges[i][1] === edges[j][0] && edges[i][0] === edges[j][1]) ) {
            edges.splice(j, 1); // remove the highest index first
            edges.splice(i, 1);
            removed = true;
            break // an edge can only be duplicated once
          }
        }

        if (!removed) {
          i++;
        }
      }

      return edges
    }

    // form a triangular pyramid with the first 4 non-coplanar unique vertices in the hull
    let numProcessed = 0;
    let di = 0;

    for (let ai = 0, bi = 0, ci = 0, i = stride; i < numVertices; i += stride) {
      if (bi === 0) {
        if (!equals(vertices, vertices, 1e-5, i, ai)) {
          bi = i;
        }
      } else if (ci === 0) {
        if (!equals(vertices, vertices, 1e-5, i, bi)) {
          ci = i;
        }
      } else if (di === 0) {
        if (!equals(vertices, vertices, 1e-5, i, ci) && !areCoplanar(vertices, vertices, vertices, vertices, 1e-5, ai, bi, ci, i)) {
          di = i;
          centroidFromIndices(hullCenter, vertices, [ai,bi,ci,di]);
          hullFaces.push( buildFace(ai, bi, ci) );
          hullFaces.push( buildFace(ai, bi, di) );
          hullFaces.push( buildFace(ai, ci, di) );
          hullFaces.push( buildFace(bi, ci, di) );
          numProcessed = 4;
          break
        }
      }
    }

    if (numProcessed === 0) {
      return undefined // all points are coplanar, unable to build a hull
    }

    for (let xi = 3*stride; xi < numVertices; xi += stride) {
      if (xi === di) {
        continue
      }

      const faceIndices = getFacingFaces(xi);
      const edges = getEdgesFromFaces(faceIndices);

      if (faceIndices.length > 1) {
        removeDuplicateEdges(edges); // duplicate edges represent edges that will now be inside convex shape
      }

      // update the centroid with the new vertex
      scaleAndAdd(hullCenter, vertices, hullCenter, numProcessed, xi, 0);
      multiplyScalar(hullCenter, hullCenter, 1/(numProcessed + 1));

      // remove faceIndices from higest to lowest faceIndices[index], so each index is still valid after previous removals
      for (let index = faceIndices.length - 1; index >= 0; --index) {
        hullFaces.splice(faceIndices[index], 1);
      }

      // build the new faces using the edges silhoeutte
      for (let edge of edges) {
        hullFaces.push( buildFace(edge[0], edge[1], xi) );
      }

      numProcessed++;
    }

    return hullFaces.flatMap(face => [face.ai, face.bi, face.ci])
  }

  // export const c = hullCModule()
  // const cGenerateHullTriangles = c.cwrap('generateHullTriangles', 'number', ['number', 'array', 'number', 'number'])

  // export function generateHullTriangles2(vertices, stride = 3) {
  //   const verticesTyped = vertices.buffer ? vertices : Float32Array.from(vertices)

  //   const verticesUint8 = new Uint8Array(verticesTyped.buffer, 0, verticesTyped.byteLength)
  //   const outIndicesPtr = c._malloc(1024*3*4); // offset into c.HEAPU8.buffer

  //   const numIndices = cGenerateHullTriangles(outIndicesPtr, verticesUint8, vertices.length, stride)
  //   const indices = numIndices > 0 ? new Int32Array(c.HEAPU8.buffer, outIndicesPtr, numIndices) : []
  //   c._free(outIndicesPtr)

  //   if (numIndices < 0) {
  //     console.error("cGenerateHullTriangles failed: ", numIndices)
  //   }

  //   return indices
  // }

  const calcMatrixWorld = (function() {
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    return function calcMatrixWorld(instancedMesh, index, outMatrixWorld = new THREE.Matrix4()) {
      getQuaternionAt(instancedMesh, index, quaternion);
      getPositionAt(instancedMesh, index, position);
      getScaleAt(instancedMesh, index, scale);
    
      outMatrixWorld.compose(position, quaternion, scale);
      outMatrixWorld.premultiply(instancedMesh.matrixWorld);
      return outMatrixWorld
    }
  })();


  const calcOffsetMatrix = (function() {
    const instancedMatrixWorld = new THREE.Matrix4();

    return function calcOffsetMatrix(base3D, instancedMesh, index, outOffsetMatrix = new THREE.Matrix4()) {
      calcMatrixWorld(instancedMesh, index, instancedMatrixWorld);
      outOffsetMatrix.getInverse(base3D.matrixWorld).multiply(instancedMatrixWorld);
      return outOffsetMatrix
    }  
  })();


  const applyOffsetMatrix = (function() {
    const invParentMatrix = new THREE.Matrix4();
    const newMatrix = new THREE.Matrix4(); 
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    
    return function applyOffsetMatrix(base3D, instancedMesh, index, offsetMatrix) {
      invParentMatrix.getInverse(instancedMesh.parent.matrixWorld);  
      newMatrix.multiplyMatrices(base3D.matrixWorld, offsetMatrix); // determine new world matrix
      newMatrix.premultiply(invParentMatrix); // convert to a local matrix
      newMatrix.decompose(position, quaternion, scale);

      setPositionAt(instancedMesh, index, position);
      setQuaternionAt(instancedMesh, index, quaternion);
    }
  })();


  function createMesh(obj3D, count) {
    const mesh = obj3D ? obj3D.getObjectByProperty("isMesh", true) : undefined;
    if (!mesh || !mesh.geometry || !mesh.material) {
      return undefined
    }

    function onBeforeCompile(oldFunction) {
      return function onBeforeCompile(shader) {
        if (oldFunction) {
          oldFunction(shader);
        }

        let vertexShader = shader.vertexShader;
        let fragmentShader = shader.fragmentShader;
    
        vertexShader = vertexShader.replace('void main()', `
      attribute vec3 instancePosition;
      attribute vec4 instanceQuaternion;
      attribute vec4 instanceColor;
      attribute float instanceScale;
  
      varying vec4 vInstanceColor;
  
      vec3 applyQuaternion( const vec3 v, const vec4 q ) 
      {
        return v + 2. * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
      }
  
      void main()`);
    
        vertexShader = vertexShader.replace('#include <color_vertex>', `
      #include <color_vertex>
      vInstanceColor = instanceColor;`);
    
        vertexShader = vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = applyQuaternion( position*instanceScale, instanceQuaternion ) + instancePosition;`);
    
        vertexShader = vertexShader.replace('#include <defaultnormal_vertex>', `
      vec3 transformedNormal = normalMatrix * applyQuaternion( objectNormal/instanceScale, -instanceQuaternion );
      
      #ifdef FLIP_SIDED
        transformedNormal = - transformedNormal;
      #endif
  
      #ifdef USE_TANGENT
        vec3 transformedTangent = normalMatrix * applyQuaternion( objectTangent/instanceScale, -instanceQuaternion );
        #ifdef FLIP_SIDED
          transformedTangent = - transformedTangent;
        #endif
      #endif`);
    
        fragmentShader = fragmentShader.replace('#include <color_pars_fragment>', `
      #include <color_pars_fragment>
      varying vec4 vInstanceColor;`);
    
        fragmentShader = fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor *= vInstanceColor;`);
    
        shader.vertexShader = vertexShader;
        shader.fragmentShader = fragmentShader;
      }
    }

    const FLOATS_PER_QUATERNION = 4;
    const FLOATS_PER_POSITION = 3;
    const FLOATS_PER_COLOR = 3;
    const FLOATS_PER_SCALE = 3;

    const quaternions = new Float32Array(count*FLOATS_PER_QUATERNION);
    const positions = new Float32Array(count*FLOATS_PER_POSITION);
    const scales = new Float32Array(count*FLOATS_PER_SCALE);
    const colors = new Float32Array(count*FLOATS_PER_COLOR).fill(1);

    for (let i = 0; i < count; i++) {
      quaternions[i*FLOATS_PER_QUATERNION + 3] = 1;
    }

    const instancePosition = new THREE.InstancedBufferAttribute(positions, FLOATS_PER_POSITION);
    const instanceQuaternion = new THREE.InstancedBufferAttribute(quaternions, FLOATS_PER_QUATERNION);
    const instanceScale = new THREE.InstancedBufferAttribute(scales, FLOATS_PER_SCALE);
    const instanceColor = new THREE.InstancedBufferAttribute(colors, FLOATS_PER_COLOR);

    const instancedGeometry = new THREE.InstancedBufferGeometry().copy(mesh.geometry);
    instancedGeometry.maxInstancedCount = count;

    instancedGeometry.setAttribute("instancePosition", instancePosition);
    instancedGeometry.setAttribute("instanceQuaternion", instanceQuaternion);
    instancedGeometry.setAttribute("instanceScale", instanceScale);
    instancedGeometry.setAttribute("instanceColor", instanceColor);

    let instancedMaterial = mesh.material;

    // patch shaders
    if (Array.isArray(mesh.material)) {
      instancedMaterial = mesh.material.map(x => x.clone());
      instancedMaterial.forEach(x => x.onBeforeCompile = onBeforeCompile(x.onBeforeCompile));
    } else {
      instancedMaterial = mesh.material.clone();
      instancedMaterial.onBeforeCompile = onBeforeCompile(instancedMaterial.onBeforeCompile);
    }

    const instancedMesh = new THREE.Mesh(instancedGeometry, instancedMaterial);
    instancedMesh.frustumCulled = false;

    return instancedMesh
  }


  function setPositionAt(instancedMesh, index, xOrVec3, y, z) {
    const position = instancedMesh.geometry.getAttribute("instancePosition");
    if (typeof xOrVec3 === "object") {
      position.setXYZ(index, xOrVec3.x, xOrVec3.y, xOrVec3.z);
    } else {
      position.setXYZ(index, xOrVec3, y, z);
    }
    position.needsUpdate = true;
  }


  function getPositionAt(instancedMesh, index, outPosition = new THREE.Vector3()) {
    const position = instancedMesh.geometry.getAttribute("instancePosition");
    outPosition.x = position.getX(index);
    outPosition.y = position.getY(index);
    outPosition.z = position.getZ(index);
    return outPosition
  }


  function setQuaternionAt(instancedMesh, index, xOrQuaternion, y, z, w) {
    const quaternion = instancedMesh.geometry.getAttribute("instanceQuaternion");
    if (typeof xOrQuaternion === "object") {
      quaternion.setXYZW(index, xOrQuaternion.x, xOrQuaternion.y, xOrQuaternion.z, xOrQuaternion.w);
    } else {
      quaternion.setXYZW(index, xOrQuaternion, y, z, w);
    }
    quaternion.needsUpdate = true;
  }


  function getQuaternionAt(instancedMesh, index, outQuaternion = new THREE.Quaternion()) {
    const quaternion = instancedMesh.geometry.getAttribute("instanceQuaternion");
    outQuaternion.x = quaternion.getX(index);
    outQuaternion.y = quaternion.getY(index);
    outQuaternion.z = quaternion.getZ(index);
    outQuaternion.w = quaternion.getW(index);
    return outQuaternion
  }


  function setColorAt(instancedMesh, index, rOrColor, g, b) {
    const color = instancedMesh.geometry.getAttribute("instanceColor");
    if (typeof rOrColor === "object") {
      color.setXYZ(index, rOrColor.r, rOrColor.g, rOrColor.b);
    } else {
      color.setXYZ(index, rOrColor, g, b);
    }
    color.needsUpdate = true;
  }


  function setScaleAt(instancedMesh, index, xOrVec3, y, z) {
    const scale = instancedMesh.geometry.getAttribute("instanceScale");
    if (typeof xOrVec3 === "object") {
      scale.setXYZ(index, xOrVec3.x, xOrVec3.y, xOrVec3.z);
    } else {
      scale.setXYZ(index, xOrVec3, y, z);
    }
    scale.needsUpdate = true;
  }


  function getScaleAt(instancedMesh, index, outScale = new THREE.Vector3()) {
    const scale = instancedMesh.geometry.getAttribute("instanceScale");
    outScale.x = scale.getX(index);
    outScale.y = scale.getY(index);
    outScale.z = scale.getZ(index);
    return outScale
  }

  /** @type {(a: number, b: number, t: number) => number} */
  function lerp(a, b, t) {
    if (t === 0) return a
    return a + (b - a)*t
  }

  /** @type {<TA extends {[key: string]: number}>(a: TA, b: {[key: string]: number}, t: number) => TA} */
  function lerpObject(a, b, t) {
    let out = Object.assign({}, a); // copy values from a in case the keys do not exist in b
    if (t === 0) return out

    for (let k in b) {
      // @ts-ignore
      out[k] = typeof a[k] !== "undefined" ? lerp(a[k], b[k], t) : b[k];
    }
    return out
  }

  function lerpKeys(keys, r, easingFn = Linear) {
    const n = keys.length;

    if (r <= 0 || n <= 1) {
      return [0,0]
    } else if (r >= 1) {
      return [n-2,1]
    }

    const k = r*(n - 1);
    const i = ~~k;
    const t = easingFn(k - i);
    return [i,t]
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

  /** 
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{x: number, y: number, z: number, w: number}} QuatXYZW
   * @typedef {Float32Array | number[]} Affine4
   * @typedef {number} Distance
   */

  /** @typedef {<EN extends VecXYZ, EX extends VecXYZ, AN extends VecXYZ, AX extends VecXYZ>(extentsMin: EN, extentsMax: EX, boxAMin: AN, boxAMax: AX, affineA: Affine4, affineB: Affine4) => void} SeparatingAxisFn */
  /** @type {SeparatingAxisFn} */
  const separatingAxis = (function () {
    const vertA = {x:0, y:0, z:0};

    return /** @type {SeparatingAxisFn} */function separatingAxis(extentsMin, extentsMax, boxAMin, boxAMax, affineA, affineB) {
      // map boxA into boxB space, and determine the extents
      for (let corner = 0; corner < 8; corner++) {
        vertA.x = corner % 2 ? boxAMax.x : boxAMin.x;
        vertA.y = (corner >>> 1) % 2 ? boxAMax.y : boxAMin.y;
        vertA.z = (corner >>> 2) % 2 ? boxAMax.z : boxAMin.z;
      
        multiplyVecXYZ( vertA, affineA, vertA );
        invertAndMultiplyVecXYZ( vertA, affineB, vertA );
      
        if (corner === 0) {
          copy(extentsMin, vertA);
          copy(extentsMax, vertA);
        } else {
          min(extentsMin, vertA, extentsMin);
          max(extentsMax, vertA, extentsMax);
        }
      }
    }
  })();

  // Returns true if two boxes overlap
  /** @typedef {<AN extends VecXYZ, AX extends VecXYZ, BN extends VecXYZ, BX extends VecXYZ>(boxAMin: AN, boxAMax: AX, affineA: Affine4, boxBMin: BN, boxBMax: BX, affineB: Affine4) => number} BoxToBoxFn */
  /** @type {BoxToBoxFn} */
  const boxToBox = (function() {
    let extentsMin = {x:0,y:0,z:0};
    let extentsMax = {x:0,y:0,z:0};

    /** @type {<AN extends VecXYZ, AX extends VecXYZ, BN extends VecXYZ, BX extends VecXYZ>(boxAMin: AN, boxAMax: AX, affineA: Affine4, boxBMin: BN, boxBMax: BX, affineB: Affine4) => number} */
    function boxSATDistance(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB) {
      separatingAxis(extentsMin, extentsMax, boxAMin, boxAMax, affineA, affineB);

      // returns the distance
      return Math.max(extentsMin.x - boxBMax.x, extentsMin.y - boxBMax.y, extentsMin.z - boxBMax.z,
        boxBMin.x - extentsMax.x, boxBMin.y - extentsMax.y, boxBMin.z - extentsMax.z)
    }
    
    return /** @type {BoxToBoxFn} */ function boxToBox(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB) {
      const dAB = boxSATDistance(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB);
      const dBA = boxSATDistance(boxBMin, boxBMax, affineB, boxAMin, boxAMax, affineA);
      return Math.max(dAB, dBA)
    }
    
  })();

  function isNetworked(component) {
    let curEntity = component.el;

    while(curEntity && curEntity.components && !curEntity.components.networked) {
      curEntity = curEntity.parentNode;
    }

    return curEntity && curEntity.components && curEntity.components.networked && curEntity.components.networked.data
  }

  function takeOwnership(component) {
    if (typeof NAF === "object" && isNetworked(component)) {
      NAF.utils.takeOwnership(component.el);
    } 
  }

  function isMine(component) {
    if (typeof NAF === "object" && isNetworked(component)) {
      const owner = NAF.utils.getNetworkOwner(component.el);
      return !owner || owner === NAF.clientId
    }
    return true
  }

  function getClientId() {
    return typeof NAF === "object" ? NAF.clientId : undefined
  }

  function networkSystem(componentName) {

    return {
      registerNetworking(component, callbacks) {
        if (typeof NAF === "object") {
          const el = component.el;
          console.assert(!this.networkCallbacks.has(component), `component already registered`);
          this.networkCallbacks.set(component, callbacks);
    
          // if NAF.client is not set then requestSync() will be called from onConnected
          // if networkId is not set then requestSync() will be called from onEntityCreated
          if (NAF.clientId && NAF.utils.getNetworkId(el)) {
            this.requestSync(component);
          }
    
          if (typeof callbacks.onOwnershipGained === "function") {
            el.addEventListener("ownership-gained", callbacks.onOwnershipGained);
          }
    
          if (typeof callbacks.onOwnershipLost === "function") {
            el.addEventListener("ownership-lost", callbacks.onOwnershipLost);
          }
    
          if (typeof callbacks.onOwnershipChanged === "function") {
            el.addEventListener("ownership-changed", callbacks.onOwnershipChanged);
          }
        }
      },
    
      unregisterNetworking(component) {
        if (typeof NAF === "object") {
          console.assert(this.networkCallbacks.has(component), `component not registered`);
          const el = component.el;
          const callbacks = this.networkCallbacks.get(component);
    
          if (typeof callbacks.onOwnershipGained === "function") {
            el.removeEventListener("onOwnershipGained", callbacks.onOwnershipGained);
          }
    
          if (typeof callbacks.onOwnershipLost === "function") {
            el.removeEventListener("onOwnershipLost", callbacks.onOwnershipLost);
          }
    
          if (typeof callbacks.onOwnershipChanged === "function") {
            el.removeEventListener("onOwnershipChanged", callbacks.onOwnershipChanged);
          }
    
          this.networkCallbacks.delete(component);
        }
      },
    
      setupNetwork() {
        if (typeof NAF === "object") {
          this.networkCache = {};
          this.networkCallbacks = new Map();
          this.networkPacket = {};
    
          NAF.connection.subscribeToDataChannel(componentName, (senderId, type, packet, targetId) => {
            const entity = NAF.entities.getEntity(packet.networkId);
            const component = entity ? entity.components[componentName] : undefined;
    
            if (packet.data === "NETRequestSync") {
              if (component && NAF.clientId === NAF.utils.getNetworkOwner(entity)) {
                const callbacks = this.networkCallbacks.get(component);
                if (typeof callbacks.requestSync === "function") {
                  callbacks.requestSync(senderId);
                }  
              }
    
            } else if (component) {
              const callbacks = this.networkCallbacks.get(component);
              if (typeof callbacks.receiveNetworkData === "function") {
                callbacks.receiveNetworkData(packet.data, senderId);
              }
    
            } else {
              // we've received a packet for an element that does not yet exist, so cache it
              // TODO do we need an array of packets?
              packet.senderId = senderId;
              this.networkCache[packet.networkId] = packet;
            }
          });
    
          this.onEntityCreated = this.onEntityCreated.bind(this);
          this.onClientConnected = this.onClientConnected.bind(this);
          this.onClientDisconnected = this.onClientDisconnected.bind(this);
          this.onConnected = this.onConnected.bind(this);
    
          if (!NAF.clientId) {
            document.body.addEventListener("connected", this.onConnected);
          }
    
          document.body.addEventListener("entityCreated", this.onEntityCreated);
          document.body.addEventListener("clientConnected", this.onClientConnected);
          document.body.addEventListener("clientDisconnected", this.onClientDisconnected);
        }
      },
    
      shutdownNetwork() {
        if (typeof NAF === "object") {
          NAF.connection.unsubscribeToDataChannel(componentName);
    
          document.body.removeEventListener("connected", this.onConnected); // ok to remove even if never added
          document.body.removeEventListener("entityCreated", this.onEntityCreated);
          document.body.removeEventListener("clientConnected", this.onClientConnected);
          document.body.removeEventListener("clientDisconnected", this.onClientDisconnected);
    
          console.assert(this.networkCallbacks.length === 0, `missing calls to unregisterNetworking(). Some components are still registered`);
          delete this.networkCallbacks;
          delete this.networkCache;
        }
      },
    
      broadcastNetworkData(component, data) {
        this.sendNetworkData(component, data, undefined);
      },
    
      sendNetworkData(component, data, targetId) {
        if (typeof NAF === "object") {
          const networkId = NAF.utils.getNetworkId(component.el);
          if (networkId) {
            this.networkPacket.networkId = networkId;
            this.networkPacket.data = data;
            if (targetId) {
              NAF.connection.sendDataGuaranteed(targetId, componentName, this.networkPacket);
            } else {
              NAF.connection.broadcastData(componentName, this.networkPacket);
            }
          }
        }
      },
    
      onConnected(event) {
        this.networkCallbacks.forEach((_, component) => {
          this.requestSync(component);
        });
        document.body.removeEventListener("connected", this.onConnected);
      },
    
      onEntityCreated(event) {
        const el = event.detail.el;
        const component = el.components[componentName];
        const networkId = NAF.utils.getNetworkId(el);
        const packet = networkId ? this.networkCache[networkId] : undefined;
    
        if (component && packet) {
          const callbacks = this.networkCallbacks.get(component);
          if (typeof callbacks.receiveNetworkData === "function") {
            callbacks.receiveNetworkData(packet.data, packet.senderId);
          }
          delete this.networkCache[networkId];
        }
    
        if (component && NAF.clientId) {
          this.requestSync(component);
        }
      },
    
      onClientConnected(event) {
        const clientId = event.detail.clientId;
        this.networkCallbacks.forEach((callbacks) => {
          if (typeof callbacks.onClientConnected === "function") {
            callbacks.onClientConnected(event);
          }
        });
      },
    
      onClientDisconnected(event) {
        const clientId = event.detail.clientId;
        this.networkCallbacks.forEach((callbacks) => {
          if (typeof callbacks.onClientDisconnected === "function") {
            callbacks.onClientDisconnected(event);
          }
        });
      },
    
      requestSync(component) {
        this.broadcastNetworkData(component, "NETRequestSync");
      },
    
    }
  }

  /** @type {<AN extends VecXYZ, AX extends VecXYZ, BN extends VecXYZ, BX extends VecXYZ>(boxAMin: AN, boxAMax: AX, affineA: Affine4, boxBMin: BN, boxBMax: BX, affineB: Affine4) => boolean} */
  function boxWithBox(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB) {
    return boxToBox(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB) < 0
  }

  /** @typedef {<AN extends VecXYZ, AX extends VecXYZ, BN extends VecXYZ, BX extends VecXYZ>(boxAMin: AN, boxAMax: AX, affineA: Affine4, boxBMin: BN, boxBMax: BX, affineB: Affine4) => boolean} BoxWithinBoxFn */
  /** @type {BoxWithinBoxFn} */
  const boxWithinBox = (function() {
    let extentsMin = {x:0,y:0,z:0};
    let extentsMax = {x:0,y:0,z:0};

    return /** @type {BoxWithinBoxFn} */ function boxWithinBox(boxAMin, boxAMax, affineA, boxBMin, boxBMax, affineB) {
      separatingAxis(extentsMin, extentsMax, boxAMin, boxAMax, affineA, affineB);

      return extentsMin.x > boxBMin.x && extentsMin.y > boxBMin.y && extentsMin.z > boxBMin.z &&
        extentsMax.x < boxBMax.x && extentsMax.y < boxBMax.y && extentsMax.z < boxBMax.z
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

  function verifyMaterialNeedsUpdate(material, canvas) {
    for (let map of ["map", "alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap", "envMap", "lighMap", "metalnessMap", "normalMap", "roughnessMap"]) {
      if (material[map] && material[map].image === canvas) {
        material[map].needsUpdate = true;
      }
    }
  }

  function verifyUniformNeedsUpdate(material, canvas) {
    if (material.uniforms && 
        material.uniforms.map && 
        material.uniforms.map.value && 
        typeof material.uniforms.map.value === "object" && 
        material.uniforms.map.value.image === canvas) {
      material.uniforms.map.value.needsUpdate = true;
    }
  }

  /** @type {(rootObject3D: object, canvas: object) => void} */
  function updateMaterialsUsingThisCanvas(rootObject3D, canvas) {
    rootObject3D.traverse((node) => {
      if (node.material) {
        if (Array.isArray(node.material)) {
          for (let mat of node.material) {
            verifyMaterialNeedsUpdate(mat, canvas);
            verifyUniformNeedsUpdate(mat, canvas);
          }
        } else {
          verifyMaterialNeedsUpdate(node.material, canvas);
          verifyUniformNeedsUpdate(node.material, canvas);
        }
      }
    });
  }

  /** @typedef {<T extends Extent>(out: T, object3D: object) => T} SetOBBFromObject3DFn */
  /** @type {SetOBBFromObject3DFn} */
  const setOBBFromObject3D = (function() {
    // @ts-ignore
    let tempPosition = new THREE.Vector3();
    // @ts-ignore
    let tempQuaternion = new THREE.Quaternion();
    // @ts-ignore
    let tempScale = new THREE.Vector3();
    // @ts-ignore
    let tempBox3 = new THREE.Box3();

    return /** @type {SetOBBFromObject3DFn} */function setOBBFromObject3D(ext, object3D) {
      // HACK we force the worldmatrix to identity for the object and remmove the parent
      // so we can get a bounding box based around the origin
      tempPosition.copy(object3D.position);
      tempQuaternion.copy(object3D.quaternion);
      tempScale.copy(object3D.scale);
      const tempParent = object3D.parent;

      object3D.parent = null;
      object3D.position.set(0,0,0); // TODO - we should get rid of these???!!!
      object3D.quaternion.set(0,0,0,1);
      object3D.scale.set(1,1,1);
      object3D.updateMatrixWorld(true);

      tempBox3.setFromObject(object3D); // expensive for models

      object3D.parent = tempParent;
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

  function generateOrientedBoundingBox(obj3D, debugColor) {
    // cache boundingBox and boundingSphere
    obj3D.boundingBox = obj3D.boundingBox || new THREE.Box3();
    obj3D.boundingSphere = obj3D.boundingSphere || new THREE.Sphere();
    if (obj3D.boundingBoxDebug) {
      obj3D.remove(obj3D.boundingBoxDebug);
      obj3D.boundingBoxDebug = undefined;
    }

    setOBBFromObject3D(obj3D.boundingBox, obj3D);

    if (!obj3D.boundingBox.isEmpty()) {
      obj3D.boundingBox.getBoundingSphere(obj3D.boundingSphere);

      if (debugColor) {
        const extents = new THREE.Vector3();
        obj3D.boundingBox.getSize(extents);

        const group = new THREE.Group();
        const box = new THREE.Box3Helper(obj3D.boundingBox, debugColor);
        const axes = new THREE.AxesHelper( Math.min(extents.x, extents.y, extents.z) );
        group.add(axes);
        group.add(box);
        group.name = "orientedBoundingDebug";

        obj3D.add(group);
        obj3D.boundingBoxDebug = group;
      }
    }
  }
    
    
  // adapted from d3-threeD.js
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this file,
   * You can obtain one at http://mozilla.org/MPL/2.0/. */

   var DEGS_TO_RADS = Math.PI / 180;

   var DIGIT_0 = 48, DIGIT_9 = 57, COMMA = 44, SPACE = 32, PERIOD = 46, MINUS = 45;
   
   function shapeFromPathString(pathStr) {
       if (pathStr[0] === '"' || pathStr[0] === "'") {
         pathStr = pathStr.substring(1, pathStr.length-1); // get rid of string delimiters
       }
   
   
       var path = new THREE.Shape();
   
       var idx = 1, len = pathStr.length, activeCmd,
       x = 0, y = 0, nx = 0, ny = 0, firstX = null, firstY = null,
       x1 = 0, x2 = 0, y1 = 0, y2 = 0,
       rx = 0, ry = 0, xar = 0, laf = 0, sf = 0, cx, cy;
   
       function eatNum() {
           var sidx, c, isFloat = false, s;
           // eat delims
           while (idx < len) {
               c = pathStr.charCodeAt(idx);
               if (c !== COMMA && c !== SPACE) break;
               idx++;
           }
           if (c === MINUS) sidx = idx++;
           else sidx = idx;
           // eat number
           while (idx < len) {
               c = pathStr.charCodeAt(idx);
               if (DIGIT_0 <= c && c <= DIGIT_9) {
                   idx++;
                   continue;
               }
               else if (c === PERIOD) {
                   idx++;
                   isFloat = true;
                   continue;
               }
   
               s = pathStr.substring(sidx, idx);
               return isFloat ? parseFloat(s) : parseInt(s);
           }
   
           s = pathStr.substring(sidx);
           return isFloat ? parseFloat(s) : parseInt(s);
       }
   
       function nextIsNum() {
           var c;
           // do permanently eat any delims...
           while (idx < len) {
               c = pathStr.charCodeAt(idx);
               if (c !== COMMA && c !== SPACE) break;
               idx++;
           }
           c = pathStr.charCodeAt(idx);
           return (c === MINUS || (DIGIT_0 <= c && c <= DIGIT_9));
       }
   
       var canRepeat;
       activeCmd = pathStr[0];
       while (idx <= len) {
           canRepeat = true;
           switch (activeCmd) {
               // moveto commands, become lineto's if repeated
               case 'M':
                   x = eatNum();
                   y = eatNum();
                   path.moveTo(x, y);
                   activeCmd = 'L';
                   firstX = x;
                   firstY = y;
                   break;
   
               case 'm':
                   x += eatNum();
                   y += eatNum();
                   path.moveTo(x, y);
                   activeCmd = 'l';
                   firstX = x;
                   firstY = y;
                   break;
   
               case 'Z':
               case 'z':
                   canRepeat = false;
                   if (x !== firstX || y !== firstY)
                   path.lineTo(firstX, firstY);
                   break;
   
               // - lines!
               case 'L':
               case 'H':
               case 'V':
                   nx = (activeCmd === 'V') ? x : eatNum();
                   ny = (activeCmd === 'H') ? y : eatNum();
                   path.lineTo(nx, ny);
                   x = nx;
                   y = ny;
                   break;
   
               case 'l':
               case 'h':
               case 'v':
                   nx = (activeCmd === 'v') ? x : (x + eatNum());
                   ny = (activeCmd === 'h') ? y : (y + eatNum());
                   path.lineTo(nx, ny);
                   x = nx;
                   y = ny;
                   break;
   
               // - cubic bezier
               case 'C':
                   x1 = eatNum(); y1 = eatNum();
   
               case 'S':
                   if (activeCmd === 'S') {
                       x1 = 2 * x - x2; y1 = 2 * y - y2;
                   }
                   x2 = eatNum();
                   y2 = eatNum();
                   nx = eatNum();
                   ny = eatNum();
                   path.bezierCurveTo(x1, y1, x2, y2, nx, ny);
                   x = nx; y = ny;
                   break;
   
               case 'c':
                   x1 = x + eatNum();
                   y1 = y + eatNum();
   
               case 's':
                   if (activeCmd === 's') {
                       x1 = 2 * x - x2;
                       y1 = 2 * y - y2;
                   }
                   x2 = x + eatNum();
                   y2 = y + eatNum();
                   nx = x + eatNum();
                   ny = y + eatNum();
                   path.bezierCurveTo(x1, y1, x2, y2, nx, ny);
                   x = nx; y = ny;
                   break;
   
               // - quadratic bezier
               case 'Q':
                   x1 = eatNum(); y1 = eatNum();
   
               case 'T':
                   if (activeCmd === 'T') {
                       x1 = 2 * x - x1;
                       y1 = 2 * y - y1;
                   }
                   nx = eatNum();
                   ny = eatNum();
                   path.quadraticCurveTo(x1, y1, nx, ny);
                   x = nx;
                   y = ny;
                   break;
   
               case 'q':
                   x1 = x + eatNum();
                   y1 = y + eatNum();
   
               case 't':
                   if (activeCmd === 't') {
                       x1 = 2 * x - x1;
                       y1 = 2 * y - y1;
                   }
                   nx = x + eatNum();
                   ny = y + eatNum();
                   path.quadraticCurveTo(x1, y1, nx, ny);
                   x = nx; y = ny;
                   break;
   
               // - elliptical arc
               case 'A':
                   rx = eatNum();
                   ry = eatNum();
                   xar = eatNum() * DEGS_TO_RADS;
                   laf = eatNum();
                   sf = eatNum();
                   nx = eatNum();
                   ny = eatNum();
                   if (rx !== ry) {
                       console.warn("Forcing elliptical arc to be a circular one :(",
                       rx, ry);
                   }
   
                   // SVG implementation notes does all the math for us! woo!
                   // http://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
                   // step1, using x1 as x1'
                   x1 = Math.cos(xar) * (x - nx) / 2 + Math.sin(xar) * (y - ny) / 2;
                   y1 = -Math.sin(xar) * (x - nx) / 2 + Math.cos(xar) * (y - ny) / 2;
                   // step 2, using x2 as cx'
                   var norm = Math.sqrt(
                       (rx*rx * ry*ry - rx*rx * y1*y1 - ry*ry * x1*x1) /
                       (rx*rx * y1*y1 + ry*ry * x1*x1));
   
                   if (laf === sf) norm = -norm;
                   x2 = norm * rx * y1 / ry;
                   y2 = norm * -ry * x1 / rx;
                   // step 3
                   cx = Math.cos(xar) * x2 - Math.sin(xar) * y2 + (x + nx) / 2;
                   cy = Math.sin(xar) * x2 + Math.cos(xar) * y2 + (y + ny) / 2;
   
                   var u = new THREE.Vector2(1, 0),
                   v = new THREE.Vector2((x1 - x2) / rx,
                   (y1 - y2) / ry);
                   var startAng = Math.acos(u.dot(v) / u.length() / v.length());
                   if (u.x * v.y - u.y * v.x < 0) startAng = -startAng;
   
                   // we can reuse 'v' from start angle as our 'u' for delta angle
                   u.x = (-x1 - x2) / rx;
                   u.y = (-y1 - y2) / ry;
   
                   var deltaAng = Math.acos(v.dot(u) / v.length() / u.length());
                   // This normalization ends up making our curves fail to triangulate...
                   if (v.x * u.y - v.y * u.x < 0) deltaAng = -deltaAng;
                   if (!sf && deltaAng > 0) deltaAng -= Math.PI * 2;
                   if (sf && deltaAng < 0) deltaAng += Math.PI * 2;
   
                   path.absarc(cx, cy, rx, startAng, startAng + deltaAng, sf);
                   x = nx;
                   y = ny;
                   break;
   
               default:
                   throw new Error("weird path command: " + activeCmd);
           }
   
           // just reissue the command
           if (canRepeat && nextIsNum()) continue;
           activeCmd = pathStr[idx++];
   
       }
   
       return path;
   } 
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

    return function randomPointOnTriangleEdge(vertices, pos) {
      // assume each set of 3 vertices (each vertex has 3 floats) is a triangle
      const triangleOffset = Math.floor(Math.random()*vertices.length/9)*9;
      const r = Math.random()*3; // integer part is the vertex, fractional part is the ratio to the next edge

      if (r > 2) {
        v1.fromArray(vertices, triangleOffset + 6);
        v2.fromArray(vertices, triangleOffset);
      } else if (r > 1) {
        v1.fromArray(vertices, triangleOffset + 3);
        v2.fromArray(vertices, triangleOffset + 6);
      } else {
        v1.fromArray(vertices, triangleOffset);
        v2.fromArray(vertices, triangleOffset + 3);
      }

      pos.copy(v2).sub(v1).multiplyScalar( r - Math.floor(r) ).add(v1);
    }  
  })();

  function randomVertex(vertices, pos) {
    let index = Math.floor( Math.random()*vertices.length/3 )*3;
    pos.fromArray(vertices, index);
  }

  function calcOffsetMatrix$1(base3D, offset3D, outOffsetMatrix = new THREE.Matrix4()) {
    outOffsetMatrix.getInverse(base3D.matrixWorld).multiply(offset3D.matrixWorld);
    return outOffsetMatrix
  }

  const applyOffsetMatrix$1 = (function() {
    const invParentMatrix = new THREE.Matrix4();
    const newMatrix = new THREE.Matrix4(); 
    
    return function applyOffsetMatrix(base3D, offset3D, offsetMatrix) {
      invParentMatrix.getInverse(offset3D.parent.matrixWorld);  
      newMatrix.multiplyMatrices(base3D.matrixWorld, offsetMatrix); // determine new world matrix
      newMatrix.premultiply(invParentMatrix); // convert to a local matrix
      newMatrix.decompose(offset3D.position, offset3D.quaternion, offset3D.scale);
    }
  })();

  AFRAME.registerComponent("chalk", {
    dependencies: ["raycaster"],

    schema: {
      color: { type: "color" },
      length: { default: 0.1 },
      radius: { default: 0.02 },
      debug: { default: false },
    },

    init() {
      this.boards = [];
      this.onRaycasterIntersection = this.onRaycasterIntersection.bind( this );
      this.onRaycasterIntersectionCleared = this.onRaycasterIntersectionCleared.bind( this );

      const data = this.data;
      const geometry = new THREE.CylinderBufferGeometry( data.radius, data.radius, data.length, 16 );
      geometry.applyMatrix( new THREE.Matrix4().set( 1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1 ) ); // 90 degrees on x

      const mesh = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { color: data.color }) );
      this.el.setObject3D( "mesh", mesh );

      // this.el.setAttribute( "raycaster", { far: data.length*.5 + data.radius*2 } )
    },

    update(oldData) {
      const data = this.data;
      
      if (data.color !== oldData.color) {
        const mesh = this.el.getObject3D( "mesh" );
        if ( mesh && mesh.material && !Array.isArray( mesh.material ) ) {
          mesh.material.color.setStyle( data.color );
        }
      }
    },

    play() {
      this.el.addEventListener( "raycaster-intersection", this.onRaycasterIntersection );
      this.el.addEventListener( "raycaster-intersection-cleared", this.onRaycasterIntersectionCleared );
    },

    pause() {
      this.el.removeEventListener( "raycaster-intersection", this.onRaycasterIntersection );
      this.el.removeEventListener( "raycaster-intersection-cleared", this.onRaycasterIntersectionCleared );
    },

    onRaycasterIntersection( e ) {
      if ( this.data.debug ) {
        console.log( "contact" );
      }

      if ( this.boards.length === 0 ) {
        this.startTick();
      }

      this.boards.push( ...e.detail.els.map( el => ( { el, radius: -1, ctx: undefined, texture: undefined, prevIntersection: undefined } ) ) );
    },

    onRaycasterIntersectionCleared( e ) {
      if ( this.data.debug ) {
        console.log( "cleared" );
      }

      // BUG clearedEls is empty
      // for ( let el of e.detail.clearedEls ) {
      //   this.boards.splice( this.boards.findIndex( board => board.el === el ), 1 )
      // }

      this.boards.length = 0;
    },

    tick() {
      if ( this.boards.length === 0 ) {
        this.stopTick();
        return
      }

      const aframeRaycaster = this.el.components[ "raycaster" ];

      for ( let board of this.boards ) {
        this.tryDrawOnBoard( aframeRaycaster, board );
      }
    },

    startTick() {
      this.el.sceneEl.addBehavior( this );
    },

    stopTick() {
      this.el.sceneEl.removeBehavior( this );
    },

    tryDrawOnBoard: ( function() {
      const transformedUV = new THREE.Vector2();

      return function tryDrawOnBoard( aframeRaycaster, board ) {
        const data = this.data;
        const intersection = aframeRaycaster.getIntersection( board.el );
          
        if ( !intersection ) {
          return false
        }

        // const interactionLength = data.length/2 + data.radius  
        // if ( intersection.distance > interactionLength ) {
        //   return false
        // }

        if ( !board.ctx ) {
          let canvas, texture;

          if ( intersection.object && intersection.object.isMesh ) {
            texture = intersection.object.material.map;
            if ( texture && texture.image && texture.image instanceof HTMLCanvasElement ) {
              canvas = texture.image;
            }
          }

          board.ctx = canvas ? canvas.getContext("2d") : undefined;
          board.texture = texture;
        }

        const ctx = board.ctx;
        const texture = board.texture;

        // determine the pixel radius of the chalk radius
        if ( board.radius < 0 && ctx ) {
          if ( !board.prevIntersection ) {
            board.prevIntersection = intersection;

          } else {
            const dPos = intersection.point.distanceTo( board.prevIntersection.point );

            if ( dPos > 1e-3 ) {
              const radiusRatio = data.radius/dPos;
              const x = radiusRatio * ( intersection.uv.x - board.prevIntersection.uv.x ) * ctx.canvas.width;
              const y = radiusRatio * ( intersection.uv.y - board.prevIntersection.uv.y ) * ctx.canvas.height;

              board.radius = Math.hypot( x, y );
              board.prevIntersection = undefined;
            }
          }
        }

        const radius = board.radius;

        if ( ctx && texture && radius > 0 ) {
          transformedUV.set( intersection.uv.x, intersection.uv.y );
          texture.transformUv( transformedUV );

          const canvas = ctx.canvas;
          const x = transformedUV.x * canvas.width;
          const y = transformedUV.y * canvas.height;
          const r = board.radius;

          ctx.beginPath();
          ctx.fillStyle = data.color;
          ctx.arc( x, y, r, 0, 2*Math.PI );
          ctx.fill();

          updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, canvas);
        }

        return true
      }
    } )(),
  });

  const MESHES_ORDER = "rnbqkpRNBQKP".split("");
  const NUM_RANKS = 8;
  const NUM_FILES = 8;
  const CAPTURED_SIZE = 10;
  const URL_REGEX = /url\((.*)\)/;
  const toLowerCase = (str) => str.toLowerCase();

  // Network the chess component.  The owner manages the AI, and replay, but any client can provide human moves 
  // (although move validation is always handled by the owner).
  AFRAME.registerSystem("chess", {

    ...networkSystem("chess"),

    init() {
      this.setupNetwork();
    },

    remove() {
      this.shutdownNetwork();
    },

  });


  AFRAME.registerComponent("chess", {
    schema: {
      model: { default: "https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/assets/chess_set/chess_set.glb" },
      meshes: { default: "rook,knight',bishop',queen,king,pawn,rook,knight,bishop,queen,king,pawn" },
      boardMesh: { default: "board" },
      blackColor: { type: "color", default: "#444" },
      whiteColor: { type: "color", default: "#eee" },
      highlightColor: { type: "color", default: "#ff0" },
      fen: { default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
      pgn: { default: "" },
      debug: { default: false },
      boardMoveSpeed: { default: 4 },
      replayTurnDuration: { default: .5 },
      mode: { oneOf: ["freestyle", "replay", "static", "game"], default: "freestyle", parse: toLowerCase },
      aiDuration: { default: 1 },
      whitePlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
      blackPlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
      maxCountPerPiece: { default: 8 },
      aiWorker: { default: "https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/garbochess.js" }
    },

    init() {
      this.onObject3dSet = this.onObject3dSet.bind(this);
      this.onHoverStart = this.onHoverStart.bind(this);
      this.onHoverEnd = this.onHoverEnd.bind(this);
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);
      this.onReset = this.onReset.bind(this);

      this.el.addEventListener("object3dset", this.onObject3dSet);
      this.el.addEventListener("hoverstart", this.onHoverStart);
      this.el.addEventListener("hoverend", this.onHoverEnd);
      this.el.addEventListener("grabstart", this.onGrabStart);
      this.el.addEventListener("grabend", this.onGrabEnd);
      this.el.addEventListener("reset", this.onReset);

      this.chessMaterial = new THREE.MeshStandardMaterial();
      this.blackColor = new THREE.Color(.2,.2,.2);
      this.whiteColor = new THREE.Color(.8,.8,.8);
      this.highlightColor = new THREE.Color(1,1,0);
      this.gameBounds = new THREE.Box3();
      this.pgnAST = undefined;
      this.rotate180Quaternion = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3(0,1,0), Math.PI);
      this.board = {
        name: "",
        board3D: undefined,
        bounds: new THREE.Box3(),
      };
      this.garbochess = undefined;

      this.state = {
        // global state
        fenAST: { layout: [], capturedPieces: [], player: "white" },
        replayIndex: 0,
        currentPlayer: "white",
        globalMode: "",
        playerInfo: {},

        // local state
        actions: [],
        grabMap: new Map(),
        movers: [],
        nextAIMove: "",
        nextHumanMove: "",
        pickingSide: "none",
        delay: 0,
        localMode: "setup",
        pendingLocalMove: "",
        waitingForSetup: false,
      };

      const data = this.data;
      this.el.setAttribute("gltf-model", data.model);
      this.meshInfos = this.parseMeshes(data.meshes);
      this.board.name = data.boardMesh.trim();
      this.pendingMode = "";

      this.system.registerNetworking(this, { 
        onClientDisconnected: this.onClientDisconnected.bind(this),
        onOwnershipGained: this.onOwnershipGained.bind(this),
        onOwnershipLost: this.onOwnershipLost.bind(this),
        receiveNetworkData: this.receiveNetworkData.bind(this),
        requestSync: this.requestSync.bind(this),
      });
    },

    remove() {
      this.system.unregisterNetworking(this);

      this.el.removeEventListener("object3dset", this.onObject3dSet);
      this.el.removeEventListener("hoverstart", this.onHoverStart);
      this.el.removeEventListener("hoverend", this.onHoverEnd);
      this.el.removeEventListener("grabstart", this.onGrabStart);
      this.el.removeEventListener("grabend", this.onGrabEnd);
      this.el.removeEventListener("reset", this.onReset);
    },

    update(oldData) {
      const data = this.data;

      if (data.pgn !== oldData.pgn) {
        this.pgnAST = this.parsePGN(data.pgn);
      }

      if (data.blackColor) this.blackColor.set(data.blackColor);
      if (data.whiteColor) this.whiteColor.set(data.whiteColor);
      this.highlightColor.set(data.highlightColor);

      if (isMine(this)) {
        const state = this.state;
        let gameChanged = false;

        if (data.mode !== oldData.mode) {
          state.globalMode = data.mode;
          gameChanged = true;
        }
    
        if (data.whitePlayer !== oldData.whitePlayer || data.blackPlayer !== oldData.blackPlayer) {
          state.playerInfo["white"] = { playerType: data.whitePlayer !== "human" ? "ai" : "human", networkClientId: undefined };
          state.playerInfo["black"] = { playerType: data.blackPlayer !== "human" ? "ai" : "human", networkClientId: undefined };
          gameChanged = true;
        }
      
        if (gameChanged) {
          this.resetGame(state.globalMode);
        }
      }
    },

    tick(time, deltaTime) {
      const dt = Math.min(0.1, deltaTime/1000);
      const data = this.data;
      const state = this.state;

      switch (state.localMode) {
        case "freestyle":
          this.grabTick();
          break
        case "replay":
          this.actionsTick(dt, data.boardMoveSpeed);
          this.replayTick();
          break
        case "game":
          this.actionsTick(dt, data.boardMoveSpeed);
          if (state.playerInfo[state.currentPlayer].playerType === "ai") {
            this.aiTick();
          } else {
            this.grabTick();
            this.humanTick();
          }
          break
        case "network":
          this.actionsTick(dt, state.actions.length < 4 ? data.boardMoveSpeed : data.boardMoveSpeed*4);
          if (state.actions.length === 0) {
            this.grabTick(); // in case they can grab things
          }
      }
    },

    setCurrentPlayer(player) {
      const state = this.state;
      const data = this.data;
      const playerInfo = state.playerInfo[player];

      state.currentPlayer = player;
      state.fenAST.player = player;

      if (playerInfo.playerType === "ai") {
        this.setupPicking("none");
        state.nextAIMove = "";

        if (isMine(this)) {
          this.garbochess.postMessage("search " + data.aiDuration*1000);
        }
      } else {
        state.nextHumanMove = "";
        //this.garbochess.postMessage("possible")
        this.setupHumanPicking(player);
      }
    },

    nextTurn() {
      this.setCurrentPlayer(this.state.currentPlayer === "white" ? "black" : "white");
    },

    parseMeshes(meshes) {
      const meshesList = meshes.split(",");

      if (meshesList.length !== MESHES_ORDER.length) {
        error(this, `missing meshes, found ${meshesList.length}, expecting ${MESHES_ORDER.length}`);
        return []

      } else {
        return Object.fromEntries( meshesList.map((x,i) => {
          x = x.trim();
          const rotate180 = x[x.length - 1] === "'";
          return [MESHES_ORDER[i], { name: (rotate180 ? x.slice(0,-1) : x), rotate180, instancedMesh: undefined, nextIndex: 0 }] 
        }) )
      }
    },

    parseFEN(fen) {
      return parseFEN(fen)
    },

    parsePGN(pgn) {
      if (!pgn) {
        return
      }

      const url = pgn.match(URL_REGEX);
      if (url) {
        fetch(url[1])
          .then(response => {
            if (!response.ok) error(this, `file: "${url[1]}" ${response.statusText}`);
            return response.text()
          })
          .then(text => this.parsePGN(text));

      } else {
        this.pgnAST = parsePGN(pgn);
        return this.pgnAST
      }
    },

    resetGame(mode) {
      console.assert(mode !== "network");
      const state = this.state;

      let fenStr = this.pgnAST && this.pgnAST["FEN"] ? this.pgnAST["FEN"] : this.data.fen;
      fenStr = fenStr || FEN_DEFAULT;

      state.fenAST = this.parseFEN( fenStr );
      state.replayIndex = 0;

      if (mode === "game") {
        this.setupGameWorker();
      }

      this.releaseAllInstances();
      this.setupMode(mode);
    },

    setupMode(mode) {
      if (!this.chess3D || (mode === "game" && !this.garbochess)) {
        this.pendingMode = mode;
        return
      }

      if (this.data.debug) {
        console.log("mode", mode);
      }

      const state = this.state;

      state.actions.length = 0;
      state.grabMap.clear();
      state.movers.length = 0;
      state.nextAIMove = "";
      state.nextHumanMove = "";
      state.delay = 0;
      state.localMode = mode;

      switch (mode) {
        case "replay":
          break

        case "game":
          this.garbochess.postMessage("position " + fenToString(state.fenAST));
          break
      }

      this.setupBoard(state.fenAST);

      // picking must be after setupBoard()
      switch (mode) {
        case "freestyle":
          this.setupPicking("all");
          break

        case "game":
        case "network":
          this.setCurrentPlayer(state.fenAST.player);
          break
      }
    },

    createChessSet(chess3D) {
      const self = this;
      const data = this.data;

      setOBBFromObject3D(this.gameBounds, chess3D);

      const board3D = chess3D.getObjectByName(this.board.name);
      if (!board3D) {
        error(this, `unable to find board mesh '${this.board.name}'`);
      } else {
        this.board.board3D = board3D;

        // get bounds in board3D space
        const invParentMatrix = new THREE.Matrix4().getInverse(board3D.parent.matrixWorld);
        this.board.bounds.setFromObject(board3D);
        this.board.bounds.applyMatrix4(invParentMatrix);
      }

      let meshCounts = Object.fromEntries( MESHES_ORDER.map(code => [this.meshInfos[code].name, 0]) );

      // multiple meshInfos can use the same meshName e.g. white rook and black rook
      for (let code of MESHES_ORDER) {
        const meshName = this.meshInfos[code].name;
        meshCounts[meshName] += data.maxCountPerPiece;
      }

      let cacheInstances = {};
      const meshMatrix = new THREE.Matrix4();

      for (let code in this.meshInfos) {
        const meshInfo = this.meshInfos[code];
        const meshName = meshInfo.name;
        const cache = cacheInstances[meshName];

        if (cache) {
          meshInfo.instancedMesh = cache.instancedMesh;
          meshInfo.startIndex = meshInfo.nextIndex = cache.nextIndex;
          cache.nextIndex += data.maxCountPerPiece;

        } else {
          const mesh3D = chess3D.getObjectByName(meshName);

          if (!mesh3D) {
            error(self, `unable to find mesh '${meshName}'`);
          } else {
            mesh3D.visible = false;
            mesh3D.material = this.chessMaterial;
            meshInfo.instancedMesh = createMesh( mesh3D, meshCounts[meshName] );

            // scale and rotate to match the original mesh
            meshMatrix.compose(meshInfo.instancedMesh.position, mesh3D.quaternion, mesh3D.scale);
            meshInfo.instancedMesh.geometry.applyMatrix(meshMatrix);

            meshInfo.nextIndex = meshInfo.startIndex = 0;
            chess3D.add(meshInfo.instancedMesh);

            cacheInstances[meshName] = { instancedMesh: meshInfo.instancedMesh, nextIndex: data.maxCountPerPiece };
          }
        }
      }
    },

    setupInstanceForPiece(piece) {
      const meshInfo = this.meshInfos[piece.code];
      const instancedMesh = meshInfo ? meshInfo.instancedMesh : undefined;

      if (instancedMesh) {
        const index = meshInfo.nextIndex++;

        if (meshInfo.rotate180) {
          const quaternion = new THREE.Quaternion();
          getQuaternionAt( instancedMesh, index, quaternion );
          setQuaternionAt( instancedMesh, index, quaternion.multiply(this.rotate180Quaternion) );
        }

        setScaleAt(instancedMesh, index, 1, 1, 1);

        const isBlack = piece.code === piece.code.toLowerCase();
        if (isBlack) {
          setColorAt(instancedMesh, index, this.blackColor);
        } else {
          setColorAt(instancedMesh, index, this.whiteColor);
        }

        piece.index = index;
        piece.instancedMesh = instancedMesh;
      }
    },

    releaseAllInstances() {
      for (let code of MESHES_ORDER) {
        const meshInfo = this.meshInfos[code];
        for (let i = meshInfo.startIndex; i < meshInfo.nextIndex; i++) {
          setScaleAt(meshInfo.instancedMesh, i, 0, 0, 0);
        }
        meshInfo.nextIndex = meshInfo.startIndex;
      }
    },

    setupHumanPicking(side) {
      const playerInfo = this.state.playerInfo[side];
      if (!playerInfo.networkClientId || playerInfo.networkClientId === getClientId()) {
        this.setupPicking(side);
      } else {
        this.setupPicking("none");
      }
    },

    setupPicking(side) {
      const state = this.state;

      if (side === state.pickingSide) {
        return
      }

      const grabSystem = this.el.sceneEl.systems["grab-system"];
      const el = this.el;
      const layout = state.fenAST.layout;

      const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.instancedMesh, score: "closestforward", instanceIndex: piece.index});
      const shutdownPiecePicking = piece => grabSystem.unregisterTarget(el, {obj3D: piece.instancedMesh, instanceIndex: piece.index});

      if (state.pickingSide !== "none") {
        // Note, ok to shutdown, even if we were never setup
        state.fenAST.capturedPieces.forEach(shutdownPiecePicking);
        layout.forEach(shutdownPiecePicking);
      }

      if (side !== "none") {
        layout.forEach(piece => {
          const isBlack = piece.code === piece.code.toLowerCase();
          if (side === "all" || (isBlack && side === "black") || (!isBlack && side === "white")) {
            setupPiecePicking(piece);
          }
        });
      }

      state.pickingSide = side;
    },

    setupBoard(fenAST) {
      if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshInfos[code].instancedMesh) ) {
        return
      }

      const groundY = this.board.bounds.max.y;

      for (let piece of fenAST.layout) {
        const xz = this.xzFromFileRank(this.board.bounds, piece.file, piece.rank);

        if (!piece.instancedMesh) {
          this.setupInstanceForPiece(piece);
        }

        setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z);
      }

      if (fenAST.capturedPieces) {
        for (let i = 0; i < fenAST.capturedPieces.length; i++) {
          const piece = fenAST.capturedPieces[i];
          const offBoard = this.fileRankFromCaptured(i);
          const xz = this.xzFromFileRank(this.board.bounds, offBoard.file, offBoard.rank);

          if (!piece.instancedMesh) {
            this.setupInstanceForPiece(piece);
          }

          setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z);
        }
      }
    },

    // 1,1 => bottom left, supports fractional file and rank
    xzFromFileRank(bounds, file, rank) {
      const w = bounds.max.x - bounds.min.x;
      const h = bounds.max.z - bounds.min.z;
      return { x: bounds.min.x + (file - .5)*w/NUM_RANKS, z: bounds.max.z - (rank - .5)*h/NUM_FILES }
    },

    fileRankFromXZ(bounds, x, z) {
      const w = bounds.max.x - bounds.min.x;
      const h = bounds.max.z - bounds.min.z;
      const file = Math.floor( NUM_FILES*( x - bounds.min.x ) / w ) + 1;
      const rank = Math.floor( NUM_RANKS*( bounds.max.z - z ) / h ) + 1;
      return file >= 1 && file <= NUM_FILES && rank >= 1 && rank <= NUM_RANKS ? {file,rank} : undefined
    },

    fileRankFromCaptured(capturedIndex) {
      const offBoardFile = Math.floor(capturedIndex/CAPTURED_SIZE) + 10;
      const offBoardRank = (capturedIndex % CAPTURED_SIZE)/CAPTURED_SIZE*NUM_RANKS + 1;
      return {file: offBoardFile, rank: offBoardRank}
    },

    snapToBoard(piece, piecePosition) {
      const destination = this.fileRankFromXZ(this.board.bounds, piecePosition.x, piecePosition.z);
      if (destination) {
        const pos = this.xzFromFileRank(this.board.bounds, destination.file, destination.rank);
        const groundY = this.board.bounds.max.y;
        setPositionAt(piece.instancedMesh, piece.index, pos.x, groundY, pos.z);
      }
      return destination
    },

    actionsTick(dt, speed) {
      const state = this.state;

      state.delay -= dt;

      if (state.movers.length > 0) {

        if (state.movers.length > 0) {
          state.movers.forEach(mover => mover.tick(dt));
          
          if (state.movers.every(mover => mover.isComplete())) {
            state.movers.length = 0;
            state.actions.splice(0,1); // move to the next action
          }
        }

      } else if (state.actions.length > 0) {
        const action = state.actions[0];
        const bounds = this.board.bounds;

        switch (action.type) {
          case "move": {
            const piece = action.piece;
            const moveMover = this.createMover(bounds, piece, action.fromFile, action.fromRank, action.toFile, action.toRank, speed);
            state.movers.push( moveMover );
            break
          } 
          case "capture": {
            const capturedPiece = action.capturedPiece;
            const offBoard = this.fileRankFromCaptured(action.capturedIndex);
            const captureMover = this.createMover(bounds, capturedPiece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, speed);
            state.movers.push(captureMover);
            break
          }
          case "promote": {
            const newPiece = action.newPiece;

            this.setupInstanceForPiece(newPiece);

            const offBoard = this.fileRankFromCaptured(action.capturedIndex);
            const promoteMover = this.createMover(bounds, newPiece, newPiece.file, newPiece.rank, newPiece.file, newPiece.rank, speed);
            const pawnMover = this.createMover(bounds, action.piece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, speed);
            state.movers.push(promoteMover, pawnMover);
            break
          }
          case "castle": {
            const king = action.king;
            const rook = action.rook;
            const kingMover = this.createMover(bounds, king, 5, king.rank, action.kingside ? 7 : 3, king.rank, speed);
            const rookMover = this.createMover(bounds, rook, action.kingside ? 8 : 1, rook.rank, action.kingside ? 6 : 4, rook.rank, speed);
            state.movers.push(kingMover, rookMover);
            break
          }

          default:
            throw Error(`unknown action of type "${action.type}"`)
        }
      }
    },

    replayTick() {
      const state = this.state;

      if (state.delay <= 0 && state.movers.length === 0 && state.actions.length === 0 && this.pgnAST && this.pgnAST.moves[state.replayIndex]) {
        state.actions = applyMove(state.fenAST, this.pgnAST.moves[state.replayIndex]); 
        state.delay = state.actions ? this.data.replayTurnDuration : 0;

        const move = this.pgnAST.moves[state.replayIndex];
        const firstAction = state.actions[0];
        if (firstAction.type === "move") { 
          move.fromFile = firstAction.fromFile;
          move.fromRank = firstAction.fromRank;
        } else if (firstAction.type === "castle") {
          move.fromFile = 5;
          move.fromRank = firstAction.king.rank;
        }
        state.replayIndex++;

        this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: coordToString(move), nextReplayIndex: state.replayIndex });
      }
    },

    aiTick() {
      const state = this.state;
      const data = this.data;

      if (state.movers.length === 0 && state.actions.length === 0 && this.garbochess && state.nextAIMove) {
        const move = decodeCoordMove(state.fenAST, state.nextAIMove);
        if (data.debug) {
          console.log("AI", move.code === move.code.toLowerCase() ? "black" : "white", state.nextAIMove, sanToString(move));
        }

        state.actions = applyMove(state.fenAST, move);  
        state.nextAIMove = "";
        this.nextTurn();

        this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: coordToString(move), nextReplayIndex: 0 });
      }
    },

    grabTick() {
      this.state.grabMap.forEach((grabInfo, piece) => {
        applyOffsetMatrix(grabInfo.hand.object3D, piece.instancedMesh, piece.index, grabInfo.offsetMatrix);
      });
    },

    humanTick() {
      const data = this.data;
      const state = this.state;

      if (state.nextHumanMove) {
        const move = decodeCoordMove(state.fenAST, state.nextHumanMove);
        if (data.debug) {
          console.log("HU", move.code === move.code.toLowerCase() ? "black" : "white", state.nextHumanMove, sanToString(move));
        }

        // state.actions = chessHelper.applyMove(state.fenAST, move)
        applyMove(state.fenAST, move);
        this.setupBoard(state.fenAST); // snap pieces
        state.nextHumanMove = "";
        this.nextTurn();

        this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: coordToString(move), nextReplayIndex: 0 });

      }
    },

    // speed is in tiles per second
    // tick() returns true when the mover is complete
    createMover(bounds, piece, startFile, startRank, endFile, endRank, speed) {
      let elapsed = 0;
      const totalTime = Math.hypot(endFile - startFile, endRank - startRank)/speed;
      const self = this;

      function tick(dt) {
        elapsed += dt;

        const ratio = THREE.Math.clamp(elapsed/totalTime, 0, 1);
        const partialFile = (endFile - startFile)*ratio + startFile;
        const partialRank = (endRank - startRank)*ratio + startRank;
        const xz = self.xzFromFileRank(bounds, partialFile, partialRank);
        const groundY = bounds.max.y;

        setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z);
      }

      function isComplete() {
        return elapsed > totalTime
      }

      return {
        tick,
        isComplete,
      }
    },

    setupGameWorker() {
      if (!this.garbochess) {
        const state = this.state;

        // perform this fetch and blob creation to work around same-origin policy
        // this.garbochess = new Worker(this.data.aiWorker)
        fetch(this.data.aiWorker).then(response => {
          if (!response.ok) {
            throw Error(`problem with file "${this.data.aiWorker}"`)
          }
          return response.text()
        }).then(text => {
          const workerSrc = new Blob([text], {type: 'text/javascript'});
          const workerUrl = window.URL.createObjectURL(workerSrc);
          this.garbochess = new Worker(workerUrl);

          this.garbochess.onerror = (event) => {
            throw Error(`problem with worker "${this.data.aiWorker} - ${event.message}"`)
          };
    
          this.garbochess.onmessage = (event) => {
            if (this.data.debug) {
              console.log(event.data);
            }
      
            if (event.data.startsWith("pv")) ; else if (event.data.startsWith("message")) ; else if (event.data.startsWith("invalid")) {
              if (state.playerInfo[state.currentPlayer].networkClientId) {
                this.system.sendNetworkData(this, { command: "invalidMove" }, state.playerInfo[state.currentPlayer].networkClientId);
              }
              this.setupBoard(this.state.fenAST); // reset invalidly moved pieces
    
            } else if (event.data.startsWith("valid")) {
              const commands = event.data.split(" ");
              state.nextHumanMove = commands[1];
            } else if (event.data.startsWith("options")) ; else {
              state.nextAIMove = event.data;
            }
          };

          this.setupMode(this.pendingMode);
        });
      }
    },

    onObject3dSet(event) {
      const data = this.data;
      this.chess3D = event.detail.object;
      this.createChessSet(this.chess3D);
      this.setupMode(this.pendingMode);
    },

    onHoverStart(event) {
      const instancedMesh = event.detail.obj3D;

      if (Object.keys(this.meshInfos).find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
        const index = event.detail.instanceIndex;
        setColorAt(instancedMesh, index, this.highlightColor);
      }
    },

    onHoverEnd(event) {
      const instancedMesh = event.detail.obj3D;

      if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
        const state = this.state;
        const index = event.detail.instanceIndex;

        // the piece were were hovering over may have been captured, so check the captured list as well
        const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index) || 
          state.fenAST.capturedPieces.find(piece => piece.instancedMesh === instancedMesh && piece.index === index);

        // Note, if a second controller is hovering over the same piece, we will lose the highlight
        const isBlack = piece.code === piece.code.toLowerCase();
        setColorAt(instancedMesh, index, isBlack ? this.blackColor : this.whiteColor);
      }
    },

    onGrabStart(event) {
      const instancedMesh = event.detail.obj3D;

      if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
        const state = this.state;
        const hand = event.detail.hand;
        const index = event.detail.instanceIndex;
        const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index);
        const grabInfo = state.grabMap.get(piece);

        if (grabInfo) {
          // we grab this from another hand, so keep the original quaternion
          grabInfo.offsetMatrix = calcOffsetMatrix(hand.object3D, instancedMesh, piece.index, grabInfo.offsetMatrix);
          grabInfo.hand = hand;
        } else {
          state.grabMap.set(piece, { 
            hand, 
            offsetMatrix: calcOffsetMatrix(hand.object3D, instancedMesh, piece.index), 
            startQuaternion: getQuaternionAt(instancedMesh, piece.index) 
          });
        }

        this.system.broadcastNetworkData(this, { command: "setHuman", player: state.currentPlayer, networkClientId: getClientId() });
      }
    },

    onGrabEnd(event) {
      const instancedMesh = event.detail.obj3D;

      if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
        const state = this.state;
        const hand = event.detail.hand;
        const index = event.detail.instanceIndex;
        const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index);
        const grabInfo = state.grabMap.get(piece);

        // TODO freestyle can be placed anywhere, but game must be on the board, or be reset to it's original position
        if (grabInfo && grabInfo.hand === hand) {
          const piecePosition = getPositionAt(instancedMesh, index);
          if (piecePosition.y < this.gameBounds.max.y) {
            const destination = this.snapToBoard(piece, piecePosition);

            // TODO handle promotion
            if (state.localMode === "game" || state.localMode === "network") {
              const humanMove = fileRankToCoord(piece.file, piece.rank) + fileRankToCoord(destination.file, destination.rank);

              // Note, this move may be invalid
              if (isMine(this)) {
                this.garbochess.postMessage(humanMove);
              } else {
                state.pendingLocalMove = humanMove;
                this.system.broadcastNetworkData(this, { command: "possibleMove", player: state.currentPlayer, moveStr: humanMove });
              }
            }
          }

          setQuaternionAt( instancedMesh, index, grabInfo.startQuaternion );
          state.grabMap.delete(piece);
        }
      }
    },

    onReset() {
      if (isMine(this)) {
        this.resetGame(this.state.globalMode);
      }
    },

    // Networking
    getSetupPacket() {
      const state = this.state;
      return {
        command: "setup",
        fen: fenToString( state.fenAST ),
        captureStr: state.fenAST.capturedPieces.map(piece => piece.code).join(""),
        playerInfo: state.playerInfo,
        globalMode: state.globalMode,
        replayIndex: state.replayIndex,
      }
    },

    requestSync(senderId) {
      this.system.sendNetworkData(this, this.getSetupPacket(), senderId);
    },

    receiveNetworkData(packet, senderId) {
      const state = this.state;
      const owner = NAF.utils.getNetworkOwner(this.el);
      const fromOwner = senderId === owner;

      if (this.state.waitingForSetup && packet.command !== "setup") {
        return // ignore all non-setup packets until we are setup
      }

      switch (packet.command) {
        case "setup":
          if (fromOwner) {
            state.waitingForSetup = false;

            state.fenAST = this.parseFEN( packet.fen );
            state.fenAST.capturedPieces = packet.captureStr.split("").map( code => ({code, file: -1, rank: -1}) );
            state.playerInfo = packet.playerInfo;
            state.globalMode = packet.globalMode;
            state.replayIndex = packet.replayIndex;

            this.releaseAllInstances();
            this.setupMode("network");
          }
          break

        case "move":
          if (fromOwner) {
            const newActions = applyMove( state.fenAST, decodeCoordMove(state.fenAST, packet.moveStr) );

            if (state.pendingLocalMove === packet.moveStr) {
              this.setupBoard(this.state.fenAST); // matches the local move we made, so just snap the board
            } else {
              state.actions.push(...newActions); // a move from someone else so use actions to change the board
            }
            state.pendingLocalMove = "";
            state.replayIndex = packet.nextReplayIndex;
            this.setCurrentPlayer( packet.nextPlayer );
          }
          break

        case "possibleMove":
          if (isMine(this)) {
            this.garbochess.postMessage(packet.moveStr);
          }
          break

        case "invalidMove":
          if (fromOwner) {
            this.setupBoard(this.state.fenAST);
          }
          break

        case "setHuman":
          const playerInfo = this.state.playerInfo[packet.player];
          playerInfo.networkClientId = packet.networkClientId;

          // if another client has started picking, then we should lose our
          // ability to pick
          // OR if the picking client has left, then we could start picking
          if (state.currentPlayer === packet.player) {
            this.setupHumanPicking(packet.player);
          }
          break
      }
    },

    onClientDisconnected(event) {
      const clientId = event.detail.clientId;
      const owner = NAF.utils.getNetworkOwner(this.el);

      
      if (this.data.debug) {
        console.log("onClientDisconnected client:", clientId, "me:", NAF.clientId, "owner:", NAF.utils.getNetworkOwner(this.el));
      }

      if (owner === NAF.clientId || owner == clientId) {
        const state = this.state;

        for (let player in state.playerInfo) {
          const networkClientId = state.playerInfo[player].networkClientId;

          if (networkClientId == clientId) {
            state.playerInfo[player].networkClientId = "";
            if (state.currentPlayer === player) {
              this.setupHumanPicking(player);
            }
              
            this.system.broadcastNetworkData(this, { command: "setHuman", player: player, networkClientId: "" });
          }
        }
      }
    },

    onOwnershipGained() {
      if (this.data.debug) {
        console.log("ownership-gained");
      }
      const state = this.state;
      this.system.broadcastNetworkData(this, this.getSetupPacket());
      this.setupMode(state.globalMode);
      state.waitingForSetup = false;
    },

    onOwnershipLost() {
      if (this.data.debug) {
        console.log("ownership-lost");
      }
      this.setupMode("network");
      this.state.waitingForSetup = true;
    },
  });

  AFRAME.registerComponent("climb", {
    schema: {
      cameraRig: { type: "selector" },
      enabled: { default: true },
      debug: { default: false },
    },

    init() {
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);

      this.grab = { hand: undefined, target: undefined, position: new THREE.Vector3() };
    },

    tick: (function() {
      let deltaPosition = new THREE.Vector3();

      return function tick() {
        const data = this.data;
        if (data.enabled && this.grab.hand && this.grab.target) {
          const rig = data.cameraRig ? data.cameraRig.object3D : this.el.object3D;
      
          if (rig) {
            this.grab.hand.object3D.getWorldPosition(deltaPosition).sub(this.grab.position);
            rig.position.sub(deltaPosition);
          }
        }
      }
    })(),

    play() {
      this.addListeners();
    },

    pause() {
      this.removeListeners();
    },

    addListeners() {
      this.el.addEventListener("grabstart", this.onGrabStart);
      this.el.addEventListener("grabend", this.onGrabEnd);
    },

    removeListeners() {
      this.el.removeEventListener("grabstart", this.onGrabStart);
      this.el.removeEventListener("grabend", this.onGrabEnd);
    },

    onGrabStart(e) {
      if (this.data.debug) {
        console.log( getDebugName( this.el ), this.attrName, 'onGrabStart', getDebugName( e.detail.hand ), getDebugName( e.detail.object ) );
      }
      this.grab.hand = e.detail.hand;
      this.grab.target = e.detail.object;
      this.grab.hand.object3D.getWorldPosition(this.grab.position);
    },

    onGrabEnd(e) {
      if (this.data.debug) {
        console.log( getDebugName( this.el ), this.attrName, 'onGrabEnd', getDebugName( e.detail.hand ) );
      }
      if (e.detail.hand === this.grab.hand) {
        this.grab.hand = undefined;
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

  // Copyright 2018-2019 harlyq
  // MIT license

  AFRAME.registerComponent("clone-geometry", {
    schema: {
      src: { type: "selector" },
    },

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this); // used for models which may have a delay before loading
    },

    update(oldData) {
      if (this.data.src !== oldData.src) {
        if (oldData instanceof HTMLElement) { oldData.removeEventListener("object3dset", this.onObject3DSet); }

        const template = this.data.src;
        if (template instanceof HTMLElement && 'object3D' in template) {
          this.cloneObject3D(template);
          // @ts-ignore
          template.addEventListener("object3dset", this.onObject3DSet);
        }
      }
    },

    onObject3DSet(evt) {
      if (evt.target === this.data.src && evt.detail.type) {
        this.cloneObject3D(this.data.src);
      }
    },

    cloneObject3D(from) {
      const object3D = this.el.object3D;
      for (let k in this.el.object3DMap) {
        this.el.removeObject3D(k);
      }
      while (object3D.children.length > 0) {
        object3D.remove(object3D.children[0]);
      }

      function getObjectName(obj3D) {
        for (let k in from.object3DMap) {
          if (obj3D === from.object3DMap[k]) {
            return k
          }
        }
        return undefined
      }

      for (let i = 0; i < from.object3D.children.length; i++) {
        const child = from.object3D.children[i];
        const name = getObjectName(child);
        if (name) {
          // if the object is in the aframe object map then add it via aframe
          this.el.setObject3D(name, child.clone());
        } else {
          // otherwise add it via threejs
          object3D.add(child.clone());
        }
      }
    },
  });

  const NUM_FACES = 6;
  const UNEXPOSED_FRAME = 7;
  const TEXTURE_COLS = 4;
  const TEXTURE_ROWS = 2;
  const EMPTY_ARRAY = [];
  const INNER_SIDE = 6;
  const NO_SIDE = -1;
  const PI_2 = Math.PI*.5;
  const PI = Math.PI;
  const FLOATS_PER_POSITION = 3;
  const FLOATS_PER_QUATERNION = 4;
  const FLOATS_PER_PACKED_FRAME = 1;
  const MAX_BITS_PER_FRAME = 3;
  const PACKED_FRAME_DIVISOR = 2 ** (NUM_FACES*MAX_BITS_PER_FRAME);

  function quaternionFromEuler(x,y,z) {
    return new THREE.Quaternion().setFromEuler( new THREE.Euler(x,y,z) )
  }

  const VALID_MOVES = {
    "F2": { side: 4, quaternion: quaternionFromEuler(0,0,-PI) },
    "R2": { side: 0, quaternion: quaternionFromEuler(-PI,0,0) },
    "U2": { side: 2, quaternion: quaternionFromEuler(0,-PI,0) },
    "L2": { side: 1, quaternion: quaternionFromEuler(PI,0,0) },
    "D2": { side: 3, quaternion: quaternionFromEuler(0,PI,0) },
    "B2": { side: 5, quaternion: quaternionFromEuler(0,0,PI) },
    "F'": { side: 4, quaternion: quaternionFromEuler(0,0,PI_2) },
    "R'": { side: 0, quaternion: quaternionFromEuler(PI_2,0,0) },
    "U'": { side: 2, quaternion: quaternionFromEuler(0,PI_2,0) },
    "L'": { side: 1, quaternion: quaternionFromEuler(-PI_2,0,0) },
    "D'": { side: 3, quaternion: quaternionFromEuler(0,-PI_2,0) },
    "B'": { side: 5, quaternion: quaternionFromEuler(0,0,-PI_2) },
    "F": { side: 4, quaternion: quaternionFromEuler(0,0,-PI_2) },
    "R": { side: 0, quaternion: quaternionFromEuler(-PI_2,0,0) },
    "U": { side: 2, quaternion: quaternionFromEuler(0,-PI_2,0) },
    "L": { side: 1, quaternion: quaternionFromEuler(PI_2,0,0) },
    "D": { side: 3, quaternion: quaternionFromEuler(0,PI_2,0) },
    "B": { side: 5, quaternion: quaternionFromEuler(0,0,PI_2) },
  };

  function toUpperCase(str) { return str.trim().toUpperCase() }

  function packFrames(frames) {
    let packed = 0;
    for (let i = 0; i < frames.length; i++) {
      packed += frames[i] * Math.pow(2, (frames.length - i - 1)*MAX_BITS_PER_FRAME);
    }
    return packed / PACKED_FRAME_DIVISOR // in the range (0,1]
  }

  function slerpolator(quaternions, duration, postStepFn) {
    const startQuaternions = quaternions.slice();
    const endQuaternions = quaternions.slice();
    const outQuaternions = quaternions; // populate directly
    let elapsed = 0;

    function step(dt) {
      elapsed += dt;
      const r = THREE.Math.clamp(elapsed/duration, 0, 1);

      for (let i = 0, n = startQuaternions.length; i < n; i += 4) {
        THREE.Quaternion.slerpFlat(outQuaternions, i, startQuaternions, i, endQuaternions, i, r);
      }

      postStepFn();
    }

    function isFinished() {
      return elapsed > duration
    }

    return {
      endQuaternions,
      step,
      isFinished,
    }
  }

  function packQuaternions(quaternions) {
    let packed = Array(quaternions.length);

    for (let i = 0; i < quaternions.length; i++) {
      const v = Math.trunc(quaternions[i]*10);
      let y;
      switch (v) {
        case 0: y = 0; break
        case 5: y = 1; break
        case 7: y = 2; break
        case 10: y = 3; break
        case -5: y = 4; break
        case -7: y = 5; break
        case -10: y = 6; break
        default: console.assert(false, `unknown value ${v} from ${quaternions[i]}`);
      }
      packed[i] = y;
    }
    return packed.join("")
  }

  function unpackQuaternions(quaternions, packedQuats) {
    console.assert(quaternions.length === packedQuats.length);
    const cos45 = Math.cos(Math.PI/4);

    for (let i = 0; i < packedQuats.length; i++) {
      let y = 0;
      switch (packedQuats[i]) {
        case "0": y = 0; break
        case "1": y = 0.5; break
        case "2": y = cos45; break
        case "3": y = 1; break
        case "4": y = -0.5; break
        case "5": y = -cos45; break
        case "6": y = -1; break
      }
      quaternions[i] = y;
    }
  }

  window.addEventListener("load", () => {
    document.body.addEventListener("connected", () => {
      let tagEl = document.querySelector("#clientId");
      if (!tagEl) {
        tagEl = document.createElement("div");
        tagEl.id = "clientId";
        tagEl.setAttribute("style", "position: absolute; left: 0; top: 0");
        document.body.appendChild(tagEl);
      }
      tagEl.innerHTML = NAF.clientId.toString();
    });
  });


  AFRAME.registerSystem("cube-puzzle", {
    ...networkSystem("cube-puzzle"),

    init() {
      this.setupNetwork();
    },

    remove() {
      this.shutdownNetwork();
    },
  });


  AFRAME.registerComponent("cube-puzzle", {
    schema: {
      hands: { type: "selectorAll", default: "[hand-controls], [oculus-touch-controls], [vive-controls], [windows-motion-controls]" },
      grabStart: { default: "triggerdown" },
      grabEnd: { default: "triggerup" },
      highlightColor: { type: "color", default: "#555" },
      snapAngle: { default: 20 },
      moves: { default: "", parse: toUpperCase },
      debug: { default: false },
    },

    init() {
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);
      this.onBeforeCompile = this.onBeforeCompile.bind(this);

      this.actionTick = {
        "idle": this.tickIdle.bind(this),
        "hold": this.tickHold.bind(this),
        "turn": this.tickTurn.bind(this),
        "turning": this.tickTurning.bind(this),
      };

      this.highlightColor = new THREE.Color();
      this.prevHighlighted = [];

      this.state = {
        name: "idle",
        hold: {
          side: NO_SIDE,
          matrix: new THREE.Matrix4(),
        },
        turn: {
          side: NO_SIDE,
          pieces: [],
          matrices: [],
          handStart: new THREE.Matrix4(),
          startAngle: 0,
        },
        snapped: true,
        activeHands: [],
        slerpolator: undefined,
        snappedQuaternions: undefined,
        holderId: undefined,
      };

      this.cube = this.createCube();
      this.el.setObject3D("mesh", this.cube);

      this.state.snappedQuaternions = this.quaternions.slice();

      this.system.registerNetworking(this, {
        requestSync: this.requestSync.bind(this),
        receiveNetworkData: this.receiveNetworkData.bind(this),
        onClientDisconnected: this.onClientDisconnected.bind(this),
        onOwnershipGained: this.onOwnershipGained.bind(this),
      });
    },

    remove() {
      this.system.unregisterNetworking(this);
    },

    update(oldData) {
      const data = this.data;
      for (let hand of data.hands) {
        hand.addEventListener(data.grabStart, this.onGrabStart);
        hand.addEventListener(data.grabEnd, this.onGrabEnd);
      }

      this.highlightColor.set(data.highlightColor);
      this.snapAngle = THREE.Math.degToRad( Math.abs(data.snapAngle) );

      if (data.moves !== oldData.moves) {
        this.resetCube();
        data.moves.split(" ").forEach(move => {
          if (move && !this.rotateCube(move)) {
            error(this, `unknown move "${move}"`);
          }
        });
      }
    },

    tick(time, deltaTime) {
      const dt = Math.min(100, deltaTime)/1000;
      const state = this.state;

      this.tickSlerpolator(dt);

      if (!state.holderId || state.holderId === getClientId()) {
        this.actionTick[this.state.name]();
      }
    },

    dispatch(action) {
      if (this.data.debug) {
        console.log("action", action.name, action);
      }

      const state = this.state;
      const oldStateName = state.name;

      switch (action.name) {      
        case "grab":
          state.activeHands.push(action.hand);

          if (state.name === "idle") {
            state.name = "hold";
            state.hold.side = NO_SIDE;
            state.holderId = getClientId();
            calcOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);

            takeOwnership(this);

          } else if (state.name === "hold") {
            const holdSide = state.hold.side;

            if (state.snapped && holdSide !== NO_SIDE) {
              const pieces = this.getSidePieces(holdSide);

              state.name = "turn";
              state.turn.side = holdSide;
              state.turn.pieces = pieces;
              state.turn.quaternions = this.quaternions.slice();
              state.turn.handStart.copy( action.hand.object3D.matrixWorld );
              state.turn.startAngle = 0;

            } else if (!state.snapped && holdSide === state.turn.side) {
              state.name = "turning";
              state.turn.handStart.copy( action.hand.object3D.matrixWorld );

            }
          }
          break

        case "release":
          if (state.name === "hold") {

            const i = state.activeHands.indexOf(action.hand);
            state.activeHands.splice(i, 1);
            if (state.activeHands.length > 0) {
              calcOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);
            } else {
              state.name = "idle";
              this.broadcastState();
            }
    
          } else if (state.name === "turn" || state.name === "turning") {

            if (state.name === "turning") {
              const turnHand = state.activeHands[1];
              state.turn.startAngle += this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld);
            }

            const i = state.activeHands.indexOf(action.hand);
            state.activeHands.splice(i, 1);
            if (state.activeHands.length > 0) {
              calcOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);
            }
    
            state.name = "hold";
          }
          break

        case "unsnap":
          if (state.name === "turn") {
            state.name = "turning";
            state.snapped = false;
          } else if (state.name === "turning") {
            state.snapped = false;
          }
          break

        case "snap":
          state.snappedQuaternions.set(this.quaternions);
          this.broadcastState({slerp: true});
          state.snapped = true;
          break

        case "hover":
          if (state.name === "hold") {
            state.hold.side = action.side;
          }
      }

      if (this.data.debug && state.name !== oldStateName) {
        console.log("newState", state.name);
      }
    },

    tickSlerpolator(dt) {
      const state = this.state;
      if (state.slerpolator) {
        if (state.slerpolator.isFinished()) {
          state.snapped = true;
          state.slerpolator = undefined;
        } else {
          state.slerpolator.step(dt);
        }
      }
    },

    tickIdle() {
      if (!this.el.sceneEl.is('vr-mode')) {
        return
      }

      let hand = this.data.hands.find(hand => this.isNear(hand));
      if (hand) {
        this.highlightPieces(this.allPieces);
      } else {
        this.highlightPieces(EMPTY_ARRAY);
      }
    },

    tickHold() {
      const state = this.state;
      applyOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);

      const hand = this.data.hands.find(hand => !state.activeHands.includes(hand) && this.isNear(hand));
      let pieces = EMPTY_ARRAY;

      if (hand) {
        let bestSide = state.turn.side;

        if (state.snapped) {
          bestSide = this.calcBestSide(hand, state.hold.side);
          if (bestSide >= 0) {
            pieces = this.getSidePieces(bestSide);
          }
        } else {
          pieces = state.turn.pieces;
        }

        if (state.hold.side !== bestSide) {
          this.dispatch( { name: "hover", side: bestSide } );
        }
      }
        
      this.highlightPieces(pieces);
    },

    tickTurn() {
      const state = this.state;
      applyOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);
      this.highlightPieces(state.turn.pieces);

      const turnHand = state.activeHands[1];
      const angle = this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld);

      if (Math.abs(angle) > this.snapAngle) {
        this.dispatch( { name: "unsnap" } );
      }
    },

    tickTurning: (function () {
      const newQuat = new THREE.Quaternion();
      const rotationQuat = new THREE.Quaternion();
      const RIGHT = new THREE.Vector3(1,0,0);
      const UP = new THREE.Vector3(0,1,0);
      const FORWARD = new THREE.Vector3(0,0,1);

      return function tickTurning() {
        const state = this.state;
        applyOffsetMatrix$1(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix);
        this.highlightPieces(state.turn.pieces);
    
        const turnHand = state.activeHands[1];
        const angle = state.turn.startAngle + this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld);
    
        const rightAngle = Math.round(angle/PI_2)*PI_2;
        const inSnapAngle = Math.abs(angle - rightAngle) < this.snapAngle;
        const revisedAngle = inSnapAngle ? rightAngle : angle;
    
        switch (state.turn.side % INNER_SIDE) {
          case 0: rotationQuat.setFromAxisAngle(RIGHT, revisedAngle); break
          case 1: rotationQuat.setFromAxisAngle(RIGHT, -revisedAngle); break
          case 2: rotationQuat.setFromAxisAngle(UP, revisedAngle); break
          case 3: rotationQuat.setFromAxisAngle(UP, -revisedAngle); break
          case 4: rotationQuat.setFromAxisAngle(FORWARD, revisedAngle); break
          case 5: rotationQuat.setFromAxisAngle(FORWARD, -revisedAngle); break
        }
    
        for (let i = 0; i < state.turn.pieces.length; i++) {
          const piece = state.turn.pieces[i];
          newQuat.fromArray(state.turn.quaternions, piece*FLOATS_PER_QUATERNION);
          newQuat.premultiply(rotationQuat);
          newQuat.toArray(this.quaternions, piece*FLOATS_PER_QUATERNION);
        }
    
        this.instanceQuaternion.needsUpdate = true;
    
        if (inSnapAngle && !state.snapped) {
          this.dispatch( { name: "snap" } );
        } else if (state.snapped && !inSnapAngle) {
          this.dispatch( { name: "unsnap" } );
        }
      }
    })(),

    calcAngleBetween: (function() {
      const startForward = new THREE.Vector3();
      const endForward = new THREE.Vector3();
      const startRight = new THREE.Vector3();

      return function calcAngleBetween(startMatrix, endMatrix) {
        startRight.setFromMatrixColumn(startMatrix, 0);
        startForward.setFromMatrixColumn(startMatrix, 1);
        endForward.setFromMatrixColumn(endMatrix, 1);

        const angleSign = endForward.dot(startRight) <= 0 ? 1 : -1;

        return startForward.angleTo(endForward) * angleSign
      }
    })(),

    highlightPieces(pieces) {
      if ( this.prevHighlighted !== pieces && ( 
        this.prevHighlighted.length !== pieces.length ||
        this.prevHighlighted.some(piece => !pieces.includes(piece)) 
      ) ) {

          this.highlights.fill(0);
          for (let piece of pieces) {
            this.highlights[piece] = 1;
          }

          this.instanceHighlight.needsUpdate = true;
          this.prevHighlighted = pieces;
      }
    },

    createCube() {
      const size = 1/3;
      const cubeMaterial = this.createCubeMaterial();
      const numInstances = 3*3*3 - 1;

      const pieceGeo = new THREE.BoxBufferGeometry(size, size, size);
      const instanceGeo = new THREE.InstancedBufferGeometry().copy(pieceGeo);

      this.positions = new Float32Array(numInstances*FLOATS_PER_POSITION);
      this.quaternions = new Float32Array(numInstances*FLOATS_PER_QUATERNION);
      this.packedFrames = new Float32Array(numInstances*FLOATS_PER_PACKED_FRAME);
      this.highlights = new Float32Array(numInstances);
      this.allPieces = new Uint8Array(numInstances);

      let k = 0;
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            if (x === 0 && y === 0 && z === 0) {
              continue
            }

            let i = k*FLOATS_PER_POSITION;
            this.positions[i] = x*size;
            this.positions[i+1] = y*size;
            this.positions[i+2] = z*size;

            i = k*FLOATS_PER_QUATERNION;
            this.quaternions[i+3] = 1;

            let frames = [];
            for (let face = 0; face < NUM_FACES; face++) {
              let isExposed = false;
              switch (face) {
                case 0: isExposed = x === 1; break
                case 1: isExposed = x === -1; break
                case 2: isExposed = y === 1; break
                case 3: isExposed = y === -1; break
                case 4: isExposed = z === 1; break
                case 5: isExposed = z === -1; break
              }
              frames.push(isExposed ? face : UNEXPOSED_FRAME);
            }

            this.packedFrames[k] = packFrames(frames);
            this.highlights[k] = 0;
            this.allPieces[k] = k;

            k++;
          }
        }
      }

      this.instancePosition = new THREE.InstancedBufferAttribute(this.positions, FLOATS_PER_POSITION);
      this.instanceQuaternion = new THREE.InstancedBufferAttribute(this.quaternions, FLOATS_PER_QUATERNION);
      this.instancePackedFrame = new THREE.InstancedBufferAttribute(this.packedFrames, FLOATS_PER_PACKED_FRAME);
      this.instanceHighlight = new THREE.InstancedBufferAttribute(this.highlights, 1);

      instanceGeo.setAttribute("instancePosition", this.instancePosition);
      instanceGeo.setAttribute("instanceQuaternion", this.instanceQuaternion);
      instanceGeo.setAttribute("instancePackedFrame", this.instancePackedFrame);
      instanceGeo.setAttribute("instanceHighlight", this.instanceHighlight);
      instanceGeo.maxInstanceCount = numInstances;

      const mesh = new THREE.Mesh(instanceGeo, cubeMaterial);

      return mesh
    },

    createCubeMaterial() {
      const w = 128;
      const h = 64;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const mw = 2;
      const mh = 2;
      const dw = w/TEXTURE_COLS - mw*2;
      const dh = h/TEXTURE_ROWS - mh*2;
      const topHalf = mh + h/TEXTURE_ROWS;

      // colored squares in a 2x4 grid with a black border
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "red";
      ctx.fillRect(mw, topHalf, dw, dh);
      ctx.fillStyle = "orange";
      ctx.fillRect(mw + w/TEXTURE_COLS, topHalf, dw, dh);
      ctx.fillStyle = "white";
      ctx.fillRect(mw + 2*w/TEXTURE_COLS, topHalf, dw, dh);
      ctx.fillStyle = "yellow";
      ctx.fillRect(mw + 3*w/TEXTURE_COLS, topHalf, dw, dh);
      ctx.fillStyle = "green";
      ctx.fillRect(mw, mh, dw, dh);
      ctx.fillStyle = "blue";
      ctx.fillRect(mw + w/TEXTURE_COLS, mh, dw, dh);
      ctx.fillStyle = "grey"; // grey for don't care
      ctx.fillRect(mw + 2*w/TEXTURE_COLS, mh, dw, dh);
      // frame 7 is black

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshStandardMaterial( { map: texture } );
      material.onBeforeCompile = this.onBeforeCompile;

      return material
    },

    resetCube() {
      const identity = new THREE.Matrix4();
      for (let child of this.cube.children) {
        child.position.set(0,0,0);
        child.quaternion.set(0,0,0,1);
        child.matrix.copy(identity);
      }
    },

    shuffleCube(turns = 30) {
      const state = this.state;
      const moves = Object.keys(VALID_MOVES);

      this.quaternions.set(state.snappedQuaternions);

      for (let i = 0; i < turns; i++) {
        const moveIndex = ~~( Math.random()*moves.length );
        this.rotateCube( moves[moveIndex] );
      }

      state.snappedQuaternions.set(this.quaternions);
      this.broadcastState();
      state.snapped = true;
    },

    rotateCube: (function () {
      const newQuaternion = new THREE.Quaternion();

      return function rotateCube(move) {
        const isValid = VALID_MOVES[move];

        if (isValid) {
          const moveInfo = VALID_MOVES[move];
          const side = moveInfo.side;
          const pieces = this.getSidePieces(side);

          for (let piece of pieces) {
            newQuaternion.fromArray(this.quaternions, piece*FLOATS_PER_QUATERNION);
            newQuaternion.premultiply(moveInfo.quaternion);
            newQuaternion.toArray(this.quaternions, piece*FLOATS_PER_QUATERNION);
          }
        }

        this.instanceQuaternion.needsUpdate = true;

        return isValid
      }
    })(),

    calcBestSide: (function() {
      const matrixLocal = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const sideNormals = [{x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:-1,z:0}, {x:0,y:0,z:1}, {x:0,y:0,z:-1}];

      return function calcBestSide(hand, prevSide) {
        // in cube space, the cube is (-.5,-.5,-.5) to (.5,.5,.5)
        matrixLocal.getInverse(this.el.object3D.matrixWorld).multiply(hand.object3D.matrixWorld);
        pos.setFromMatrixPosition(matrixLocal);
    
        let bestSide = -1;
        let longestNormal = 0;

        for (let side = 0; side < sideNormals.length; side++) {
          const normal = sideNormals[side];
          const alongNormal = pos.dot(normal);
          if (alongNormal > longestNormal) {
            bestSide = side;
            longestNormal = alongNormal;
          }
        }

        return longestNormal > .6 ? bestSide : (prevSide % INNER_SIDE + INNER_SIDE)
      }
    })(),

    isNear: (function() {
      const aPos = new THREE.Vector3();
      const bPos = new THREE.Vector3();
      const scale = new THREE.Vector3();

      return function isNear(hand) {
        const self3D = this.el.object3D;
        scale.setFromMatrixScale(self3D.matrixWorld);
        aPos.setFromMatrixPosition(hand.object3D.matrixWorld);
        bPos.setFromMatrixPosition(self3D.matrixWorld);
        return aPos.distanceTo(bPos) < scale.length()
      }
    })(),

    getSidePieces: (function() {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const sideTests = [
        (pos) => pos.x > .3, // outser sides
        (pos) => pos.x < -.3,
        (pos) => pos.y > .3,
        (pos) => pos.y < -.3,
        (pos) => pos.z > .3,
        (pos) => pos.z < -.3,
        (pos) => pos.x > -.1, // outer sides + adjacent centers
        (pos) => pos.x < .1,
        (pos) => pos.y > -.1,
        (pos) => pos.y < .1,
        (pos) => pos.z > -.1,
        (pos) => pos.z < .1,
      ];

      return function getSidePieces(side) {
        if (side < 0 || side >= sideTests.length) {
          return []
        }

        const test = sideTests[side];

        let children = [];

        for (let piece of this.allPieces) {
          pos.fromArray(this.positions, piece*FLOATS_PER_POSITION);
          quat.fromArray(this.quaternions, piece*FLOATS_PER_QUATERNION);
          pos.applyQuaternion(quat);

          if (test(pos)) {
            children.push(piece);
          }
        }

        return children
      }

    })(),

    onBeforeCompile(shader) {
      let vertexShader = shader.vertexShader;
      let fragmentShader = shader.fragmentShader;

      vertexShader = vertexShader.replace('void main()', `
    attribute vec3 instancePosition;
    attribute vec4 instanceQuaternion;
    attribute float instancePackedFrame;
    attribute float instanceHighlight;

    varying vec3 vHighlightColor;

    vec3 applyQuaternion( const vec3 v, const vec4 q ) 
    {
      return v + 2. * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
    }

    void main()`);

      // faceDot = f(normal) => f(1,0,0) = 0, f(-1,0,0) = 1, f(0,1,0) = 2, f(0,-1,0) = 3, f(0,0,1) = 4, f(0,0,-1) = 5
      // frame = ( packedFrame << face*3 ) & 7
      vertexShader = vertexShader.replace('#include <uv_vertex>', `
    #include <uv_vertex>
    {
      float faceDot = dot( normal, vec3(1., 3., 5.) );
      float face = abs( faceDot ) - max( 0., sign( faceDot ) );
      
      float singleMultipler = ${2**MAX_BITS_PER_FRAME}.0;
      float faceMultipler = pow(2., face * ${MAX_BITS_PER_FRAME}.0);
      float prevFaces = floor( instancePackedFrame * faceMultipler );
      float frame = floor( instancePackedFrame * faceMultipler * singleMultipler ) - prevFaces * singleMultipler;

      float u0 = mod(frame, ${TEXTURE_COLS}.0) / ${TEXTURE_COLS}.0;
      float v0 = floor(frame / ${TEXTURE_COLS}.0) / ${TEXTURE_ROWS}.0;
      vUv = mix( vec2(u0, v0), vec2(u0 + .25, v0 + .5), vUv );

      vHighlightColor = mix(vec3(0.), vec3(.4), float( instanceHighlight ));
    }`);

      vertexShader = vertexShader.replace('#include <begin_vertex>', `
    vec3 transformed = applyQuaternion( position + instancePosition, instanceQuaternion );`); // position before quaternion for cube-puzzle

      vertexShader = vertexShader.replace('#include <defaultnormal_vertex>', `
    vec3 transformedNormal = normalMatrix * applyQuaternion( objectNormal, -instanceQuaternion );
    
    #ifdef FLIP_SIDED
      transformedNormal = - transformedNormal;
    #endif

    #ifdef USE_TANGENT
      vec3 transformedTangent = normalMatrix * applyQuaternion( objectTangent, -instanceQuaternion );
      #ifdef FLIP_SIDED
        transformedTangent = - transformedTangent;
      #endif
    #endif`);

      fragmentShader = fragmentShader.replace('#include <color_pars_fragment>', `
    #include <color_pars_fragment>
    varying vec3 vHighlightColor;`);

      fragmentShader = fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', `
    vec3 totalEmissiveRadiance = emissive;
    totalEmissiveRadiance += vHighlightColor;`);

      shader.vertexShader = vertexShader;
      shader.fragmentShader = fragmentShader;
    },

    onGrabStart(event) {
      if (!this.el.sceneEl.is('vr-mode')) {
        return
      }

      const hand = event.target;
      if (this.state.activeHands.indexOf(hand) === -1 && this.isNear(hand)) {
        this.dispatch( { name: "grab", hand: hand } );
      }
    },

    onGrabEnd(event) {
      if (!this.el.sceneEl.is('vr-mode')) {
        return
      }

      const hand = event.target;
      if (this.state.activeHands.indexOf(hand) !== -1 && this.isNear(hand)) {
        this.dispatch( { name: "release", hand: hand } );
      }
    },

    // Networking
    broadcastState(options = {}) {
      this.sendStateToClient(options);
    },

    sendStateToClient(options, targetId) {
      const state = this.state;
      if (isMine(this)) {
        
        const data = {
          holderId: state.holderId,
          slerp: false,
          packedQuats: packQuaternions(state.snappedQuaternions),
          ...options,
        };

        this.system.sendNetworkData(this, data, targetId);
      }
    },

    receiveNetworkData(data, senderId) {
      const state = this.state;

      if (this.data.debug) {
        console.log("received packet from:", senderId, "owner:", NAF.utils.getNetworkOwner(this.el));
      }

      if (senderId === NAF.utils.getNetworkOwner(this.el)) {
        state.holderId = data.holderId;

        const newSlerpolator = slerpolator( this.quaternions, data.slerp ? 0.3 : 0, () => { this.instanceQuaternion.needsUpdate = true; } );
        unpackQuaternions(newSlerpolator.endQuaternions, data.packedQuats);
    
        state.snappedQuaternions.set(newSlerpolator.endQuaternions);
        state.slerpolator = newSlerpolator;
      }
    },

    requestSync(clientId) {
      this.sendStateToClient({}, clientId);
    },

    onClientDisconnected(event) {
      const clientId = event.detail.clientId;
      if (this.state.holderId === clientId) {
        this.state.holderId = undefined;
      }
    },

    onOwnershipGained() {
      if (this.data.debug) {
        console.log("ownership-gained");
      }
      this.broadcastState();
    },

  });

  AFRAME.registerComponent("cube-sphere", {
    schema: {
      radius: { default: 1 },
      segments: { default: 16 },
    },

    update() {
      this.createMesh();
    },

    createMesh() {
      const segments = this.data.segments;
      const geo = new THREE.BoxBufferGeometry(1, 1, 1, segments, segments, segments);
      const position = geo.getAttribute("position");
      const normal = geo.getAttribute("normal");
      const CUBE_COLORS = ["red", "green", "blue", "yellow", "orange", "purple"];
      const newPos = new THREE.Vector3();

      for (let i = 0; i < position.count; i++) {
        const i3 = i*3;
        newPos.fromArray(position.array, i3);
        newPos.normalize();
        newPos.toArray(position.array, i3);
        newPos.toArray(normal.array, i3);
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;

      const mesh = new THREE.Mesh( geo, CUBE_COLORS.map( color => new THREE.MeshBasicMaterial( { color } ) ) );
      this.el.setObject3D("mesh", mesh);
    },
  });

  AFRAME.registerComponent("extrude", {
    schema: {
      shape: { default: "" },
      depth: { default: 100 },
      curveSegments: { type: "int", default: 12 },
      bevelEnabled: { default: true },
      bevelThickness: { default: 6 },
      bevelSize: { default: 2 },
      bevelSegments: { type: "int", default: 3 },
      extrudePath: { default: "" },
      steps: { type: "int", default: 1 },
    },

    update() {
      const data = this.data;
      const shape = shapeFromPathString(data.shape);
      const options = {...data, extrudePath: data.extrudePath ? shapeFromPathString(data.extrudePath) : undefined };
      const geo = new THREE.ExtrudeBufferGeometry( shape, options );
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      this.el.setObject3D("mesh", mesh);
    }
  });

  // @ts-ignore
  const COLOR_FLOATS_PER_VERTEX = 3;
  const VERTICES_PER_TRIANGLE = 3;

  function parseIntArray(str) {
    return typeof str === "string" ? str.split(",").map(s => parseInt(s, 10)) : str
  }

  AFRAME.registerComponent("face-color", {
    schema: {
      color: { type: "color" },
      faces: { type: "array", parse: parseIntArray },
      minPosition: { type: "vec3", default: {x:-1e10, y:-1e10, z:-1e10} }, // top left
      maxPosition: { type: "vec3", default: {x:1e10, y:1e10, z:1e10} }, // bottom right
      minSlope: { type: "int", default: 0 }, // absolute slope
      maxSlope: { type: "int", default: 90 }, // absolute slope
      meshName: { default: "mesh" },
    },
    multiple: true,

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.el.addEventListener("object3dset", this.onObject3DSet);
      this.isFirstFrame = true;
      this.applyingFaceColors = false;
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);
    },

    update() {
      if (this.isFirstFrame) {
        this.applyFaceColors();
        this.isFirstFrame = false;
      } else {
        // if only one of the vertex color components on an element is updated i.e. via the 
        // Inspector, then need to update all of them in-order so that the colors are applied
        // correctly
        const selfComponents = this.el.components;
        for (let name in selfComponents) {
          if (name.indexOf("face-color") === 0) {
            selfComponents[name].applyFaceColors();
          }
        }
      }
    },

    onObject3DSet(e) {
      if (e.target === this.el && e.detail.type === this.data.meshName) {
        this.applyFaceColors();
      }
    },

    applyFaceColors() {
      const data = this.data;
      const mesh = this.el.getObject3D(data.meshName);

      if (mesh && !this.applyingFaceColors) {
        let geometry = mesh.geometry;
        let rebuildMesh = false;

        const materialColor = mesh.material.color;
        if (materialColor.r < .3 && materialColor.g < .3 && materialColor.b < .3) {
          warn("material color is very dark, face-color will also be dark");
        }

        if (geometry.isInstancedBufferGeometry) {
          warn("face-color does not support InstancedBufferGeometry");
          return
        }

        this.applyingFaceColors = true; // don't reapply colors if we are in the process of applying colors

        if (geometry.isGeometry) {
          geometry = new THREE.BufferGeometry().copy(geometry);
          rebuildMesh = true;
        }

        if (geometry.index) {
          geometry = geometry.toNonIndexed();
          rebuildMesh = true;
        }

        if (!geometry.getAttribute("color")) {
          const whiteColors = new Float32Array(geometry.getAttribute("position").count*COLOR_FLOATS_PER_VERTEX).fill(1);
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX));
        }

        // if (!geometry.getAttribute("color")) {
        //   this.allocateVertexColors(geometry, mesh.material.color)
        // }

        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        const colors = geometry.getAttribute("color");

        // data.min/maxPosition are in the range (0,1), but the X and Z vertices use (-.5,.5)
        const minX = data.minPosition.x-.5, minY = data.minPosition.y, minZ = data.minPosition.z-.5;
        const maxX = data.maxPosition.x-.5, maxY = data.maxPosition.y, maxZ = data.maxPosition.z-.5;
        const col = new THREE.Color(data.color);
        const EPSILON = 0.00001;
        const degToRad = THREE.Math.degToRad;

        // minSlope will give the largest cos() and vice versa, use EPSILON to counter rounding errors
        const maxSlope = Math.cos(degToRad(Math.max(0, data.minSlope))) + EPSILON;
        const minSlope = Math.cos(degToRad(Math.max(0, data.maxSlope))) - EPSILON;
        
        for (let i = 0, n = colors.count, faceIndex = 0; i < n; i += VERTICES_PER_TRIANGLE, faceIndex++) {
          let paintTriangle = false;

          if (data.faces.length > 0 && !data.faces.includes(faceIndex)) {
            paintTriangle = false;
          } else {
            paintTriangle = true;

            // if any vertex in the triangle fails, then DO NOT paint any of the vertices for this triangle
            for (let j = 0; j < VERTICES_PER_TRIANGLE; j++) {
              const k = i + j;
              const x = positions.getX(k);
              const y = positions.getY(k);
              const z = positions.getZ(k);
              if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
                paintTriangle = false;
                break
              }

              const slope = Math.abs(normals.getY(k)); // dot(normal,UP)
              if (slope < minSlope || slope > maxSlope) {
                paintTriangle = false;
                break
              }  
            }
          } 

          if (paintTriangle) {
            for (let j = 0; j < VERTICES_PER_TRIANGLE; j++) {
              colors.setXYZ(i+j, col.r, col.g, col.b);
            }
          }
        }

        colors.needsUpdate = true;

        const material = mesh.material;
        material.vertexColors = THREE.VertexColors;
        // material.color.setRGB(1,1,1)

        if (rebuildMesh) {
          console.info(`face-color rebuilding mesh '${data.meshName}'`);
          const newMesh = new THREE.Mesh(geometry, material);
          this.el.setObject3D(data.meshName, newMesh);
        }

        this.applyingFaceColors = false;
      }
    },

    // allocateVertexColors(geometry, defaultColor) {
    //   const positions = geometry.getAttribute("position")
    //   const newColors = new Float32Array(positions.count*COLOR_FLOATS_PER_VERTEX)

    //   for (let i = 0; i < positions.count; i++) {
    //     const j = i*COLOR_FLOATS_PER_VERTEX
    //     newColors[j] = defaultColor.r
    //     newColors[j+1] = defaultColor.g
    //     newColors[j+2] = defaultColor.b
    //   }

    //   geometry.setAttribute("color", new THREE.Float32BufferAttribute(newColors, COLOR_FLOATS_PER_VERTEX))
    // },
  });

  const indexFromXY = (x,y, width) => y*width + x;
  const xyFromIndex = (cellID, width) => [ cellID % width, Math.trunc( cellID/width ) ];
  const ATTEMPT_MULTIPLIER = 4;

  AFRAME.registerComponent("foliage", {
    schema: {
      instancePool: { type: "selector" },
      cellSize: { default: 10 },
      avoidance: { default: 1 },
      densities: { default: "1" },
      rotations: { default: "0" },
      scales: { default: "1" },
      colors: { default: "white" },
      intensityMap: { type: "selector" },
      debugCanvas: { type: "selector" },
      seed: { default: -1 }
    },

    multiple: true,

    init() {
      this.cells = [];
      this.lcg = lcg();

      this.onPoolAvailable = this.onPoolAvailable.bind(this);
    },

    remove() {
      if (this.data.instancePool) {
        this.data.instancePool.removeEventListener("pool-available", this.onPoolAvailable);
      }
      this.removeModels();
    },

    update(oldData) {
      const data = this.data;
      this.lcg.setSeed(data.seed);
      this.densities = parseNumberArray( data.densities );
      this.rotations = parseNumberArray( data.rotations );
      this.scales = parseNumberArray( data.scales );
      this.colors = parseColorArray( data.colors );

      this.drawCtx = data.debugCanvas instanceof HTMLCanvasElement ? data.debugCanvas.getContext("2d") : undefined;

      if (data.instancePool) {
        this.pool = data.instancePool.components["instance-pool"];
        data.instancePool.addEventListener("pool-available", this.onPoolAvailable);
        if (this.pool.isAvailable()) {
          this.createFoliage();
        }
      }
    },

    tick() {

    },

    tock() {

    },

    createFoliage() {
      const data = this.data;
      const intensityMap = data.intensityMap;
      const width = intensityMap.width;
      const height = intensityMap.height;
      let srcCtx;

      if (intensityMap instanceof HTMLCanvasElement) {
        srcCtx = intensityMap.getContext("2d");
      } else if (intensityMap instanceof HTMLImageElement || intensityMap instanceof SVGImageElement) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        srcCtx = tempCanvas.getContext("2d");
        srcCtx.drawImage(intensityMap, 0, 0);
      }

      const FLOATS_PER_COLOR = 4;
      const maxDensities = this.densities.length - 1;
      const srcImage = srcCtx.getImageData(0, 0, width, height);
      const srcImageData = srcImage.data;
      const intensities = Float32Array.from( { length: srcImageData.length/FLOATS_PER_COLOR }, (_, cellID) => {
        return ( srcImageData[cellID*FLOATS_PER_COLOR] + srcImageData[cellID*FLOATS_PER_COLOR + 1] + srcImageData[cellID*FLOATS_PER_COLOR + 2] ) / ( 255*3 + 1 )  // ignore alpha
      } ); // in the range 0..1

      const sortedIndices = Array.from( intensities.keys() ).sort( (a,b) => intensities[b] - intensities[a] ); // descending

      for (let cell of this.cells) {
        this.removeModels(cell);
      }

      this.cells = [];
      this.drawGrid2D(width, height, "black");

      // this.el.sceneEl.object3D.updateMatrixWorld(true) // we want to capture the whole hierarchy, is there a better way to do this?

      for (let index of sortedIndices) {
        const level = Math.trunc( intensities[index] * ( maxDensities + 2 ) ); // +2 because we count the 0th and intensities is only to 0.99999 
        if (level === 0) {
          break
        }

        const [x,y] = xyFromIndex(index, width);
        const densityAttribute = this.densities[level - 1] || 1; // -1 because we ingnore the 0th
        const rotationAttribute = this.rotations[ Math.min(this.rotations.length - 1, level - 1) ] || 0;
        const scaleAttribute = this.scales[ Math.min(this.scales.length - 1, level - 1) ] || 1;
        const colorAttribute = this.colors[ Math.min(this.colors.length - 1, level - 1) ] || 1;
        const newCell = this.populateCell(level, index, x, y, width, height, data.cellSize, densityAttribute, rotationAttribute, scaleAttribute, colorAttribute, data.avoidance);
        this.cells[index] = newCell;

        this.addModels(newCell, width, height, data.cellSize);
      }

      updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, data.debugCanvas);
    },

    addModels(cell, width, height, cellSize) {
      const pos = new THREE.Vector3();
      const rotationEuler = new THREE.Euler();
      const rotationQuat = new THREE.Quaternion();
      const objectCount = cell.objects.length;

      if (!cell.indexCount || cell.indexCount < objectCount) {
        if (cell.indexCount) {
          this.pool.releaseBlock(objectCount);
        }
        cell.index = this.pool.reserveBlock(objectCount);
        cell.indexCount = objectCount;
      }

      if (cell.index === undefined) {
        return // objectCount is 0 or there are no instances available
      }

      const start = cell.index;
      for (let k = 0; k < objectCount; k++) {
        const obj = cell.objects[k];

        pos.x = (obj.x - width/2)*cellSize;
        pos.y = 0;
        pos.z = (obj.y - height/2)*cellSize;

        rotationQuat.setFromEuler( rotationEuler.set( 0, obj.rotation, 0 ) );

        this.pool.setScaleAt(start + k, obj.scale, obj.scale, obj.scale);
        this.pool.setPositionAt(start + k, pos.x, pos.y, pos.z);
        this.pool.setQuaternionAt( start + k, rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w );
        this.pool.setColorAt( start + k, obj.color.r, obj.color.g, obj.color.b );
      }

      return cell.objects.length
    },

    removeModels(cell) {
      if (this.poolIndex && cell.indexCount > 0) {
        this.pool.releaseBlock( cell.index );
        cell.indexCount = 0;
        cell.index = undefined;
      }
    },

    populateCell(level, cellID, x, y, width, height, cellSize, densityAttribute, rotationAttribute, scaleAttribute, colorAttribute, avoidance) {
      const r = avoidance/cellSize;
      const square = x => x*x;
      const cell = { id: cellID, objects: [] };

      this.lcg.setSeed(cellID*1761);

      function hasOverlap(cell, x, y, r) {
        if (cell) {
          for (let obj of cell.objects) {
            if ( square(obj.x - x) + square(obj.y - y) < square(r + obj.r) ) {
              return true
            }
          }
        }
        return false
      }

      const density = randomize(densityAttribute, this.lcg.random);
      let count = 0;
      let attempts = density*ATTEMPT_MULTIPLIER;

      while (count < density && attempts-- > 0) {
        const nx = this.lcg.random() + x;
        const ny = this.lcg.random() + y;

        let overlap = hasOverlap(cell, nx, ny, r);
        overlap = overlap || ( x > 0 && hasOverlap( this.cells[ indexFromXY(x-1, y, width) ], nx, ny, r ) );
        overlap = overlap || ( y > 0 && hasOverlap( this.cells[ indexFromXY(x, y-1, width) ], nx, ny, r ) );
        overlap = overlap || ( x < width-1 && hasOverlap( this.cells[ indexFromXY(x+1, y, width) ], nx, ny, r ) );
        overlap = overlap || ( y < height-1 && hasOverlap( this.cells[ indexFromXY(x, y+1, width) ], nx, ny, r ) );

        if (overlap) {
          this.drawCircle2D( nx/width, ny/height, r/width, "red" );
        } else {
          const rotation = randomize(rotationAttribute, this.lcg.random);
          const scale = randomize(scaleAttribute, this.lcg.random);
          const color = randomize(colorAttribute, this.lcg.random);
          cell.objects.push( { level, x: nx, y: ny, r, scale, rotation, color } );
          this.drawCircle2D( nx/width, ny/height, r/width, "blue", true );
          count++;
        }
      }

      return cell
    },

    onPoolAvailable(evt) {
      if (evt.detail.pool === this.pool) {
        this.createFoliage();
      }
    },

    drawCircle2D(x, y, r, col, fill = false) {
      if (this.drawCtx) {
        x *= this.drawCtx.canvas.width;
        y *= this.drawCtx.canvas.height;
        r *= this.drawCtx.canvas.width;
        this.drawCtx.beginPath();
        this.drawCtx.arc(x, y, r, 0, Math.PI*2);
        if (fill) {
          this.drawCtx.fillStyle = col;
          this.drawCtx.fill();
        } else {
          this.drawCtx.strokeStyle = col;
          this.drawCtx.stroke();
        }
      }
    },
    
    drawPoint2D(x, y, col) {
      if (this.drawCtx) {
        x *= this.drawCtx.canvas.width;
        y *= this.drawCtx.canvas.height;
        this.drawCtx.fillStyle = col;
        this.drawCtx.fillRect(x, y, 1, 1);
      }
    },
    
    drawGrid2D(width, height, col) {
      if (this.drawCtx) {
        this.drawCtx.strokeStyle = col;
        const dx = this.drawCtx.canvas.width/width;
        const dy = this.drawCtx.canvas.height/height;

        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            this.drawCtx.strokeRect(x*dx, y*dy, dx, dy);
          }
        }
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

  const IDLE = Symbol("idle");
  const HOVER = Symbol("hover");
  const GRAB = Symbol("grab");

  // state of each hand is either (events are shown in braces)
  // IDLE -(hoverstart)-> HOVER -(hoverend)-> IDLE
  // IDLE -(hoverstart)-> HOVER -(hoverend, grabstart)-> GRAB -(grabend)-> IDLE

  AFRAME.registerSystem("grab-system", {
    schema: {
      hands: { type: "selectorAll", default: "[hand-controls], [oculus-touch-controls], [vive-controls], [windows-motion-controls]" },
      grabStart: { default: "triggerdown" },
      grabEnd: { default: "triggerup" },
      debug: { default: false },
    },

    init() {
      this.grabEvents = new Set();
      this.onGrabEvent = this.onGrabEvent.bind(this);
      this.targets = [];
      this.hands = [];
    },

    remove() {
      this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) );
    },

    update(oldData) {
      const data = this.data;

      if (oldData.hands !== data.hands) {
        this.grabEvents.forEach( type => this.removeHandListeners(type, this.onGrabEvent) );
        this.hands = data.hands ? data.hands.map(el => ( { el, target: undefined, name: IDLE } ) ) : [];
        this.grabEvents.forEach( type => this.addHandListeners(type, this.onGrabEvent) );
        if (data.debug) {
          log(this, `found ${this.hands.length} hands`);
        }
      }
    },

    tick() {
      for (let hand of this.hands) {
        if (hand.name !== GRAB) {
          this.checkHover(hand);
        }
      }
    },

    checkHover(hand) {
      const target = this.findOverlapping(hand.el, this.targets);
      this.transition(hand, { name: (target ? HOVER : IDLE), target });
    },

    registerTarget(el, customConfig = {}) {
      const data = this.data;
      const config = Object.assign( {el, obj3D: el.object3D, grabStart: data.grabStart, grabEnd: data.grabEnd, instanceIndex: -1 }, customConfig );
      const index = this.targets.findIndex(target => target.el === el && target.obj3D === config.obj3D && target.instanceIndex === config.instanceIndex);
      if (index === -1) {
        this.targets.push( config );

        this.grabEvents.add(config.grabStart);
        this.grabEvents.add(config.grabEnd);
        this.addHandListeners(config.grabStart, this.onGrabEvent);
        this.addHandListeners(config.grabEnd, this.onGrabEvent);

        if (data.debug) {
          log(this, `registered: ${getDebugName(el)}, grabStart: ${config.grabStart}, grabEnd: ${config.grabEnd}, instanceIndex: ${config.instanceIndex}`);
        }
      }
    },

    unregisterTarget(el, customConfig) {
      const obj3D = customConfig.obj3D || el.object3D;
      const instanceIndex = typeof customConfig.instanceIndex !== "undefined" ? customConfig.instanceIndex : -1;
      const index = this.targets.findIndex(target => target.el === el && target.obj3D === obj3D && target.instanceIndex === instanceIndex);
      if (index !== -1) {
        this.targets.splice(index);

        if (this.data.debug) {
          log(this, `unregistered ${getDebugName(el)}, instanceIndex: ${instanceIndex}`);
        }
      }
    },

    addHandListeners(type, callback) {
      for (let hand of this.hands) {
        // addEventListener does nothing if the event is already registered
        hand.el.addEventListener(type, callback);

        if (this.data.debug) {
          log(this, `add listener '${type}' to ${getDebugName(hand.el)}`);
        }
      }
    },

    removeHandListeners(type, callback) {
      for (let hand of this.hands) {
        // removeEventListener does nothing if the event is not registered
        hand.el.removeEventListener(type, callback);

        if (this.data.debug) {
          log(this, `remove listener '${type}' from ${getDebugName(hand.el)}`);
        }
      }
    },

    sendEvent(el, type, detail) {
      if (this.data.debug) {
        log(this, `send '${type}' to '${getDebugName(el)}'`);
      }
      el.emit(type, detail);
    },

    // find the smallest overlapping volume
    findOverlapping: (function () {
      const instancedMatrixWorld = new THREE.Matrix4();

      return function findOverlapping(handEl, targets) {
        // ignore overlapping when not in vr-mode, this prevents vr interactions in another
        // broswer window that is in VR triggering interactions in a browser window that is not
        // in vr
        if (!this.el.is('vr-mode')) {
          return undefined
        }

        const data = this.data;
        const self = this;
    
        let minScore = Number.MAX_VALUE;
        let overlapping = undefined;
    
        // generate the bounding boxes of hands and targets (this is useful for debugging, even if some are missing)
        const hand3D = handEl.object3D;
        if (!hand3D.boundingSphere || !hand3D.boundingBox || hand3D.boundingBox.isEmpty()) {
          generateOrientedBoundingBox(hand3D, data.debug ? 0x00FFFF : undefined); // cyan
        }
    
        for (let target of targets) {
          const target3D = target.obj3D;  
          if (!target3D) { 
            continue 
          }
    
          if (!target3D.boundingSphere || !target3D.boundingBox || target3D.boundingBox.isEmpty()) {
            generateOrientedBoundingBox(target3D, data.debug ? 0xFFFF00 : undefined); // yellow
          }
        }
    
        if (hand3D.boundingBox.isEmpty()) {
          return undefined
        }
    
        for (let target of targets) {
          const target3D = target.obj3D;  
          if (!target3D) { 
            continue 
          }
    
          if (target3D.boundingBox.isEmpty()) { 
            continue 
          }
    
          const targetMatrixWorld = target.instanceIndex >= 0 ? calcMatrixWorld(target3D, target.instanceIndex, instancedMatrixWorld) : target3D.matrixWorld;
    
          // Bounding box collision check
          const isOverlapping = boxWithBox(hand3D.boundingBox.min, hand3D.boundingBox.max, hand3D.matrixWorld.elements, target3D.boundingBox.min, target3D.boundingBox.max, targetMatrixWorld.elements);
    
          if (isOverlapping) {
            const score = self.getScore(hand3D, target, targetMatrixWorld);
            if (score < minScore) {
              minScore = score;
              overlapping = target;
            }
          }
    
        }
    
        return overlapping
      }
    })(),


    transition(state, action) {
      const oldState = state.name;

      switch (oldState) {
        case IDLE:
          if (action.name === HOVER) {
            this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D, instanceIndex: action.target.instanceIndex });
            state.name = HOVER;
            state.target = action.target;
          }
          break

        case HOVER:
          if (action.name === IDLE) {
            this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex });
            state.name = IDLE;
            state.target = undefined;
          } else if (action.name === GRAB) {
            this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex });
            this.sendEvent(state.target.el, "grabstart", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex });
            state.name = GRAB;
          } else if (action.name === HOVER && (action.target !== state.target)) {
            this.sendEvent(state.target.el, "hoverend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex });
            this.sendEvent(action.target.el, "hoverstart", { hand: state.el, obj3D: action.target.obj3D, instanceIndex: action.target.instanceIndex });
            state.target = action.target;
          }
          break

        case GRAB:
          if (action.name === IDLE) {
            this.sendEvent(state.target.el, "grabend", { hand: state.el, obj3D: state.target.obj3D, instanceIndex: state.target.instanceIndex });
            state.name = IDLE;
            state.target = undefined;
          }
          break
      }

      return state
    },

    // grabStart and grabEnd may be bound to the same event e.g. gripdown on vive
    // so we need to deduce the state of the grab
    onGrabEvent(event) {
      const hand = this.hands.find(hand => hand.el === event.target);
      if (hand) {
        if (hand.name === GRAB && hand.target && hand.target.grabEnd === event.type && hand.target.el) {
          this.transition(hand, {name: IDLE});
        } else if (hand.name === HOVER && hand.target && hand.target.el && hand.target.grabStart === event.type) {
          this.transition(hand, {name: GRAB});
        }
      }
    },

    // more negative is better
    getScore: (function() {
      const handPos = new THREE.Vector3();
      const targetPos = new THREE.Vector3();
      const handForward = new THREE.Vector3();
      const handToTarget = new THREE.Vector3();
      const pointOnForward = new THREE.Vector3();

      return function getScore(hand3D, target, targetMatrixWorld) {
        switch (target.score) {
          case "closestforward":
            handPos.setFromMatrixPosition(hand3D.matrixWorld);
            targetPos.setFromMatrixPosition(targetMatrixWorld);
            handForward.setFromMatrixColumn(hand3D.matrixWorld, 2); // controller points in the -z direction
            handToTarget.subVectors(targetPos, handPos);
            handForward.normalize();
    
            // prefer targets that are in front of the controller origin, and closer to the forward axis
            const scalar = handForward.dot(handToTarget);
            pointOnForward.copy(handForward).multiplyScalar(scalar);
            const score = pointOnForward.sub(handToTarget).length();
            return scalar < 0 ? score : score*10 // prefer targets in front (-ve scalar)
            
          case "volume":
          default:
            return volume(target.obj3D.boundingBox)
        }
      }
    })(),
  });

  AFRAME.registerComponent( "handle", {
    schema: {
      target: { default: "parent" },
      debug: { default: false },
    },

    events: {
      "grabstart": function ( e ) { this.onGrabStart( e ); },
      "grabend": function ( e ) { this.onGrabEnd( e ); },
    },

    init() {
      this.onGrabStart = this.onGrabStart.bind( this );
      this.onGrabEnd = this.onGrabEnd.bind( this );
      this.grabHand = undefined;
      this.invHandMatrix = new THREE.Matrix4();
    },

    tick() {
      if ( !this.grabHand ) {
        this.el.sceneEl.removeBehavior( this );
        return
      }

      this.repositionTarget();
    },

    repositionTarget: ( function () {
      const newMatrix = new THREE.Matrix4();
      const inverseParentMat = new THREE.Matrix4();
      const ignoreScale = new THREE.Vector3();

      return function repositionTarget() {
        const target3D = this.getTargetObject3D( this.data.target );
        if ( !target3D ) {
          return
        }
    
        const hand3D = this.grabHand.object3D;
        hand3D.updateMatrixWorld();
        target3D.updateMatrixWorld();
    
        inverseParentMat.getInverse(target3D.parent.matrixWorld); // in case the parent is moving
        newMatrix.copy(this.invHandMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat);
        // newMatrix.copy(this.handMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat)
        // newMatrix.copy(hand3D.matrixWorld).premultiply(inverseParentMat)
        newMatrix.decompose(target3D.position, target3D.quaternion, ignoreScale);
      }

    })(),
    
    getTargetObject3D( target ) {
      switch ( target ) {
        case "self": return this.el.object3D
        case "parent": return this.el.object3D.parent
        default: 
          const el = document.querySelector( this.data.target );
          return el ? el.object3D : undefined
      }
    },

    onGrabStart( e ) {
      if ( this.data.debug ) {
        console.log( getDebugName( this.el ), "onGrabStart", getDebugName( e.detail.hand ) );
      }

      this.grabHand = e.detail.hand;
      this.el.sceneEl.addBehavior( this ); // start tick()

      const target3D = this.getTargetObject3D( this.data.target );

      if (target3D) {
        const hand3D = this.grabHand.object3D;
        hand3D.updateMatrixWorld();
        target3D.updateMatrixWorld();
        this.invHandMatrix.getInverse( hand3D.matrixWorld ).multiply( target3D.matrixWorld );
      }
    },

    onGrabEnd( e ) {
      if ( this.data.debug ) {
        console.log( getDebugName( this.el ), "onGrabEnd", getDebugName( e.detail.hand ) );
      }

      if ( this.grabHand === e.detail.hand ) {
        this.grabHand = undefined;
      }
    },

  } );

  const VERTS_PER_CELL = 6;

  const CHANNEL_MULTIPLIERS = {
    "rgb": [1/765, 1/765, 1/765, 0],
    "rgba": [1/765, 1/765, 1/765, 1/765],
    "r": [1/255, 0, 0, 0],
    "g": [0, 1/255, 0, 0],
    "b": [0, 0, 1/255, 0],
    "a": [0, 0, 0, 1/255],
  };

  AFRAME.registerComponent("heightfield", {
    schema: {
      src: { type: "selector" },
      numRows: { type: "int", default: 32 },
      numCols: { type: "int", default: 32 },
      heightScale: { default: .2 },
      channels: { default: "rgb", oneOf: Object.keys(CHANNEL_MULTIPLIERS) },
      smooth: { default: false }
    },

    init() {
      this.onLoaded = this.onLoaded.bind(this);
      this.loadTextureCallback = this.loadTextureCallback.bind(this);
      this.geometry = undefined;
      this.image = undefined;
    },

    update(oldData) {
      const data = this.data;

      if (oldData.src !== data.src) {
        this.loadTexture(data.src);
      } else if (oldData.numRows !== data.numRows || oldData.numCols !== data.numCols || oldData.smooth !== data.smooth) {
        this.createHeightfield(this.image);
      } else if (oldData.heightScale !== data.heightScale || oldData.channels !== data.channels) {
        // check the object3D mesh to ensure we still control it
        if (this.el.getObject3D("mesh") === this.mesh) {
          this.updateHeightfield(this.image);
        }  
      }
    },

    loadTexture(name) {
      const materialSystem = this.el.sceneEl.systems["material"];
      materialSystem.loadTexture(name, {src: name}, this.loadTextureCallback);
    },

    loadTextureCallback(texture) {
      if (texture && texture.image && texture.image instanceof HTMLElement) {
        this.createHeightfield(texture.image);
      } else {
        warn(`heightfield: unable to access image '${this.data.src}'`);
      }
    },

    onLoaded(evt) {
      this.createHeightfield(evt.target);
    },

    createHeightfield(image) {
      if (this.image !== image) {
        if (this.image) {
          this.image.removeEventListener("loaded", this.onLoaded);
        }
        this.image = image;
        if (image) {
          image.addEventListener("loaded", this.onLoaded);
        }
      }

      const numRows = this.data.numRows;
      const numCols = this.data.numCols;
      let geometry;

      if (this.data.smooth) {

        geometry = new THREE.PlaneBufferGeometry(1, 1, numCols, numRows);
        geometry.applyMatrix( new THREE.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,-1,0,0, 0,0,0,1) ); // rotate -90 about x

      } else {

        const numCells = numCols*numRows;
        const numVerts = numCells*VERTS_PER_CELL;
        const vertices = new Float32Array(numVerts*3);
        const normals = new Float32Array(numVerts*3);
        const uvs = new Float32Array(numVerts*2);
    
        geometry = new THREE.BufferGeometry();
    
        // (x,y)a--b  triangles are *bad* and *cda*
        //      |\ |  vertices are *badcda*
        //      | \|  indices are 0-2=b, 3-5=a, 6-8=d, 9-11=c, 12-14=d, 15-17=a
        //      c--d  ax=3,15 az=5,17 bx=0 bz=2 cx=9 cz=11 dx=6,12 dz=8,14
    
        for (let z = 0; z < numRows; z++) {
          for (let x = 0; x < numCols; x++) {
            const i = (z*numCols + x)*VERTS_PER_CELL*3;
            const j = (z*numCols + x)*VERTS_PER_CELL*2;
            const minU = x/numCols, maxU = (x+1)/numCols;
            const minV = z/numRows, maxV = (z+1)/numRows;
    
            vertices[i+3] = vertices[i+9] = vertices[i+15] = minU - .5; // ax,cx
            vertices[i+2] = vertices[i+5] = vertices[i+17] = minV - .5; // az,bz
            vertices[i+0] = vertices[i+6] = vertices[i+12] = maxU - .5; // bx,dx
            vertices[i+8] = vertices[i+11] = vertices[i+14] = maxV - .5; // cz,dz
    
            uvs[j+2] = uvs[j+6] = uvs[j+10] = minU;
            uvs[j+1] = uvs[j+3] = uvs[j+11] = 1 - minV;
            uvs[j+0] = uvs[j+4] = uvs[j+8] = maxU;
            uvs[j+5] = uvs[j+7] = uvs[j+9] = 1 - maxV;
          }
        }
    
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

      }

      const oldMesh = this.el.getObject3D("mesh");
      this.mesh = new THREE.Mesh(geometry, oldMesh ? oldMesh.material : new THREE.MeshBasicMaterial());

      this.updateHeightfield(this.image);

      // must be set after the heightfield update, so that other components that receive the 
      // object3dset notification get a mesh with the completed heightfield
      this.el.setObject3D("mesh", this.mesh);
    },

    updateHeightfield(image) {
      /** @type { HTMLCanvasElement } */
      let canvas;

      if (image instanceof HTMLCanvasElement) {
        canvas = image;
      } else {
        // @ts-ignore
        canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
      }

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvasWidth, canvasHeight).data;
      const numRows = this.data.numRows;
      const numCols = this.data.numCols;

      const uvs = this.mesh.geometry.getAttribute("uv");
      const positions = this.mesh.geometry.getAttribute("position");
      const multiplier = CHANNEL_MULTIPLIERS[this.data.channels] || CHANNEL_MULTIPLIERS["rgb"];
      const heightScale = this.data.heightScale;

      // sample the heights
      const RGBA_PER_POINT = 4;
      const numPoints = (numRows+1)*(numCols+1);
      const numCells = numRows*numCols;
      const heights = new Float32Array(numPoints);
      const midHeights = new Float32Array(numCells);

      // these values are for points (#vertical points = #rows + 1 and #horizontal points = #cols + 1)
      const dx = (canvasWidth-1)/numCols;
      const dz = (canvasHeight-1)/numRows;

      for (let z = 0; z <= numRows; z++) {
        for (let x = 0; x <= numCols; x++) {
          const j = (Math.floor(x*dx) + Math.floor(z*dz)*canvasWidth)*RGBA_PER_POINT;
          heights[x + z*(numCols+1)] = (pixels[j]*multiplier[0] + pixels[j+1]*multiplier[1] + pixels[j+2]*multiplier[2] + pixels[j+3]*multiplier[3])*heightScale;
        }
      }

      // heights at the midpoints are used to tell which direction to angle the triangle patch
      // generate one midpoint per cell
      for (let z = 0; z < numRows; z++) {
        for (let x = 0; x < numCols; x++) {
          const j = (Math.floor((x + .5)*dx) + Math.floor((z + .5)*dz)*canvasWidth)*RGBA_PER_POINT;
          midHeights[x + z*numCols] = (pixels[j]*multiplier[0] + pixels[j+1]*multiplier[1] + pixels[j+2]*multiplier[2] + pixels[j+3]*multiplier[3])*heightScale;
        }
      }

      if (this.data.smooth) {

        for (let i = 0; i < positions.count; i++) {
          positions.setY(i, heights[i]);
        }

      } else {

        // these values are for cells
        for (let z = 0; z < numRows; z++) {
          for (let x = 0; x < numCols; x++) {
            const i = x + z*(numCols+1); // points
            const j = x + z*numCols; // cells
            const k = j*VERTS_PER_CELL; // verts
            const heightA = heights[i];
            const heightB = heights[i + 1];
            const heightC = heights[i + numCols + 1];
            const heightD = heights[i + numCols + 2];
            const midHeight = midHeights[j];
            const minU = x/numCols;
            const maxU = (x + 1)/numCols;

            positions.setY(k, heightB);
            positions.setY(k+1, heightA);
            positions.setY(k+3, heightC);
            positions.setY(k+4, heightD);

            // cut the square in the direction which is closest to the image midpoint height, this lessens the
            // ridged values artefact.  Just set the U because the V doesn't change
            if (Math.abs((heightA + heightD)*.5 - midHeight) > Math.abs((heightC + heightB)*.5 - midHeight)) {
              // switch to *baccdb*
              positions.setX(k+2, minU - .5);
              positions.setY(k+2, heightC);
              positions.setX(k+5, maxU - .5);
              positions.setY(k+5, heightB);
              uvs.setX(k+2, minU);
              uvs.setX(k+5, maxU);
            } else {
              // output as *badcda*
              positions.setX(k+2, maxU - .5);
              positions.setY(k+2, heightD);
              positions.setX(k+5, minU - .5);
              positions.setY(k+5, heightA);
              uvs.setX(k+2, maxU);
              uvs.setX(k+5, minU);
            }
          }
        }

      }

      this.mesh.geometry.computeVertexNormals();

      positions.needsUpdate = true;
    },
  });

  AFRAME.registerComponent( "hull", {
    schema: {
      points: { default: "" },
      src: { type: "selector" },
      computeNormals: { default: false },
    },

    init() {
      this.onObject3DSet = this.onObject3DSet.bind( this );
    },

    update( oldData ) {
      const data = this.data;
      let points;

      if ( data.src === this.el ) {
        error( `cannot set 'src' to yourself` );
      }

      if ( data.src !== oldData.src ) {
        if ( oldData.src ) {
          oldData.src.removeEventListener( "object3dset", this.onObject3DSet );
        }

        if ( data.src ) {
          if ( data.src.object3D ) {
            points = generatePointsFromObject3D( data.src.object3D );        
            data.src.addEventListener( "object3dset", this.onObject3DSet );
          } else {
            warn( `'src' must point to an entity` );
          }
        }
      }

      if ( data.points !== oldData.points ) {
        if ( data.points && !points ) {
          const verts = data.points.split( "," ).map( str => AFRAME.utils.coordinates.parse( str ) );
          const AXIS = [ "x", "y", "z" ];
          points = Float32Array.from( { length: verts.length*3 }, ( _, i ) => verts[ ~~( i/3 ) ][ AXIS[ i%3 ] ] );
        }
      }

      if ( points ) {
        this.generateHull( points );
      }
    },

    generateHull( points ) {
      const triangles = generateHullTriangles( points );
      const newPositions = triangles.flatMap( index => [ points [index ], points[ index+1 ], points[ index+2 ] ] );

      const geo = new THREE.BufferGeometry();
      geo.setAttribute( "position", new THREE.BufferAttribute( Float32Array.from( newPositions ), 3 ) );

      if ( this.data.computeNormals ) {
        geo.computeVertexNormals();
      }
      
      const mesh = new THREE.Mesh( geo, new THREE.MeshBasicMaterial( { color: "white" } ) );
      this.el.setObject3D( "mesh", mesh );
    },

    onObject3DSet( e ) {
      const data = this.data;

      if ( e.target === data.src ) {
        const points = generatePointsFromObject3D( data.src.object3D );
        if ( points ) {
          this.generateHull( points );
        }
      }
    },

  } );

  function generatePointsFromObject3D( object3D ) {
    let points = [];

    object3D.parent.updateMatrixWorld();
    const invObjectMatrix = new THREE.Matrix4().getInverse( object3D.matrixWorld );
    const localMatrix = new THREE.Matrix4();
    const objectVert = new THREE.Vector3();

    object3D.traverse( node => {
      const mesh = node.isMesh ? node : undefined;

      if ( mesh && mesh.geometry ) {
        localMatrix.copy( mesh.matrixWorld ).multiply( invObjectMatrix );

        if ( mesh.geometry.isBufferGeometry ) {
          const positions = mesh.geometry.getAttribute( "position" ).array;
          const stride = mesh.geometry.getAttribute( "position" ).itemSize;
          const numPositions = positions.length;

          for ( let i = 0; i < numPositions; i += stride ) {
            objectVert.set( positions[ i ], positions[ i+1 ], positions[ i+2 ] ).applyMatrix4( localMatrix );
            points.push( objectVert.x, objectVert.y, objectVert.z );
          }

        } else {
          const vertices = mesh.geometry.vertices;
          const numVertices = mesh.geometry.vertices.length;

          for ( let i = 0; i < numVertices; i++ ) {
            objectVert.copy( vertices[i] ).applyMatrix4( localMatrix );
            points.push( objectVert.x, objectVert.y, objectVert.z );
          }
        }
      }
    } );

    return points.length > 0 ? points : undefined
  }

  AFRAME.registerComponent("instance", {
    schema: {
      src: { type: "selector" },
      color: { type: "color", default: "#fff" },
      dynamic: { default: false },
    },

    init() {
      this.instancePool = undefined;
      this.blockIndex = undefined;
      this.color = new THREE.Color();
    },

    remove() {
      this.freeInstance();
    },

    update(oldData) {
      const data = this.data;

      if (oldData.src !== data.src) {
        const instancePool = data.src.components["instance-pool"];
        if (instancePool) {
          this.freeInstance();
          this.blockIndex = instancePool.reserveBlock(1);
          this.instancePool = instancePool;
          if (this.blockIndex === undefined) {
            warn(`no more instances available`);
          }
        } else {
          warn(`no 'instance-pool' found on src`);
        }
      } else {
        error(`missing 'src' on 'instance' component`);
      }

      if (oldData.dynamic !== data.dynamic && data.dynamic) {
        this.el.sceneEl.addBehavior(this); // enable tick
      }

      if (oldData.color !== data.color) {
        this.color.set(data.color);
      }
    },

    tick() {
      this.syncTransform();

      if (!this.data.dynamic) {
        this.el.sceneEl.removeBehavior(this); // need to disable here as it is only setup after the first update
      }
    },

    syncTransform() {
      const i = this.blockIndex;
      if (this.instancePool && i !== undefined) {
        let vec = this.el.object3D.position;
        this.instancePool.setPositionAt(i, vec.x, vec.y, vec.z);
        vec = this.el.object3D.quaternion;
        this.instancePool.setQuaternionAt(i, vec.x, vec.y, vec.z, vec.w);
        vec = this.el.object3D.scale;
        this.instancePool.setScaleAt(i, vec.x, vec.y, vec.z);
        const col = this.color;
        this.instancePool.setColorAt(i, col.r, col.g, col.b);
      }
    },

    freeInstance() {
      if (this.instancePool && this.blockIndex !== undefined) {
        this.instancePool.releaseBlock(this.blockIndex);
      }
      this.instancePool = undefined;
      this.blockIndex = undefined;
    }
  });

  AFRAME.registerPrimitive("a-instance", {
    defaultComponents: { instance: {} },
    mappings: { src: "instance.src", color: "instance.color", dynamic: "instance.dynamic" },
  });

  const FLOATS_PER_COLOR = 4;
  const FLOATS_PER_POSITION$1 = 3;
  const FLOATS_PER_QUATERNION$1 = 4;
  const FLOATS_PER_SCALE = 3;

  const BLOCK_INDEX = 0;
  const BLOCK_SIZE = 1;

  AFRAME.registerComponent("instance-pool", {
    schema: {
      size: { default: 1000 },
      patchShader: { default: true },
    },

    init() {
      this.oldMesh = undefined;
      this.positions = undefined;
      this.colors = undefined;
      this.quaternions = undefined;
      this.scales = undefined;
      this.instancedGeoemtry = undefined;
      this.reservedCount = 0;
      this.occupiedBlocks = [];
      this.freeBlocks = [];
      this.inCreateInstances = false;

      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.onBeforeCompile = this.onBeforeCompile.bind(this);

      this.el.addEventListener("object3dset", this.onObject3DSet);
    },

    remove() {
      this.el.removeEventListener("object3dset", this.setobject3d);
      this.destroyInstances();
    },

    update() {
      this.createInstances();
    },

    onObject3DSet(e) {
      if ( !this.inCreateInstances && e.target === this.el && e.detail.type === "mesh" ) {
        this.destroyInstances();
        this.createInstances();
      }
    },

    createInstances() {
      const obj3D = this.el.getObject3D("mesh");
      const mesh = obj3D ? obj3D.getObjectByProperty("isMesh", true) : undefined; // find the first mesh
      if (!mesh || !mesh.geometry || !mesh.material) {
        return
      }

      this.inCreateInstances = true;
      this.oldMesh = mesh;

      const data = this.data;
      const instancedGeometry = new THREE.InstancedBufferGeometry().copy(mesh.geometry);

      const numInstances = data.size;
      instancedGeometry.maxInstancedCount = 0;

      const positions = this.positions && this.positions.length === numInstances ? this.positions : new Float32Array(numInstances*FLOATS_PER_POSITION$1);
      const scales = this.scales && this.scales.length === numInstances ? this.scales : new Float32Array(numInstances*FLOATS_PER_SCALE).fill(0); // scale to 0 to hide
      const colors = this.colors && this.colors.length === numInstances ? this.colors : new Float32Array(numInstances*FLOATS_PER_COLOR).fill(1);
      const quaternions = this.quaternions && this.quaternions === numInstances ? this.quaternions : new Float32Array(numInstances*FLOATS_PER_QUATERNION$1).map((x,i) => (i-3) % FLOATS_PER_QUATERNION$1 ? 0 : 1);

      this.instancePosition = new THREE.InstancedBufferAttribute(positions, FLOATS_PER_POSITION$1);
      this.instanceQuaternion = new THREE.InstancedBufferAttribute(quaternions, FLOATS_PER_QUATERNION$1);
      this.instanceScale = new THREE.InstancedBufferAttribute(scales, FLOATS_PER_SCALE);
      this.instanceColor = new THREE.InstancedBufferAttribute(colors, FLOATS_PER_COLOR);

      instancedGeometry.setAttribute("instancePosition", this.instancePosition);
      instancedGeometry.setAttribute("instanceQuaternion", this.instanceQuaternion);
      instancedGeometry.setAttribute("instanceScale", this.instanceScale);
      instancedGeometry.setAttribute("instanceColor", this.instanceColor);

      let instancedMaterial = mesh.material;

      if (data.patchShader) {
        // insert the instance logic into whatever standard shader the user has provided
        if (Array.isArray(mesh.material)) {
          instancedMaterial = mesh.material.map(x => x.clone());
          instancedMaterial.forEach(x => x.onBeforeCompile = this.onBeforeCompile(x.onBeforeCompile));
        } else {
          instancedMaterial = mesh.material.clone();
          instancedMaterial.onBeforeCompile = this.onBeforeCompile(instancedMaterial.onBeforeCompile);
        }
      }

      const instancedMesh = new THREE.Mesh(instancedGeometry, instancedMaterial);
      instancedMesh.frustumCulled = false;

      this.el.setObject3D("mesh", instancedMesh);

      this.instancedGeoemtry = instancedGeometry;
      this.positions = positions;
      this.quaternions = quaternions;
      this.scales = scales;
      this.colors = colors;
      this.reservedCount = 0;
      this.freeBlocks = [[0, numInstances]]; // blockIndex, number of instances
      this.occupiedBlocks = [];

      this.inCreateInstances = false;
      this.el.emit( "pool-available", { pool: this } );
    },

    destroyInstances() {
      if (this.oldMesh) {
        this.el.setObject3D("mesh", this.oldMesh);
        this.oldMesh = undefined;
      }
      this.instancedGeoemtry = undefined;
      this.positions = undefined;
      this.quaternions = undefined;
      this.scales = undefined;
      this.colors = undefined;
      this.freeBlocks = [];
      this.occupiedBlocks = [];
    },

    onBeforeCompile(oldOnBeforeCompileFn) {
      const oldFunction = oldOnBeforeCompileFn;

      return function onBeforeCompile(shader) {
        if (oldFunction) {
          oldFunction(shader);
        }

        let vertexShader = shader.vertexShader;
        let fragmentShader = shader.fragmentShader;
    
        vertexShader = vertexShader.replace('void main()', `
      attribute vec3 instancePosition;
      attribute vec4 instanceQuaternion;
      attribute vec4 instanceColor;
      attribute vec3 instanceScale;
  
      varying vec4 vInstanceColor;
  
      vec3 applyQuaternion( const vec3 v, const vec4 q ) 
      {
        return v + 2. * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
      }
  
      void main()`);
    
        vertexShader = vertexShader.replace('#include <color_vertex>', `
      #include <color_vertex>
      vInstanceColor = instanceColor;`);
    
        vertexShader = vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = applyQuaternion( position*instanceScale, instanceQuaternion ) + instancePosition;`);
    
        vertexShader = vertexShader.replace('#include <defaultnormal_vertex>', `
      vec3 transformedNormal = normalMatrix * applyQuaternion( objectNormal/instanceScale, -instanceQuaternion );
      
      #ifdef FLIP_SIDED
        transformedNormal = - transformedNormal;
      #endif
  
      #ifdef USE_TANGENT
        vec3 transformedTangent = normalMatrix * applyQuaternion( objectTangent/instanceScale, -instanceQuaternion );
        #ifdef FLIP_SIDED
          transformedTangent = - transformedTangent;
        #endif
      #endif`);
    
        fragmentShader = fragmentShader.replace('#include <color_pars_fragment>', `
      #include <color_pars_fragment>
      varying vec4 vInstanceColor;`);
    
        fragmentShader = fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor *= vInstanceColor;`);
    
        shader.vertexShader = vertexShader;
        shader.fragmentShader = fragmentShader;
      }
    },

    isAvailable() {
      return !!this.instancedGeoemtry
    },

    reserveBlock(requestedSize) {
      if (requestedSize <= 0) {
        return undefined
      }

      // search in reverse, prefer to reuse released blocks
      for (let j = this.freeBlocks.length - 1; j >= 0; j--) {
        const block = this.freeBlocks[j];
        const remainder = block[BLOCK_SIZE] - requestedSize;

        if (remainder >= 0) {
          const newBlock = [block[BLOCK_INDEX], requestedSize];
          this.occupiedBlocks.push(newBlock);

          this.instancedGeoemtry.maxInstancedCount = Math.max(this.instancedGeoemtry.maxInstancedCount, newBlock[BLOCK_INDEX] + newBlock[BLOCK_SIZE]);

          if (remainder > 0) {
            block[BLOCK_INDEX] += requestedSize;
            block[BLOCK_SIZE] = remainder;
          } else {
            const i = this.freeBlocks;
            this.freeBlocks.splice(i, 1);
          }

          return newBlock[BLOCK_INDEX]
        }
      }

      return undefined
    },  

    releaseBlock(index) {
      for (let i = 0; i < this.occupiedBlocks.length; i++) {
        const block = this.occupiedBlocks[i];
        if (block[BLOCK_INDEX] === index) {
          for (let j = index; j < index + block[BLOCK_SIZE]; j++) {
            this.setScaleAt(j, 0, 0, 0); // scale to 0 to hide
          }

          this.occupiedBlocks.splice(i, 1);
          this.freeBlocks.push(block);
          this.repartionBlocks(block);

          const lastOccupiedInstance = this.occupiedBlocks.reduce((highest, block) => Math.max(highest, block[BLOCK_INDEX] + block[BLOCK_SIZE]), 0);
          this.instancedGeoemtry.maxInstancedCount = Math.max(this.instancedGeoemtry.maxInstancedCount, lastOccupiedInstance);

          return true
        }
      }
      return false
    },

    repartionBlocks() {
      // go in reverse for simple removal, always removing the block with the largest index on a merge
      for (let mergeIndex = this.freeBlocks.length - 1; mergeIndex >= 0; mergeIndex--) {
        const mergeBlock = this.freeBlocks[mergeIndex];

        for (let j = 0; j < mergeIndex; j++) {
          const otherBlock = this.freeBlocks[j];
          if (otherBlock[BLOCK_INDEX] == mergeBlock[BLOCK_INDEX] + mergeBlock[BLOCK_SIZE]) {
            // otherBlock immediately after mergeBlock
            otherBlock[BLOCK_INDEX] = mergeBlock[BLOCK_INDEX];
            otherBlock[BLOCK_SIZE] += mergeBlock[BLOCK_SIZE];
            this.freeBlocks.splice(mergeIndex, 1);
            break
          } else if (otherBlock[BLOCK_INDEX] + otherBlock[BLOCK_SIZE] === mergeBlock[BLOCK_INDEX]) {
            // otherBlock immediately before mergeBlock
            otherBlock[BLOCK_SIZE] += mergeBlock[BLOCK_SIZE];
            this.freeBlocks.splice(mergeIndex, 1);
            break
          }
        }
      }
    },

    setColorAt(i, r, g, b, a) {
      const j = i*FLOATS_PER_COLOR;
      this.colors[j] = r;
      this.colors[j+1] = g;
      this.colors[j+2] = b;
      this.colors[j+3] = typeof a !== "undefined" ? a : 1;
      this.instanceColor.needsUpdate = true;
    },

    setPositionAt(i, x, y, z) {
      const j = i*FLOATS_PER_POSITION$1;
      this.positions[j] = x;
      this.positions[j+1] = y;
      this.positions[j+2] = z;
      this.instancePosition.needsUpdate = true;
    },

    setScaleAt(i, x, y, z) {
      const j = i*FLOATS_PER_SCALE;
      this.scales[j] = x;
      this.scales[j+1] = typeof y !== "undefined" ? y : x;
      this.scales[j+2] = typeof z !== "undefined" ? z : x;
      this.instanceScale.needsUpdate = true;
    },

    setQuaternionAt(i, x, y, z, w) {
      const j = i*FLOATS_PER_QUATERNION$1;
      this.quaternions[j] = x;
      this.quaternions[j+1] = y;
      this.quaternions[j+2] = z;
      this.quaternions[j+3] = w;
      this.instanceQuaternion.needsUpdate = true;
    },

    getPositionAt(i, out) {
      const j = i*FLOATS_PER_POSITION$1;
      out.x = this.positions[j];
      out.y = this.positions[j+1];
      out.z = this.positions[j+2];
      return out
    },

    getColorAt(i, out) {
      const j = i*FLOATS_PER_COLOR;
      out.r = this.colors[j];
      out.g = this.colors[j+1];
      out.b = this.colors[j+2];
      out.a = this.colors[j+3];
      return out
    },

    getScaleAt(i, out) {
      const j = i*FLOATS_PER_SCALE;
      out.x = this.scales[j];
      out.y = this.scales[j+1];
      out.z = this.scales[j+2];
      return out
    },

    getQuaternionAt(i, out) {
      const j = i*FLOATS_PER_QUATERNION$1;
      out.x = this.quaternions[j];
      out.y = this.quaternions[j+1];
      out.z = this.quaternions[j+2];
      out.w = this.quaternions[j+3];
      return out
    },

  });

  const MAX_FRAME_TIME_MS = 100;

  // Takes a set of keys (from randomRules()), and provides an interpolated value, where r is 0 (first key) to 1 (last key)
  // e.g. [[1,2,3],[5,6],[7.5]] @ r = 0.25 becomes [3,4,3]
  function lerpKeys$1(type, keys, r, easingFn = Linear) {
    const [i,t] = lerpKeys(keys, r, easingFn);

    switch (type) {
      case "object": return lerpObject(keys[i], keys[i+1], t)
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
      return stringify(AFRAME.utils.entity.getComponentProperty(target, prop))
    }

    // e.g. object3dmap.mesh.material.uniforms.color
    const path = getWithPath(target, parts);
    if (path) {
      return stringify(path[prop])
    } else {
      warn(`unknown path for getProperty() '${prop}'`);
    }
  }


  //-----------------------------------------------------------------------------
  // "keyframe" component for setting attributes on this element over time
  // 
  AFRAME.registerComponent("keyframe", {
    schema: {
      events: { default: "" },
      delay: { default: 0 },
      duration: { default: 1 },
      direction: { default: "forward", oneOf: ["forward", "backward", "alternate"] },
      loops: { default: -1 },
      seed: { default: -1, type: "int" },
      easing: { default: "linear", oneOf: Object.keys(EASING_FUNCTIONS) },
      randomizeEachLoop: { default: true },
      enabled: { default: true },
      debug: { default: false },
      bubbles: { default: false },
    },
    multiple: true,

    init() {
      this.startKeyframes = this.startKeyframes.bind( this );
      this.lcg = lcg();

      this.loopTime = 0; // seconds
      this.loops = 0;
      this.keys = {};
      this.rules = {};
      this.isStarted = false;

      this.eventListener = scopedEvents( this.el, this.onEvent.bind( this ) );
      this.delayClock = basicClock();
    },

    remove() {
      this.eventListener.remove();
      this.delayClock.clearAllTimers();
    },

    play() {
      this.eventListener.add();
      this.delayClock.resume();
    },

    pause() {
      this.eventListener.remove();
      this.delayClock.pause();
    },

    updateSchema(newData) {
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
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

      // it is safe to repeatedly add/remove the same behavior
      if (this.isComplete()) {
        this.el.sceneEl.removeBehavior(this); // deactivate tick
      } else {
        this.el.sceneEl.addBehavior(this);
      }

      // when there is no duration, set the properties to the first key
      if (data.duration <= 0) {
        for (let prop in this.keys) {
          setProperty(this.el, prop, this.keys[prop][0]);
        }
      }

      if ( data.events !== oldData.events ) {
        this.eventListener.set( data.events );      
      }

      if ( !data.events && data.delay !== oldData.delay ) {
        this.delayClock.startTimer( data.delay, this.startKeyframes );
      }
    },

    tick(time, timeDelta) {
      if (this.data.enabled) {
        // clamp frame time to make thing simpler when debugging
        const dt = Math.min(timeDelta, MAX_FRAME_TIME_MS)/1000;
        this.step(dt);
      }
    },

    step(dt) {
      const data = this.data;
      const isComplete = this.isComplete();

      if (!isComplete && this.isStarted) {
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
          const value = lerpKeys$1(this.keyTypes[prop], this.keys[prop], r, easingFn);
          setProperty(this.el, prop, value);
        }
      } else {
        this.el.sceneEl.removeBehavior(this); // deactivate tick()
      }

      if ( this.isStarted && isComplete ) {
        this.sendEvent( "keyframeend", { name: this.attrName } );
        this.isStarted = false;
      }
    },

    startKeyframes() {
      if (!this.isStarted) {
        this.isStarted = true;
        this.el.sceneEl.addBehavior( this ); // activate tick()
        this.sendEvent( "keyframestart", { name: this.attrName } );
      }    
    },

    isComplete() {
      const data = this.data;
      return data.duration <= 0 || (data.loops > 0 && this.loops > data.loops)
    },

    generateKeys(resolveMissingRules) {
      let lastKey;

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
              let info = i == 0 ? parsePartAny(getPropertyAsString(this.el, prop)) : lastKey;
              if (emptyRange) rule.range = rule.range.map(x => x === "" ? info : x);
              if (emptyOption) rule.options = rule.options.map(x => x === "" ? info : x);
            }
          }

          lastKey = randomize(rule, this.lcg.random);
          this.keys[prop][ruleIndex] = lastKey;
          this.keyTypes[prop] = this.keyTypes[prop] || typeof lastKey;
        }
      }
    },

    sendEvent( type, detail ) {
      if ( this.data.debug ) {
        console.log( getDebugName( this.el ), this.attrName, "send", type, detail, this.data.bubbles );
      }
      this.el.emit( type, detail, this.data.bubbles );
    },

    onEvent( e ) {
      if ( this.data.debug ) {
        console.log( getDebugName( this.el ), this.attrName, "onEvent", e.type );
      }
      this.delayClock.startTimer( this.data.delay, this.startKeyframes );
    },
  });

  const degToRad = THREE.Math.degToRad;

  AFRAME.registerComponent("lathe", {
    schema: {
      shape: { default: "" },
      steps: { type: "int", default: 1 },
      segments: { type: "int", default: 12 },
      phiStart: { default: 0 },
      phiEnd: { default: 360 },
    },

    update() {
      const data = this.data;
      const points = shapeFromPathString(data.shape).extractPoints(data.steps).shape;
      const geo = new THREE.LatheBufferGeometry(points, data.segments, degToRad(data.phiStart), degToRad(data.phiEnd));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      this.el.setObject3D("mesh", mesh);
    }
  });

  // @ts-ignore
  const LOGGER_COLORS = {
    "error": "red",
    "warn": "yellow",
    "log": "white",
    "info": "grey",
  };

  AFRAME.registerSystem("logger", {
    init() {
      this.loggers = [];
      this.isLogging = false;
    },

    remove() {
      this.releaseLogs();
      console.assert(this.loggers.length === 0);
    },

    captureLogs() {
      this.oldLog = console.log;
      this.oldError = console.error;
      this.oldWarn = console.warn;
      this.oldInfo = console.info;

      console.log = (...args) => {
        this.sendToLogger("log", sprintf(args));
        this.oldLog(...args);
      };
      console.error = (...args) => {
        this.sendToLogger("error", sprintf(args));
        this.oldError(...args);
      };
      console.warn = (...args) => {
        this.sendToLogger("warn", sprintf(args));
        this.oldWarn(...args);
      };
      console.info = (...args) => {
        this.sendToLogger("info", sprintf(args));
        this.oldInfo(...args);
      };
    },

    releaseLogs() {
      console.log = this.oldLog;
      console.error = this.oldError;
      console.warn = this.oldWarn;
      console.info = this.oldInfo;
    },

    sendToLogger(type, msg) {
      if (!this.isLogging) {
        this.isLogging = true;
        for (let cons of this.loggers) {
          cons.showMessage(type, msg);
        }
        this.isLogging = false;
      }
    },

    registerLogger(comp) {
      this.loggers.push(comp);
      if (this.loggers.length === 1) {
        this.captureLogs();
      }
    },

    unregisterLogger(comp) {
      this.loggers.splice( this.loggers.indexOf(comp), 1 );
      if (this.loggers.length === 0) {
        this.releaseLogs();
      }
    },
  });

  AFRAME.registerComponent("logger", {
    schema: {
      maxLines: { default: 20 },
      offset: { type: "vec2", default: {x:2, y:2} },
      lineHeight: { default: 12 },
      columnWidth: { default: 80 },
      characterWidth: { default: 7.3 },
      types: { type: "array", default: ["log", "error", "warn"] },
      filter: { default: "" },
      font: { default: "1em monospace" },
    },

    init() {
      this.dirty = true;
      this.messages = [];
      this.onObject3DSet = this.onObject3DSet.bind(this);

      this.system.registerLogger(this);

      this.createTexture();

      this.el.addEventListener("object3dset", this.onObject3DSet);

      // let count = 0x20
      // let str = ""
      // setInterval(() => {
      //   str += String.fromCharCode(count++)
      //   console.info(str)
      //   console.log(str)
      // },100)
      // console.log("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz")
      // console.log("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;'[]/?#") // 81 characters
      // console.log("%.2f%.2i%s%o%.3d%c that","1","9","help","34","color:red","is","it") // 1.0009help[object]034 that is it
      // console.warn("a warning")
      // console.error("an error")
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);

      this.system.unregisterLogger(this);
    },

    update(oldData) {
      const data = this.data;
      if (oldData.filter !== data.filter) {
        this.filter = data.filter ? new RegExp(data.filter) : undefined;
      }
    },

    tick() {
      if (this.dirty && this.imageEl.isReady) {
        this.updateTexture();
      }
    },

    createTexture() {
      this.imageEl = document.createElement("img");
      this.imageEl.width = 512;
      this.imageEl.height = 512;
      this.imageEl.isReady = true;

      const texture = this.texture = new THREE.Texture(this.imageEl);

      // svg images take some time to process so it is important that we
      // perform each step when it is ready, otherwise we are caught in
      // an infinite loop displaying errors, which generates errors, 
      // which displays more errors
      this.imageEl.onload = () => {
        // console.info("loaded")
        texture.needsUpdate = true;
      };

      this.imageEl.onerror = () => {
        // console.info("error")
        texture.image.isReady = true;
      };

      texture.onUpdate = () => {
        // console.info("updated")
        texture.image.isReady = true;
      };

      this.showTexture();
    },

    updateTexture() {
      const imageEl = this.imageEl;
      const data = this.data;
      const w = data.columnWidth * data.characterWidth;
      const h = (data.maxLines + 1)*data.lineHeight;

      function sanitizeMessage(str) {
        str = str.replace(/[^\x20-\x7E\n\t]/g, ""); // ignore characters not in this set
        return str.replace(/[&<>'"]/g, (m) => m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === "'" ? "&apos;" : "&quot;") // XML character entity references
      }     

      function sanitizeXML(str) {
        return str.replace(/%/g, "%25").replace(/#/g, "%23")
      }
            
      const svgText = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" version="1.1">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#111"/>
      <style> text { font: ${data.font}; }></style>
      ${
        this.messages.map((message, row) => {
          const y = data.offset.y + data.lineHeight*(row + 1);
          const x = data.offset.x;
          const msg = sanitizeMessage(message[1]);
          return `<text x="${x}" y="${y}" fill="${LOGGER_COLORS[message[0]]}">${msg}</text>`
        }).join("\n")
      }
    </svg>`;

      const newSVG = "data:image/svg+xml;utf8," + sanitizeXML(svgText);
      imageEl.src = newSVG;
      imageEl.isReady = false;
      // console.info("generated", newSVG)
      this.dirty = false;
    },

    showTexture() {
      const mesh = this.el.getObject3D("mesh");
      if (mesh && mesh.material) {
        mesh.material.map = this.texture;
      }
    },

    showMessage(type, msg) {
      const data = this.data;

      if (!data.types.includes(type)) {
        return
      }

      if (this.filter && !this.filter.test(msg)) {
        return
      }

      const lines = msg.split("\n");

      for (let line of lines) {
        for (let i = 0, n = line.length; i < n; i += data.columnWidth) {
          this.messages.push([type, line.slice(i, Math.min(n, i + data.columnWidth))]);
        }
      }

      while (this.messages.length >= this.data.maxLines) {
        this.messages.shift();
      }

      this.dirty = true;
    },

    onObject3DSet(e) {
      this.showTexture();
    },
  });

  AFRAME.registerPrimitive("a-logger", {
    defaultComponents: {
      geometry: {primitive: "plane", height: 3, width: 3},
      material: {color: "white", shader: "flat", side: "double"}, // must be white for colors to show correctly
      logger: {},
    },

    mappings: {
      types: "logger.types",
      filter: "logger.filter",
    }
  });

  function sprintf(args) {
    if (args.length === 0) {
      return ""
    }

    let i = 1;
    let str = args[0].toString().replace(/%(\.(\d+))?([cdfios])/g, (m, p1, p2, p3) => {
      let temp;
      switch (p3) {
        case "c": i++; return "" // not supported
        case "d": 
        case "i": temp = parseInt(args[i++], 10); return p2 ? temp.toString().padStart(p2, '0') : temp
        case "f": temp = parseFloat(args[i++]); return p2 ? temp.toFixed(p2) : temp
        case "o": return "[object]"
        case "s": return args[i++]
      }
    });
    return str + (i < args.length ? " " + args.slice(i).join(" ") : "")
  }

  function toLowerCase$1(x) { return x.toLowerCase() }

  AFRAME.registerComponent("manipulate", {
    schema: {
      hands: { type: "selectorAll" },
      oneHanded: { default: "grab" },
      twoHanded: { default: "grab, uniformscale", parse: toLowerCase$1 },
      pivot: { type: "vec3", default: { x:0, y:0, z:0 } },
      startEvent: { default: "triggerdown", parse: toLowerCase$1 },
      endEvent: { default: "triggerup", parse: toLowerCase$1 },
      enabled: { default: true },
      debug: { default: false },
    },

    init() {
      this.onStartEvent = this.onStartEvent.bind(this);
      this.onEndEvent = this.onEndEvent.bind(this);

      this.isEnabled = false;

      this.sides = [];
      this.activeSides = [];
      this.capture = { 
        object3D: undefined,
        startPosition: new THREE.Vector3(), 
        startQuaternion: new THREE.Quaternion(),
        startScale: new THREE.Vector3(),
        handGap: new THREE.Vector3(),
        startGap: new THREE.Vector3(),
        invPivotMatrix: new THREE.Matrix4(),
        startWorldPosition: new THREE.Vector3(),
        pivotPos: new THREE.Vector3(),
        pivotQuat: new THREE.Quaternion(),
      };
    },

    update(oldData) {
      const data = this.data;

      if (data.hands !== oldData.hands) {
        this.sides.length = 0;
        if (data.hands) {
          for (let i = 0; i < data.hands.length; i++) {
            this.sides.push( { handEl: data.hands[i], grabPosition: new THREE.Vector3() } );
          }
        }
      }

      this.oneHanded = this.parseConstraints(data.oneHanded);
      this.twoHanded = this.parseConstraints(data.twoHanded);

      if (oldData.enabled !== data.enabled) {
        if (data.enabled) {
          this.enable();
        } else {
          this.disable();
        }
      }
    },

    play() {
      if (this.data.enabled) {
        this.enable();
      }
    },

    pause() {
      this.disable();
    },

    tick() {
      if (this.activeSides.length === 1) {
        this.tickOneHanded(this.activeSides[0]);
      } else if (this.activeSides.length === 2) {
        this.tickTwoHanded(this.activeSides);
      }
    },

    enable() {
      if (!this.isEnabled) {
        for (let side of this.sides) {
          this.addListeners(side.handEl);
        }
        this.isEnabled = true;
      }
    },

    disable() {
      if (this.isEnabled) {
        this.activeSides.length = 0;
        for (let side of this.sides) {
          this.removeListeners(side.handEl);
        }
        this.isEnabled = false;
      }
    },

    onStartEvent(e) {
      if (this.data.debug) {
        console.log( getComponentDebugName(this), "onStartEvent", e.type, getDebugName(e.target) );
      }

      for (let side of this.sides) {
        if (e.target === side.handEl) {
          this.activateSide(side);
        }
      }
    },

    onEndEvent(e) {
      if (this.data.debug) {
        console.log( getComponentDebugName(this), "onEndEvent", e.type, getDebugName(e.target) );
      }

      for (let side of this.sides) {
        if (e.target === side.handEl) {
          this.deactivateSide(side);
        }
      }
    },

    addListeners(handEl) {
      if (handEl && ( this.data.startEvent || this.data.endEvent ) ) {
        if (this.data.debug) {
          console.log( getComponentDebugName(this), "addListeners", this.data.startEvent, this.data.endEvent, getDebugName(handEl) );
        }
        handEl.addEventListener(this.data.startEvent, this.onStartEvent);
        handEl.addEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    removeListeners(handEl) {
      if (handEl && ( this.data.startEvent || this.data.endEvent ) ) {
        if (this.data.debug) {
          console.log( getComponentDebugName(this), "removeListeners", this.data.startEvent, this.data.endEvent, getDebugName(handEl) );
        }
        handEl.removeEventListener(this.data.startEvent, this.onStartEvent);
        handEl.removeEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    activateSide(side) {
      const i = this.activeSides.indexOf(side);
      if (i === -1) {
        this.activeSides.push(side);
        this.captureStartPositions();
      }
    },

    deactivateSide(side) {
      const i = this.activeSides.indexOf(side);
      if (i !== -1) {
        this.activeSides.splice(i, 1);
        this.captureStartPositions();
      }
    },

    captureStartPositions: (function() {
      const invHandMatrix = new THREE.Matrix4();
      const UNIFORM_SCALE = new THREE.Vector3(1,1,1);

      return function captureStartPositions() {
        const data = this.data;
        const target3D = data.target ? data.target.object3D : this.el.object3D;
        this.capture.object3D = target3D;

        if (target3D) {

          for (let side of this.activeSides) {
            side.handEl.object3D.getWorldPosition( side.grabPosition );
          }

          target3D.updateMatrixWorld();
          this.capture.startWorldPosition.copy( data.pivot ).applyMatrix4( target3D.matrixWorld );

          this.capture.startPosition.copy(target3D.position);
          this.capture.startQuaternion.copy(target3D.quaternion);
          this.capture.startScale.copy(target3D.scale);

          const numActiveSides = this.activeSides.length;

          if (numActiveSides >= 2) {
            const left3D = this.activeSides[0].handEl.object3D;
            const right3D = this.activeSides[1].handEl.object3D;
            this.capture.handGap.copy(right3D.position).sub(left3D.position);
            this.calcMatrixFromHands(this.capture.pivotPos, this.capture.pivotQuat, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion);
            invHandMatrix.compose( this.capture.pivotPos, this.capture.pivotQuat, UNIFORM_SCALE );
            invHandMatrix.getInverse( invHandMatrix );
            this.capture.startGap.copy(right3D.position).applyMatrix4(invHandMatrix).normalize();
            this.capture.invPivotMatrix.copy(invHandMatrix).multiply(target3D.matrix);

          } else if (numActiveSides === 1) {
            const hand3D = this.activeSides[0].handEl.object3D;
            // hand3D.updateMatrixWorld() 
            this.capture.invPivotMatrix.getInverse(hand3D.matrixWorld).multiply(target3D.matrixWorld);
          }
        } else {
          warn(`unable to find Object3D for '${data.target}'`);
        }
      }
    
    })(),

    tickOneHanded: (function() {
      const newTranslate = new THREE.Vector3();
      const startGap = new THREE.Vector3();
      const newGap = new THREE.Vector3();
      const newScale = new THREE.Vector3(1,1,1);
      const newQuaternion = new THREE.Quaternion();
      const invParentMatrix = new THREE.Matrix4();
      const newMatrix = new THREE.Matrix4();

      return function oneHanded(side) {
        const target3D = this.capture.object3D;
        if (target3D) {
          const hand3D = side.handEl.object3D;
          hand3D.updateMatrixWorld();
          target3D.parent.updateMatrixWorld(true);

          startGap.copy(side.grabPosition).sub(this.capture.startWorldPosition);
          hand3D.getWorldPosition(newGap).sub(this.capture.startWorldPosition);

          if (this.oneHanded.uniformScale) {
            const scale = newGap.length()/startGap.length();
            newScale.set(scale, scale, scale);
            target3D.scale.copy( newScale.multiply(this.capture.startScale) );
          }
          
          if (this.oneHanded.scale) {
            newScale.copy(newGap).divide(startGap);
            this.applyMask(newScale, this.oneHanded.scale, 1);
            target3D.scale.copy( newScale.multiply(this.capture.startScale) );
          }

          if (this.oneHanded.translate) {
            hand3D.getWorldPosition(newTranslate).sub(side.grabPosition);
            this.applyMask(newTranslate, this.oneHanded.translate, 0);
            target3D.position.copy( newTranslate.add(this.capture.startPosition) );
          }

          if (this.oneHanded.rotate) {
            this.applyMask(startGap, this.oneHanded.rotate, 0);
            this.applyMask(newGap, this.oneHanded.rotate, 0);
            newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize());
            target3D.quaternion.copy( newQuaternion.multiply(this.capture.startQuaternion) );
          }

          if (this.oneHanded.grab) {
            invParentMatrix.getInverse(target3D.parent.matrixWorld);
            newMatrix.multiplyMatrices(hand3D.matrixWorld, this.capture.invPivotMatrix); // determine new hover3D world matrix
            newMatrix.premultiply(invParentMatrix); // convert to a local matrix
            newMatrix.decompose(target3D.position, target3D.quaternion, target3D.scale);
          }
        }
      }
    })(),

    tickTwoHanded: (function() {
      const firstPosition = new THREE.Vector3();
      const secondPosition = new THREE.Vector3();
      const newGap = new THREE.Vector3();
      const startGap = new THREE.Vector3();
      const newRotationGap = new THREE.Vector3();
      const pivotPosition = new THREE.Vector3();
      const newScale = new THREE.Vector3(1,1,1);
      const newTranslate = new THREE.Vector3();
      const newQuaternion = new THREE.Quaternion();
      const newMatrix = new THREE.Matrix4();
      const pivotQuaternion = new THREE.Quaternion();
      const invNewMatrix = new THREE.Matrix4();
      const UNIFORM_SCALE = new THREE.Vector3(1,1,1);

      return function twoHanded() {
        const target3D = this.capture.object3D;
        if (target3D) {
          const left3D = this.activeSides[0].handEl.object3D;
          const right3D = this.activeSides[1].handEl.object3D;
          firstPosition.copy(left3D.position);
          secondPosition.copy(right3D.position);
          newGap.copy(secondPosition).sub(firstPosition);

          this.calcMatrixFromHands(pivotPosition, pivotQuaternion, left3D.position, left3D.quaternion, right3D.position, right3D.quaternion);
          newMatrix.compose(pivotPosition, pivotQuaternion, UNIFORM_SCALE);

          if (this.twoHanded.uniformScale) {
            const scale = newGap.length() / this.capture.handGap.length();
            newScale.set(scale, scale, scale);
            target3D.scale.copy( newScale.multiply(this.capture.startScale) );
          }
          
          if (this.twoHanded.scale) {
            newScale.copy(newGap).divide(this.capture.handGap);
            this.applyMask(newScale, this.twoHanded.scale, 1);
            target3D.scale.copy( newScale.multiply(this.capture.startScale) );
          }

          if (this.twoHanded.translate) {
            newTranslate.copy(pivotPosition).sub(this.capture.pivotPos);
            this.applyMask(newTranslate, this.twoHanded.translate, 0);
            target3D.position.copy( newTranslate.add(this.capture.startPosition) );
          }

          if (this.twoHanded.rotate) {
            startGap.copy(this.capture.handGap);
            this.applyMask(startGap, this.twoHanded.rotate, 0);
            this.applyMask(newGap, this.twoHanded.rotate, 0);
            newQuaternion.setFromUnitVectors(startGap.normalize(), newGap.normalize());
            target3D.quaternion.copy( newQuaternion.multiply(this.capture.startQuaternion) );
          }

          if (this.twoHanded.grab) {  
            invNewMatrix.getInverse(newMatrix);
            newRotationGap.copy(secondPosition).applyMatrix4(invNewMatrix).normalize();
            newQuaternion.setFromUnitVectors(this.capture.startGap, newRotationGap);
            pivotQuaternion.multiply( newQuaternion );
            newMatrix.compose(pivotPosition, pivotQuaternion, UNIFORM_SCALE);
            
            newMatrix.multiply( this.capture.invPivotMatrix );
            newMatrix.decompose(pivotPosition, pivotQuaternion, newScale);
    
            target3D.position.copy(pivotPosition);
            target3D.quaternion.copy(pivotQuaternion);
          }
        }
      }
    })(),

    calcMatrixFromHands(outPos, outQuat, handAPos, handAQuat, handBPos, handBQuat) {
      outPos.copy(handAPos).add(handBPos).multiplyScalar(0.5);
      outQuat.copy(handAQuat).slerp(handBQuat, .5);
    },

    parseConstraints(str) {
      let constraint = {};
      let list = str.split(",").map( x => x.trim() );
      for (let item of list) {
        switch (item) {
          case "translate": constraint.translate = {x:true, y:true, z:true}; break
          case "translate-x": constraint.translate = {...constraint.translate, x:true}; break // keep the axis we want to move along
          case "translate-y": constraint.translate = {...constraint.translate, y:true}; break
          case "translate-z": constraint.translate = {...constraint.translate, z:true}; break
          case "rotate": constraint.rotate = {x:true, y:true, z:true}; break
          case "rotate-x": constraint.rotate = {x:false, y:true, z:true}; break // drop the axis we want to rotate about
          case "rotate-y": constraint.rotate = {x:true, y:false, z:true}; break
          case "rotate-z": constraint.rotate = {x:true, y:true, z:false}; break
          case "scale": constraint.scale = {x:true, y:true, z:true}; break
          case "scale-x": constraint.scale = {...constraint.scale, x:true}; break
          case "scale-y": constraint.scale = {...constraint.scale, y:true}; break
          case "scale-z": constraint.scale = {...constraint.scale, z:true}; break
          case "uniformscale": constraint.uniformScale = true; break
          case "grab": constraint.grab = true; break
          case "": break
          case "none": break
          default: warn(this, `unknown constraint: ${item}`);
        }
      }

      return constraint
    },

    applyMask(vector, mask, unmaskedValue) {
      for (let axis of ["x","y","z"]) {
        vector[axis] = mask[axis] ? vector[axis] : unmaskedValue;
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
      vertexColors: {type: 'string', default: 'none', oneOf: ['none', 'face', 'vertex']},
      visible: {default: true},
      blending: {default: 'normal', oneOf: ['none', 'normal', 'additive', 'subtractive', 'multiply']}
    },

    multiple: true,

    init: function () {
      this.system = this.el.sceneEl.systems['material'];
      this.material = null;
      this.oldMaterials = [];

      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.el.addEventListener("object3dset", this.onObject3DSet);
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
      if (typeof data === "string") {
        error(`invalid properties, expected format <property>:<value>; '${data}'`);
      }
      
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
      this.el.removeEventListener("object3dset", this.onObject3DSet);

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
      // var mesh;
      var system = this.system;

      if (this.material) { disposeMaterial(this.material, system); }

      this.material = material;
      system.registerMaterial(material);

      replaceMaterial(el, this.data.remap, [material], this.oldMaterials);

      // // Set on mesh. If mesh does not exist, wait for it.
      // mesh = el.getObject3D('mesh');
      // if (mesh) {
      //   mesh.material = material;
      // } else {
      //   el.addEventListener('object3dset', function waitForMesh (evt) {
      //     if (evt.detail.type !== 'mesh' || evt.target !== el) { return; }
      //     el.getObject3D('mesh').material = material;
      //     el.removeEventListener('object3dset', waitForMesh);
      //   });
      // }
    },

    onObject3DSet(e) {
      if (e.detail.type === 'mesh' && e.target === this.el) {
        replaceMaterial(this.el, this.data.remap, [this.material], this.oldMaterials);
      }
    },
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

  // remix of https://github.com/supermedium/superframe/tree/master/components/geometry-merger
  AFRAME.registerComponent("merge-geometry", {
  	dependencies: ['material'],

  	schema: {
  		keepColor: {default: true},
  		keepOriginal: {default: false},
  	},

  	init() {
  		this.mergeGeometry();

  		// TODO re-merge if there is a setobject3d on any of the children
  	},

  	mergeGeometry() {
  		const self = this;
  		const geometry = new THREE.Geometry();
  		const invSelfMatrixWorld = new THREE.Matrix4();
  		const object3D = this.el.object3D;

  		object3D.updateMatrixWorld(true);
  		invSelfMatrixWorld.getInverse(object3D.matrixWorld);

  		object3D.traverse(function (mesh) {
  			if (mesh.type !== "Mesh") { return; }

  			const meshGeometry = mesh.geometry.isBufferGeometry ? new THREE.Geometry().fromBufferGeometry(mesh.geometry) : mesh.geometry;

  			if (self.data.keepColor) {
  				const materialColor = Array.isArray(mesh.material) ? mesh.material[0].color : mesh.material.color;
  				meshGeometry.faces.forEach(face => {
  					if (face.vertexColors.length === 3) {
  						face.vertexColors[0].multiply(materialColor);
  						face.vertexColors[1].multiply(materialColor);
  						face.vertexColors[2].multiply(materialColor);
  					} else {
  						face.color.multiply(materialColor);
  					}
  				});
  			}

  			// Use the world matrices as we want to capture all transforms from this.el down
  			const matrixRelative = mesh.matrixWorld.clone().premultiply(invSelfMatrixWorld);
  			geometry.merge(meshGeometry, matrixRelative);

  			// Remove mesh if not preserving.
  			if (!self.data.keepOriginal) { 
  				mesh.parent.remove(mesh);
  			}
  		});

  		const mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry));
  		this.el.setObject3D("mesh", mesh);

  		// the setObject3D will trigger the material component to setup the material, so
  		// we can force it to show vertex colors
  		if (self.data.keepColor) {
  			const material = this.el.getObject3D("mesh").material;
  			material.vertexColors = THREE.VertexColors;
  		}
  	}
  });

  const toLowerCase$2 = x => x.toLowerCase();

  const TWO_PI = 2*Math.PI;
  const PI_2$1 = .5*Math.PI;
  const VECTOR3_UP = new THREE.Vector3(0,1,0);
  const degToRad$1 = THREE.Math.degToRad;

  function vec3DegToRad(vec3) {
    return { x: degToRad$1(vec3.x), y: degToRad$1(vec3.y), z: degToRad$1(vec3.z) }
  }

  function getMaxRangeOptions(rule) {
    return rule.options ? Math.max(...rule.options) : Math.max(...rule.range)
  } 

  function validateFloat(number) {
    return typeof number === "number"
  }

  function validateVec3$1(vec3) {
    return typeof vec3 === "object" && "x" in vec3 && "y" in vec3 && "z" in vec3
  }

  function validateColor$1(color) {
    return typeof color === "object" && "r" in color && "g" in color && "b" in color
  }

  function validateRangeOption(part, validateItemFn) {
    if (part.range) { return part.range.every(validateItemFn) }
    if (part.options) { return part.options.every(validateItemFn) }
    return false
  }

  function parseVec3RangeOptionArray(str) {
    if (!str) return undefined

    const result = nestedSplit(str).flatMap( str => parse$1(str) );
    if (!result.every(part => validateRangeOption(part, validateVec3$1))) {
      warn(`unrecognized array of vec3 range options '${str}'`);
      return undefined
    }
    return result
  }

  function parseFloatRangeOptionArray(str) {
    if (!str) return undefined

    const result = nestedSplit(str).flatMap( str => parse$1(str) );
    if (!result.every(part => validateRangeOption(part, validateFloat))) {
      warn(`unrecognized array of float range options '${str}'`);
      return undefined
    }
    return result
  }

  function vec3OrFloatToVec3(vec3) {
    return typeof vec3 === "number" ? {x:vec3, y:vec3, z:vec3} : vec3
  }

  function parseScaleArray(str) {
    if (!str) return undefined

    const result = nestedSplit(str).flatMap( str => parse$1(str) );
    if (!result.every(part => validateRangeOption(part, validateVec3$1) || validateRangeOption(part, validateFloat))) {
      warn(`unrecognized array of float or vec3 range options '${str}'`);
      return undefined
    }
    
    return result.map(rangeOption => {
      if (rangeOption.range) return { range: rangeOption.range.map(vec3OrFloatToVec3) }
      if (rangeOption.options) return { options: rangeOption.options.map(vec3OrFloatToVec3) }
    })
  }

  function parseColorRangeOptionArray(str) {
    if (!str) return undefined

    const result = nestedSplit(str.toLowerCase()).flatMap( str => parse$1(str) );
    if (!result.every(part => validateRangeOption(part, validateColor$1))) {
      warn(`unrecognized array of color range options '${str}'`);
      return undefined
    }
    return result
  }

  // ideally these parsers would be in the parse property of the schema, but doing it 
  // that way generates a lot of [object Object]s in the Inspector
  const CUSTOM_PARSER = {
    position: parseVec3RangeOptionArray,
    velocity: parseVec3RangeOptionArray,
    acceleration: parseVec3RangeOptionArray,
    radialPosition: parseFloatRangeOptionArray,
    radialVelocity: parseFloatRangeOptionArray,
    radialAcceleration: parseFloatRangeOptionArray,
    angularVelocity: parseVec3RangeOptionArray,
    angularAcceleration: parseVec3RangeOptionArray,
    orbitalVelocity: parseFloatRangeOptionArray,
    orbitalAcceleration: parseFloatRangeOptionArray,
    scale: parseScaleArray,
    color: parseColorRangeOptionArray,
    rotation: parseVec3RangeOptionArray,
    opacity: parseFloatRangeOptionArray,
  };


  AFRAME.registerComponent("mesh-particles", {
    schema: {
      events: { default: "" },
      delay: { default: 0 },
      enabled: { default: true },
      duration: { default: -1 },
      instancePools: { default: "" },
      spawnRate: { default: "1" },
      lifeTime: { default: "1" },
      position: { default: "" },
      velocity: { default: "" },
      acceleration: { default: "" },
      radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circleyz", "circlexz"], parse: toLowerCase$2 },
      radialPosition: { default: "" },
      radialVelocity: { default: "" },
      radialAcceleration: { default: "" },
      angularVelocity: { default: "" },
      angularAcceleration: { default: "" },
      orbitalVelocity: { default: "" },
      orbitalAcceleration: { default: "" },
      scale: { default: "" },
      color: { default: "" },
      rotation: { default: "" },
      opacity: { default: "" },
      source: { type: "string" },
      destination: { type: "string" },
      destinationOffset: { type: "vec3" },
      destinationWeight: { type: "number" },
      seed: { type: "int", default: -1 }
    },

    multiple: true,

    init() {
      this.startParticles = this.startParticles.bind(this);
      this.onEvent = this.onEvent.bind(this);

      this.isStarted = false;
      this.hasListeners = false;
      this.spawnID = 0;
      this.spawnCount = 0;
      this.instancePools = [];
      this.instanceIndices = [];
      this.particles = [];
      this.customData = {};
      this.lcg = lcg();

      this.delayClock = basicClock();
      this.eventListener = scopedEvents( this.el, this.onEvent );
    },

    remove() {
      this.releaseInstances();
      this.eventListener.remove();
      this.delayClock.clearAllTimers();

      this.source = undefined;
      this.destination = undefined;
    },

    play() {
      this.eventListener.add();
      this.delayClock.resume();
    },

    pause() {
      this.eventListener.remove();
      this.delayClock.pause();
    },

    update(oldData) {
      const data = this.data;
      this.lcg.setSeed(data.seed);

      this.duration = data.duration;

      for (let prop in data) {
        if (oldData[prop] !== data[prop] && prop in CUSTOM_PARSER) {
          this.customData[prop] = CUSTOM_PARSER[prop](data[prop]);
        }
      }

      if (data.lifeTime !== oldData.lifeTime) {
        this.lifeTimeRule = parse$1(data.lifeTime);
        this.maxLifeTime = getMaxRangeOptions(this.lifeTimeRule);
        this.particles = [];
      }

      if (data.source !== oldData.source) {
        this.source = this.el.object3D;
        if (data.source) {
          const sourceEl = document.querySelector(data.source);
          if (sourceEl && sourceEl.object3D) { 
            this.source = sourceEl.object3D;
          } else {
            warn(`unable to find object3D on source '${data.source}'`); 
          }
        }
      }

      if (data.destination !== oldData.destination) {
        this.destination = undefined;
        if (data.destination) {
          const destinationEl = document.querySelector(data.destination);
          if (destinationEl && destinationEl.object3D) { 
            this.destination = destinationEl.object3D;
          } else {
            warn(`unable to find object3D on destination '${data.destination}'`); 
          }
        }
      }

      if (data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime) {
        this.spawnRateRule = parse$1(data.spawnRate);
        this.maxParticles = getMaxRangeOptions(this.spawnRateRule)*this.maxLifeTime;
        this.spawnRate = randomize(this.spawnRateRule, this.lcg.random); // How do we keep this in-sync?
      }

      if (data.instancePools !== oldData.instancePools || data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime) {
        this.spawnID = 0;
        this.releaseInstances();

        this.instancePools = data.instancePools ? 
          [].slice.call(document.querySelectorAll(data.instancePools)).map(el => el.components ? el.components["instance-pool"] : undefined).filter(x => x) :
          this.el.components["instance-pool"] ? [this.el.components["instance-pool"]] : [];

        if (this.instancePools.length === 0) {
          if (data.instancePools) {
            warn(`no 'instance-pool' on the entities: '${data.instancePools}'`);
          } else {
            warn(`no 'instance-pool' component on this element`);
          }
        } else {
          this.instanceIndices = this.instancePools.map( instance => instance.reserveBlock(Math.ceil( this.maxParticles / this.instancePools.length)) );
          this.instanceIndices.forEach((index,i) => { 
            if (index === undefined) {
              warn(`unable to reserve blocks for instance '${this.instancePools[i].el.id}'`); 
            }
          });
        }
      }

      if (data.events !== oldData.events) {
        this.eventListener.set(data.events);

        if (!data.events) {
          this.startTime = data.delay;
          this.startParticles();
        }
      }
    },

    tick(time, deltaTime) {
      const t = time*0.001;
      const dt = Math.min(0.1, deltaTime*0.001); // cap the dt to help when we are debugging
      const isActive = (this.duration < 0 || t - this.startTime < this.duration);

      if (this.isStarted && isActive && this.instancePools.length > 0 && this.data.enabled) {
        this.spawnCount += this.spawnRate*dt;

        if (this.spawnCount > 1) {
          this.spawnRate = randomize(this.spawnRateRule, this.lcg.random); // How do we keep this in-sync?
        }

        while (this.spawnCount > 1) {
          this.spawn();
          this.spawnCount--;
        }

      } else if (this.isStarted && !isActive) {
        this.stopParticles();
      }

      this.move(dt);
    },

    onEvent(e) {
      this.delayClock.startTimer( this.delay, this.startParticles );
    },

    startParticles() {
      this.isStarted = true;
      this.startTime = this.el.sceneEl.clock.elapsedTime;
    },

    stopParticles() {
      this.isStarted = false;
    },

    releaseInstances() {
      this.instancePools.forEach((instance, i) => instance.releaseBlock(this.instanceIndices[i]));
      this.instanceIndices.length = 0;
      this.particles = [];
      this.spawnID = 0;
      this.spawnCount = 0;
    },

    configureRandomizer(id) {
      // TODO this may not be random enough, try a second type of randomizer
      if (this.data.seed > 0) {
        this.lcg.setSeed(id + 1);
        this.lcg.setSeed(this.data.seed + this.lcg.random()*12783891);
      }
    },

    instanceFromID(spawnID) {
      const particleID = (spawnID % this.maxParticles);
      const instanceIndex = spawnID % this.instancePools.length;
      const instance = this.instancePools[instanceIndex];
      if (this.instanceIndices[instanceIndex] === undefined) {
        return [undefined, undefined, undefined]
      }

      const instanceID = this.instanceIndices[instanceIndex] + Math.floor(particleID/this.instancePools.length);
      return [instance, instanceID, particleID]
    },

    spawn() {
      const data = this.data;
      const cData = this.customData;

      const random = this.lcg.random;

      this.configureRandomizer(this.spawnID);

      const newParticle = {};
      newParticle.age = 0;
      newParticle.col = new THREE.Color();
      newParticle.col.a = 1; // for opacity
      newParticle.pos = new THREE.Vector3(0,0,0);
      newParticle.vel = new THREE.Vector3(0,0,0);
      newParticle.acc = new THREE.Vector3(0,0,0);    
      newParticle.angularVel = new THREE.Vector3(0,0,0);
      newParticle.angularAcc = new THREE.Vector3(0,0,0);
      newParticle.orbitalVel = 0;
      newParticle.orbitalAcc = 0;

      if (this.source) {
        newParticle.sourcePosition = new THREE.Vector3();
        newParticle.sourceQuaternion = new THREE.Quaternion();
        newParticle.sourceScale = new THREE.Vector3();
        this.source.matrixWorld.decompose(newParticle.sourcePosition, newParticle.sourceQuaternion, newParticle.sourceScale);
      }

      newParticle.lifeTime = randomize(this.lifeTimeRule, random);

      // http://mathworld.wolfram.com/SpherePointPicking.html
      newParticle.radialPhi = (data.radialType !== "circlexz") ? 2*Math.acos( random()*2 - 1 ) : PI_2$1;
      newParticle.radialTheta = data.radialType === "circleyz" ? 0 : (data.radialType === "circle" || data.radialType === "circlexy") ? PI_2$1 : random()*TWO_PI;

      if (cData.position) { newParticle.positions = cData.position.map(part => randomize(part, random)); }
      if (cData.rotation) { newParticle.rotations = cData.rotation.map(part => vec3DegToRad( randomize(part, random) )); }
      if (cData.scale) { newParticle.scales = cData.scale.map(part => randomize(part, random)); }
      if (cData.color) { newParticle.colors = cData.color.map(part => randomize(part, random)); }
      if (cData.opacity) { newParticle.opacities = cData.opacity.map(part => randomize(part, random)); }
      if (cData.velocity) { newParticle.velocities = cData.velocity.map(part => randomize(part, random)); }
      if (cData.acceleration) { newParticle.accelerations = cData.acceleration.map(part => randomize(part, random)); }
      if (cData.radialPosition) { newParticle.radialPositions = cData.radialPosition.map(part => randomize(part, random)); }
      if (cData.radialVelocity) { newParticle.radialVelocities = cData.radialVelocity.map(part => randomize(part, random)); }
      if (cData.radialAcceleration) { newParticle.radialAccelerations = cData.radialAcceleration.map(part => randomize(part, random)); }
      if (cData.angularVelocity) { newParticle.angularVelocities = cData.angularVelocity.map(part => vec3DegToRad( randomize(part, random) )); }
      if (cData.angularAcceleration) { newParticle.angularAccelerations = cData.angularAcceleration.map(part => vec3DegToRad( randomize(part, random) )); }
      if (cData.orbitalVelocity) { newParticle.orbitalVelocities = cData.orbitalVelocity.map(part => degToRad$1( randomize(part, random) )); }
      if (cData.orbitalAcceleration) { newParticle.orbitalAccelerations = cData.orbitalAcceleration.map(part => degToRad$1( randomize(part, random) )); }

      newParticle.orbitalAxis = new THREE.Vector3();

      const particleID = (this.spawnID % this.maxParticles);
      this.particles[particleID] = newParticle;
      this.spawnID++;
    },

    move: (function() {
      const tempPosition = new THREE.Vector3(0,0,0);
      const tempEuler = new THREE.Euler(0,0,0,"YXZ");
      const tempQuaternion = new THREE.Quaternion(0,0,0,1);
      const tempScale = new THREE.Vector3(1,1,1);
      const tempColor = new THREE.Color(0,0,0);
      const tempVec3 = new THREE.Vector3(0,0,0);

      return function move(dt) {
        const data = this.data;

        for (let id = Math.max(0, this.spawnID - this.maxParticles); id < this.spawnID; id++) {
          const [instance, i, particleID] = this.instanceFromID(id);
          if (instance === undefined) {
            continue // no instance available
          }

          const particle = this.particles[particleID];
          const t = particle.age/particle.lifeTime;
          const isFirstFrame = t === 0;
          let hasMovement = false;
          let hasColor = false;


          if (t > 1) {
            instance.setScaleAt(i, {x:0,y:0,z:0});
            continue // particle has expired
          }
    
          const age = particle.age;  
          particle.age += dt;

          if (particle.positions && (isFirstFrame || particle.positions.length > 1)) {
            particle.pos.copy( this.lerpVector(particle.positions, t) );
          }
    
          if (particle.radialPositions && (isFirstFrame || particle.radialPositions.length > 1)) {
            particle.pos.setFromSphericalCoords( this.lerpFloat(particle.radialPositions, t), particle.radialPhi, particle.radialTheta );
          }
    
          if (particle.accelerations && (isFirstFrame || particle.accelerations.length > 1)) {
            particle.acc.copy( this.lerpVector(particle.accelerations, t) );
          }
    
          if (particle.radialAccelerations && (isFirstFrame || particle.radialAccelerations.length > 1)) {
            particle.acc.setFromSphericalCoords( this.lerpFloat(particle.radialAccelerations, t), particle.radialPhi, particle.radialTheta );
          }
    
          if (particle.velocities && (isFirstFrame || particle.velocities.length > 1)) {
            particle.vel.copy( this.lerpVector(particle.velocities, t) );
          }
    
          if (particle.radialVelocities && (isFirstFrame || particle.radialVelocities.length > 1)) {
            particle.vel.setFromSphericalCoords( this.lerpFloat(particle.radialVelocities, t), particle.radialPhi, particle.radialTheta );
          }
    
          if (particle.accelerations || particle.radialAccelerations || particle.velocities || particle.radialVelocities) {
            tempPosition.copy( particle.acc ).multiplyScalar( 0.5*age ).add( particle.vel ).multiplyScalar( age ).add( particle.pos );
            hasMovement = true;
          } else if (particle.positions|| particle.radialPositions) {
            tempPosition.copy( particle.pos );
          } else {
            tempPosition.set(0,0,0);
          }

          if (particle.orbitalAccelerations && (isFirstFrame || particle.orbitalAccelerations.length > 1)) {
            particle.orbitalAcc = this.lerpFloat(particle.orbitalAccelerations, t);
          }

          if (particle.orbitalVelocities && (isFirstFrame || particle.orbitalVelocities.length > 1)) {
            particle.orbitalVel = this.lerpFloat(particle.orbitalVelocities, t);
          }

          if (particle.orbitalAccelerations || particle.orbitalVelocities) {
            if (isFirstFrame) {
              particle.orbitalAxis.copy( tempVec3.copy(particle.pos).normalize().cross(VECTOR3_UP).normalize() );
            }
            const orbitalAngle = ( particle.orbitalVel + 0.5*age*particle.orbitalAcc )*age;
            tempQuaternion.setFromAxisAngle( particle.orbitalAxis, orbitalAngle );
            tempPosition.applyQuaternion( tempQuaternion );
            hasMovement = true;
          }

          if (particle.angularAccelerations && (isFirstFrame || particle.angularAccelerations.length > 1)) {
            particle.angularAcc.copy( this.lerpVector(particle.angularAccelerations, t) );
          }

          if (particle.angularVelocities && (isFirstFrame || particle.angularVelocities.length > 1)) {
            particle.angularVel.copy( this.lerpVector(particle.angularVelocities, t) );
          }

          if (particle.angularAccelerations || particle.angularVelocities) {
            tempVec3.copy( particle.angularAcc ).multiplyScalar( 0.5*age ).add( particle.angularVel ).multiplyScalar( age );
            tempEuler.set( tempVec3.x, tempVec3.y, tempVec3.z, "YXZ" );
            tempQuaternion.setFromEuler( tempEuler );
            tempPosition.applyQuaternion( tempQuaternion );
            hasMovement = true;
          }

          if (isFirstFrame || hasMovement || this.destination) {
            tempPosition.add( particle.sourcePosition );

            if (this.destination) {
              tempVec3.copy(data.destinationOffset).applyMatrix4(this.destination.matrixWorld);
              tempPosition.copy( lerpObject(tempPosition, tempVec3, data.destinationWeight*t) );
            }

            instance.setPositionAt(i, tempPosition.x, tempPosition.y, tempPosition.z);
          }

          if (particle.opacities && (isFirstFrame || particle.opacities.length > 1)) {
            particle.col.a = this.lerpFloat(particle.opacities, t);
            hasColor = true;
          }

          if (particle.colors && (isFirstFrame || particle.colors.length > 1)) {
            // colour is independent of the entity color
            tempColor.copy( this.lerpVector(particle.colors, t) );
            particle.col.setRGB(tempColor.r, tempColor.g, tempColor.b);
            hasColor = true;
          }

          if (isFirstFrame || hasColor) {
            instance.setColorAt(i, particle.col.r, particle.col.g, particle.col.b, particle.col.a);
          }

          if (particle.rotations && (isFirstFrame || particle.rotations.length > 1)) {
            if (particle.rotations.length > 0) {
              tempEuler.setFromVector3( this.lerpVector(particle.rotations, t) );
              tempQuaternion.setFromEuler(tempEuler);
              tempQuaternion.premultiply(particle.sourceQuaternion);
            } else {
              tempQuaternion.copy(particle.sourceQuaternion);
            }
            instance.setQuaternionAt(i, tempQuaternion.x, tempQuaternion.y, tempQuaternion.z, tempQuaternion.w);
          }
    
          if (particle.scales && (isFirstFrame || particle.scales.length > 1)) {
            tempScale.copy(particle.sourceScale);
            if (particle.scales.length > 0) {
              tempScale.multiply( tempVec3.copy( this.lerpVector(particle.scales, t) ) );
            }
            instance.setScaleAt(i, tempScale.x, tempScale.y, tempScale.z);
          }
    
          if (!particle.scales && isFirstFrame) {
            instance.setScaleAt(i, 1, 1, 1);
          }
        }
      }
    })(),

    lerpFloat(floats, t) {
      const [i,r] = lerpKeys(floats, t);
      return lerp(floats[i], floats[i+1], r)
    },

    lerpVector(numbers, t) {
      const [i,r] = lerpKeys(numbers, t);
      return lerpObject(numbers[i], numbers[i+1], r)
    },
  });

  const domModifier = modifierStack( (target, attribute) => getProperty(target, attribute), MODIFIER_NESTED );

  //-----------------------------------------------------------------------------
  // "modifier" component for setting attributes on this or other elements after 
  // a startEvent, and removing the setting after an endEvent
  // 
  AFRAME.registerComponent("modifier", {
    schema: {
      startEvents: { default: "" },
      endEvents: { default: "" },
      source: { default: "" },
      sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
      target: { default: "" },
      targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
      // toggles: { default: "" },
      seed: { type: "int", default: -1 },
      debug: { default: false },
    },
    multiple: true,

    init() {
      this.onStartEvent = this.onStartEvent.bind(this);
      this.onEndEvent = this.onEndEvent.bind(this);
      this.setProperties = this.setProperties.bind(this);

      this.rules = {};
      // this.toggles = []

      this.startEventListener = scopedEvents( this.el, this.onStartEvent );
      this.endEventListener = scopedEvents( this.el, this.onEndEvent );
      this.lcg = lcg();
    },

    remove() {
      this.startEventListener.remove();
      this.endEventListener.remove();
    },

    updateSchema(newData) {
      if (typeof newData !== "object") {
        error(this, `invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
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
          this.rules[prop] = parse$1(data[prop]); // property new or changed
        }
      }

      if (data.startEvents !== oldData.startEvents || data.endEvents !== oldData.endEvents || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.startEventListener.set( data.startEvents, data.source, data.sourceScope );
        this.endEventListener.set( data.endEvents, data.source, data.sourceScope );
      }

      // if (data.toggles !== oldData.toggles) {
      //   this.toggles = data.toggles.split(",").map(x => x.trim()).filter(x => x)
      // }
    },

    pause() {
      this.startEventListener.remove();
      this.endEventListener.remove();
    },

    play() {
      this.startEventListener.add();
      this.endEventListener.add();
    },

    setProperties(event) {
      const target = substitute$( this.data.target, this.el, event );
      const elements = getElementsInScope(this.el, target, this.data.targetScope, event ? event.target : undefined);

      if (this.data.debug) {
        console.log( getDebugName( this.el ), this.attrName, "setProperties", "target=", target );
      }

      for (let el of elements) {
        for (let prop in this.rules) {
          let rule = this.rules[prop];

          const value = stringify( randomize(rule, this.lcg.random) );
          const processedValue = substitute$( value, this.el, event );
          if (this.data.debug) {
            console.log( getDebugName( this.el ), this.attrName, "setProperties", "element=", getDebugName(el), "property=", prop, "value=", value, "$event=", event);
          }

          const finalValue = domModifier.set(this, el, prop, processedValue);
          setProperty(el, prop, finalValue);
        }

        // for (let prop of this.toggles) {
        //   const toggleValue = !aframeHelper.getProperty(el, prop)
        //   aframeHelper.setProperty(el, prop, toggleValue)
        // }
      }
    },

    clearProperties(event) {
      const target = substitute$( this.data.target, this.el, event );
      const elements = getElementsInScope(this.el, target, this.data.targetScope, event ? event.target : undefined);

      if (this.data.debug) {
        console.log( getDebugName( this.el ), this.attrName, "clearProperties", "target=", target );
      }

      for (let el of elements) {
        for (let prop in this.rules) {
          const finalValue = domModifier.unset(this, el, prop);
          setProperty(el, prop, finalValue);
        }
      }
    },

    // there may be several events "pending" at the same time, so use a separate timer for each event
    onStartEvent(event) {
      if (this.data.debug) {
        console.log( getDebugName(this.el), this.attrName, "onStartEvent", event.type, event );
      }
      this.setProperties(event);
    },

    onEndEvent(event) {
      if (this.data.debug) {
        console.log( getDebugName(this.el), this.attrName, "onEndEvent", event.type, event );
      }
      this.clearProperties(event);
    }

  });

  function substitute$( str, el, event ) {
    return str.replace(/\$([\.\w]+)/g, (_, p1) => processValue( p1, el, event ) )
  }

  function processValue( value, el, event ) {
    let result = value;

    if ( value.indexOf( "event" ) === 0 ) {
      if ( !event ) {
        console.log( `value of $event but no event received` );
      } else {
        result = stringify( getWithPath( event, value.slice( 6 ).split( "." ) ) ); // event. => 6 characters
      }
    } else {
      result = stringify( getProperty( el, value.slice( 1 ) ) );
    }

    return result
  }

  AFRAME.registerComponent("outline", {
    schema: {
      color: { type: "color", default: "purple" },
      width: { default: 0.01 },
      meshName: { default: "mesh" },
      style: { oneOf: ["screenspace", "3dspace"], default: "3dspace", parse: (str) => str.toLowerCase() },
      enabled: { default: true },
    },

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.el.addEventListener("object3dset", this.onObject3DSet);

      this.color = new THREE.Color();
      this.material = this.createMaterial();

      const obj3D = this.el.getObject3D(this.data.meshName);
      this.outline = this.createOutline(obj3D, this.material);
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);
    },

    update(oldData) {
      const data = this.data;

      if (data.color !== oldData.color) {
        this.color.set(data.color);
        this.material.uniforms['color'].value.set( this.color.r, this.color.g, this.color.b );
      }

      if (data.style !== oldData.style) {
        switch (data.style) {
          case "screenspace": this.material.defines = { USE_SCREEN_SPACE: true }; break
          default: this.material.defines = { USE_THREED_SPACE: true }; break
        }
      }

      this.material.uniforms['width'].value = data.style === 'screenspace' ? data.width : data.width*10;

      if (this.outline) {
        this.outline.visible = this.data.enabled;
      }
    },

    createMaterial() {
      return new THREE.ShaderMaterial( {
        uniforms: {
          color: { value: new THREE.Vector3() },
          width: { value: .1 },
        },
        depthWrite: true,
        transparent: false,
        side: THREE.BackSide,

        vertexShader: `
uniform float width;
void main() {

  float outlineWidth = width;

  vec3 modelScale = vec3( 
    length( modelMatrix[0].xyz ), 
    length( modelMatrix[1].xyz ), 
    length( modelMatrix[2].xyz )
  );

#if defined(USE_SCREEN_SPACE)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  
  outlineWidth *= gl_Position.w;
#endif // defined(USE_THREED_SPACE)

  vec3 widthScale = outlineWidth / modelScale;

  mat4 scaleMatrix = mat4(1.);
  scaleMatrix[0][0] = widthScale.x;
  scaleMatrix[1][1] = widthScale.y;
  scaleMatrix[2][2] = widthScale.z;

  vec4 widthOffset = scaleMatrix * vec4( normalize( position ), 1. );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position + widthOffset.xyz, 1.0 );
}`,

        fragmentShader: `
uniform vec3 color;
void main() {
  gl_FragColor = vec4( color, 1. );
}`,

      } )
    },

    createOutline(obj, material) {
      if (obj) {
        
        obj.updateMatrixWorld(true);
        const outlineObj3D = this.createHullOutline(obj, material);

        if (outlineObj3D) {
          outlineObj3D.visible = this.data.enabled;
          this.el.setObject3D("outline", outlineObj3D);
        }

        return outlineObj3D
      }
    },

    createHullOutline(root, material) {
      const VERTS_PER_POSITION = 3;
      let numVerts = 0;

      root.traverse(node => {
        const position = node.geometry && node.geometry.getAttribute("position");
        if (position && position.itemSize === VERTS_PER_POSITION) {
          numVerts += position.array.length;
        }
      });

      const verts = new Float32Array(numVerts);
      let startIndex = 0;

      // detach the parent so we can get the matrixWorld of each child relative
      // to the root
      const oldParent = root.parent;
      root.parent = null;
      root.updateMatrixWorld(true);

      root.traverse(node => {
        const position = node.geometry && node.geometry.getAttribute("position");
        if (position && position.itemSize === VERTS_PER_POSITION) {
          verts.set(position.array, startIndex);

          for (let i = 0; i < position.count; i++) {
            const positionIndex = startIndex + i*VERTS_PER_POSITION;
            applyAffine4(verts, verts, node.matrixWorld.elements, positionIndex, positionIndex);
          }

          startIndex += position.count*VERTS_PER_POSITION;
        }
      });

      // restore the state of the parent
      root.parent = oldParent;
      root.updateMatrixWorld(true);

      const hullIndices = generateHullTriangles(verts);
      if (hullIndices) {
        const uniqueIndices = hullIndices.slice().sort((a,b) => a - b).filter((x,i,list) => i === 0 || x !== list[i-1]);
        const hullGeo = new THREE.BufferGeometry();
        const hullVerts = new Float32Array( uniqueIndices.flatMap( i => [verts[i], verts[i+1], verts[i+2]] ) );
        hullGeo.setAttribute( "position", new THREE.BufferAttribute( hullVerts, VERTS_PER_POSITION ) );
        hullGeo.setIndex( hullIndices.map(i => uniqueIndices.indexOf(i) ) );
        return new THREE.Mesh(hullGeo, material)
      }
    },

    onObject3DSet(event) {
      if (event.detail.type === this.data.meshName) {
        this.outline = this.createOutline(event.detail.object, this.material);
      }
    },
  });

  const WHITE_TEXTURE = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat);

  AFRAME.registerComponent("picture", {
    dependencies: ['material '],

    schema: {
      src: { type: 'string' },
      side: { oneOf: ['front', 'back', 'double'], default: 'double' },
    },

    init() {
      this.geo = undefined;
      this.mesh = undefined;
      this.material = undefined;

      this.onMaterialTextureLoaded = this.onMaterialTextureLoaded.bind(this);
      this.el.addEventListener("materialtextureloaded", this.onMaterialTextureLoaded);
    },

    remove() {
      this.el.removeEventListener("materialtextureloaded", this.onMaterialTextureLoaded);
    },

    update(oldData) {
      const data = this.data;

      if (!this.mesh) {
        this.createMesh();
      }

      if (data.src !== oldData.src) {
        this.el.setAttribute("material", "src", data.src);
        this.el.setAttribute("material", "side", data.side);
      }
    },

    createMesh() {
      this.geo = new THREE.PlaneBufferGeometry();
      this.material = new THREE.MeshStandardMaterial( { side: THREE.DoubleSide } );
      this.mesh = new THREE.Mesh(this.geo, this.material);
      this.el.setObject3D("mesh", this.mesh);
    },

    resizeMesh(imageWidth, imageHeight) {
      const maxLength = Math.max(imageWidth, imageHeight);
      const positions = this.geo.getAttribute("position");
      const w_2 = .5*imageWidth/maxLength;
      const h_2 = .5*imageHeight/maxLength;
      positions.setXYZ(0, -w_2,  h_2, 0);
      positions.setXYZ(1,  w_2,  h_2, 0);
      positions.setXYZ(2, -w_2, -h_2, 0);
      positions.setXYZ(3,  w_2, -h_2, 0);
      positions.needsUpdate = true;
    },

    onMaterialTextureLoaded(event) {
      const image = event.detail.src;
      if (event.target === this.el && image && image.height > 0 && image.width > 0) {
        this.resizeMesh(image.width, image.height);
      }
    }
  });

  AFRAME.registerComponent("pixel-color", {
    schema: {
      src: { type: "map" },
      canvas: { type: "selector" },
      color: { type: "color" },
      minSlope: { default: 0 },
      maxSlope: { default: 90 },
      bottomLeft: { type: "vec2", default: {x:0, y:0} },
      topRight: { type: "vec2", default: {x:1, y:1} },
      minIntensity: { default: 0 },
      maxIntensity: { default: 1 },
    },
    multiple: true,

    init() {
      this.color = new THREE.Color();
    },

    update() {
      const data = this.data;
      let hasValidData = true;

      if (data.src instanceof HTMLCanvasElement || data.src instanceof HTMLImageElement || data.src instanceof SVGImageElement) ; else {
        hasValidData = false;
        console.error(`unable to derive an image from 'src' - ${data.src}`);
      }

      if (data.canvas instanceof HTMLCanvasElement) ; else {
        hasValidData = false;
        console.error(`unable to find output 'canvas' - ${data.canvas}`);
      }

      this.color.set(data.color);

      if (hasValidData) {
        this.paintCanvas();
      }
    },

    paintCanvas() {
      const data = this.data;
      const srcWidth = data.src.width;
      const srcHeight = data.src.height;
      const FLOATS_PER_COLOR = 4;

      let srcCtx;

      if (data.src instanceof HTMLCanvasElement) {
        srcCtx = data.src.getContext("2d");
      } else if (data.src instanceof HTMLImageElement || data.src instanceof SVGImageElement) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = srcWidth;
        tempCanvas.height = srcHeight;
        srcCtx = tempCanvas.getContext("2d");
        srcCtx.drawImage(data.src, 0, 0);
      }

      const srcImage = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
      const srcImageData = srcImage.data;
      const intensities = Float32Array.from( { length: srcImageData.length/FLOATS_PER_COLOR }, (_, i) => {
        return ( srcImageData[i*FLOATS_PER_COLOR] + srcImageData[i*FLOATS_PER_COLOR + 1] + srcImageData[i*FLOATS_PER_COLOR + 2] ) / ( 255*3 ) // ignore alpha
      } ); 

      const paintCanvas = document.createElement("canvas");
      paintCanvas.width = srcWidth;
      paintCanvas.height = srcHeight;
      const paintCtx = paintCanvas.getContext("2d");
      
      const overlayImage = paintCtx.createImageData(srcImage);
      const overlayImageData = overlayImage.data;
      const color256 = { r: this.color.r*255, g: this.color.g*255, b: this.color.b*255 };
      const minSlope = Math.tan(THREE.Math.degToRad(Math.max(0, data.minSlope)));
      const maxSlope = Math.tan(THREE.Math.degToRad(Math.max(0, data.maxSlope)));
      const extents = { 
        min: { 
          x: data.bottomLeft.x*srcWidth, 
          y: data.bottomLeft.y*srcHeight,
        },
        max: {
          x: data.topRight.x*srcWidth, 
          y: data.topRight.y*srcHeight,
        },
      };

      for (let x = 0; x < srcWidth; x++) {
        for (let y = 0; y < srcHeight; y++) {
          const i = y*srcWidth + x;
          const j = i*FLOATS_PER_COLOR;
          const intensity = intensities[i];

          let doPaint = x >= extents.min.x && x <= extents.max.x && y >= extents.min.y && y <= extents.max.y;
          doPaint = doPaint && intensity >= data.minIntensity && intensity <= data.maxIntensity;

          if (doPaint) {
            const xSlope = ( x === 0 ? intensity - intensities[i + 1] : intensities[i - 1] - intensity ) * srcWidth;
            const ySlope = ( y === 0 ? intensity - intensities[i + srcWidth]  : intensities[i - srcWidth] - intensity ) * srcHeight;
            const slope = Math.max( Math.abs(xSlope), Math.abs(ySlope) );
            doPaint = slope >= minSlope && slope <= maxSlope;
         }

          if (doPaint) {
            overlayImageData[j] = color256.r;
            overlayImageData[j+1] = color256.g;
            overlayImageData[j+2] = color256.b;
            overlayImageData[j+3] = 255;
          } else {
            overlayImageData[j+3] = 0;
          }
        }
      }

      paintCtx.putImageData(overlayImage, 0, 0);

      const targetCtx = data.canvas.getContext("2d");
      targetCtx.drawImage(paintCanvas, 0, 0, data.canvas.width, data.canvas.height); // src and canvas sizes may differ

      updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, data.canvas);
    }
  });

  AFRAME.registerSystem("procedural-texture", {
    init() {
      this.renderer = undefined;
      this.proceduralTextureComponents = [];
    },

    registerComponent(component) {
      this.proceduralTextureComponents.push(component);
      
      if (!this.renderer) {
        this.createRenderer();
      }
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

    createRenderer() {
      this.renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false});
      this.renderer.setPixelRatio( window.devicePixelRatio );
      this.renderer.autoClear = true; // when a shader fails we will see pink, rather than the last shader output
      this.renderer.setClearColor(new THREE.Color("purple"), 1.);
    },
  });

  AFRAME.registerComponent("procedural-texture", {
    dependencies: ["geometry"], // this is for the case where 'canvas' is not set
    schema: {
      shader: { type: "string" },
      canvas: { type: "selector" }
    },
    multiple: true,

    init() {
      this.canvas = undefined;
      this.system.registerComponent(this);
    },

    remove() {
      this.system.unregisterComponent(this);
    },

    updateSchema(newData) {
      var isDeferred = false; // must be a 'var' so the change in value at the end of this function is reflected in the closure

      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
      if (!this.data || this.data.shader !== newData.shader) {
        this.shaderProgram = "";
        this.uniforms = {};

        if (newData.shader) {
          // if the loading is deferred i.e. from a file, then procedural texture
          // is generated once the file is loaded, but the schema will not be updated
          loadTemplate( newData.shader, "main(", (text) => {
            this.shaderProgram = text; 
            this.uniforms = this.parseShaderUniforms( this.shaderProgram );
            if (isDeferred) {
              this.updateProceduralTexture();
            }
          } );
        }
      }

      let newSchema = this.uniformsToSchema(this.uniforms);

      if (!newData.canvas) {
        newSchema.width = { type: "int", value: 256 };
        newSchema.height = { type: "int", value: 256 };
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }

      isDeferred = true;
    },

    update(oldData) {
      const data = this.data;

      if (data.canvas !== oldData.canvas) {
        this.canvas = (data.canvas && data.canvas instanceof HTMLCanvasElement) ? data.canvas : undefined;
      }

      if (!data.canvas && !this.canvas) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = data.width || 256;
        this.canvas.height = data.height || 256;

        const mesh = this.el.getObject3D("mesh");
        if (mesh && mesh.material) {
          mesh.material.map = new THREE.CanvasTexture(this.canvas);
        }
      }

      if (this.canvas && this.shaderProgram) {
        this.updateProceduralTexture();
      }

      if (this.usesComponentTime()) {
        this.el.sceneEl.addBehavior(this); // can be called multiple times
      }
    },

    updateProceduralTexture() {
      if (!this.scene) {
        this.setupScene(this.canvas, this.shaderProgram);
      }

      this.updateUniforms(this.uniforms, this.data);
      this.renderScene();

      updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, this.canvas);
      this.system.updateProceduralTexturesUsingThisCanvas(this.canvas);
      this.canvas.dispatchEvent(new CustomEvent("loaded", {bubbles: false}));
    },

    usesComponentTime() {
      return "time" in this.uniforms && !("time" in this.attrValue)
    },

    tick(time) {
      if (!this.usesComponentTime()) {
        this.el.sceneEl.removeBehavior(this);
      } else {
        this.uniforms.time.value = time*0.001;
        this.renderScene();
      }
    },

    setupScene(canvas, shader) {
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.camera.position.z = 1;
      
      this.uniforms = this.parseShaderUniforms(shader);
      const fullFragmentShader = shader.replace(/#include\s*<procedural-ext>/, PROCEDURAL_EXT);

      var shaderMaterial = new THREE.RawShaderMaterial( {
        uniforms: this.uniforms,
        vertexShader: PROCEDURAL_VERTEX_SHADER,
        fragmentShader: fullFragmentShader,
      } );
    
      const mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), shaderMaterial );
      this.scene.add( mesh );
    
      this.ctx = canvas.getContext("2d");
    },
    
    renderScene() {
      const canvas = this.ctx.canvas;
      const width = canvas.width;
      const height = canvas.height;
      const renderer = this.system.renderer;

      renderer.setSize( width, height );
      renderer.render( this.scene, this.camera );

      this.ctx.clearRect(0, 0, width, height);
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
            warn(`no attribute for uniform: ${name}`);
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
          warn(`unknown uniform type ${type}`);
      }
    }, 
  });

  const PROCEDURAL_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;
void main()
{
  vUv = uv;
  gl_Position = vec4( position, 1.0 );
}`;

  const PROCEDURAL_EXT = `
precision highp float;
precision highp int;

// FLOAT -> FLOAT
// could use levels low, high, mid, black, white (mid maps to (black + white)/2)
float remap(float v, float amin, float amax, float bmin, float bmax)
{
  return (v - amin)*(bmax - bmin)/(amax - amin) + bmin;
}

float roundF(const float number)
{
  return sign(number)*floor(abs(number)+0.5);
}

float quantize(const float v, const float quanta) {
  return floor(v/quanta)*quanta;
}

// VEC2 -> VEC2
vec2 uvBrick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0)
  {
    xi=xi-0.5;
  }
  float nxi=roundF(xi);

  return vec2((xi-floor(xi))*numberOfBricksHeight,(yi-floor(yi))*numberOfBricksWidth);
}

vec2 uvTransform(const vec2 uv, const vec2 center, const vec2 scale, const float rad, const vec2 translate) 
{
  float c = cos(-rad);
  float s = sin(-rad);
  float x = (uv.x - translate.x - center.x);
  float y = (uv.y - translate.y - center.y);
  float x2 = (x*c + y*s)/scale.x + center.x;
  float y2 = (-x*s + y*c)/scale.y + center.y;
  return vec2(x2, y2);
}

vec2 uvCrop(const vec2 uv, const vec2 uvMin, const vec2 uvMax) 
{
  vec2 scale = 1./(uvMax - uvMin);
  return uvTransform(uv, vec2(0.), scale, 0., -uvMin*scale);
}


// SAMPLER2D -> VEC4
float normpdf(const float x, const float sigma)
{
  return .39894*exp(-.5*x*x/(sigma*sigma))/sigma;
}

vec4 blur13(const sampler2D image, const vec2 uv, const vec2 resolution, const float sigma)
{
  const int kernelWidth = 13;
  const int kSize = kernelWidth/2 - 1;
  float kernel[kernelWidth];

  float Z = 0.;

  for (int j = 0; j <= kSize; j++)
  {
    kernel[kSize + j] = kernel[kSize - j] = normpdf(float(j), sigma);
  }
  for (int j = 0; j < kernelWidth; j++)
  {
    Z += kernel[j];
  }

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color += kernel[kSize + j]*kernel[kSize + i]*texture2D( image, uv + vec2(float(i), float(j))/resolution );
    }
  }

  return color/(Z*Z);
}

vec4 terrase13(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 13; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

vec4 terrase5(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 5; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

vec4 terrase27(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 27; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

// VEC2 -> FLOAT
float rand(const vec2 n)
{
  return fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);
}

float noise(const vec2 n)
{
  const vec2 d=vec2(0.0,1.0);
  vec2 b=floor(n), f=smoothstep(vec2(0.0), vec2(1.0), fract(n));
  return mix( mix( rand(b), rand(b+d.yx), f.x ), mix( rand(b+d.xy), rand(b+d.yy), f.x ), f.y );
}

float fbm(vec2 n) {
  float total=0.0,amplitude=1.0;

  for (int i=0; i<4; i++)
  {
    total+=noise(n)*amplitude;
    n+=n;
    amplitude*=0.5;
  }

  return total;
}

float turbulence(const vec2 P)
{
  float val=0.0;
  float freq=1.0;

  for (int i=0; i<4; i++)
  {
    val+=abs(noise(P*freq)/freq);
    freq*=2.07;
  }

  return val;
}

float brick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight, const float jointWidthPercentage, const float jointHeightPercentage)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0) { xi = xi - 0.5; } // offset every second brick
  float nxi=roundF(xi);
  xi = abs(xi - nxi);
  yi = abs(yi - nyi);

  return 1. - clamp( min(yi/jointHeightPercentage, xi/jointWidthPercentage) + 0.2, 0., 1. );
}

float marble(const vec2 uv, float amplitude, float k)
{
  k = 6.28*uv.x/k;
  k += amplitude*turbulence(uv.xy);
  k = sin(k);
  k = .5*(k + 1.);
  k = sqrt( sqrt( sqrt(k) ) ); 
  return .2 + .75*k;
}

float checkerboard(const vec2 uv, const float numCheckers)
{
  float cx = floor(numCheckers * uv.x);
  float cy = floor(numCheckers * uv.y);
  return sign( mod(cx + cy, 2.) );
}

float gaussian(const vec2 uv)
{
  vec2 xy = (mod(uv, vec2(1.,1.)) - .5)*2.;
  float exponent = dot(xy,xy)/0.31831;
  return exp(-exponent);
}

// from glsl-voronoi-noise
const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
const vec2 mys = vec2(1e4, 1e6);

vec2 rhash(vec2 uv) {
  uv *= myt;
  uv *= mys;
  return fract(fract(uv / mys) * uv);
}

vec3 hash(const vec3 p) {
  return fract(sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)),
    dot(p, vec3(57.0, 113.0, 1.0)),
    dot(p, vec3(113.0, 1.0, 57.0)))) *
  43758.5453);
}

float voronoi2d(const in vec2 point) {
  vec2 p = floor(point);
  vec2 f = fract(point);
  float res = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(i, j);
      vec2 r = vec2(b) - f + rhash(p + b);
      res += 1. / pow(dot(r, r), 8.);
    }
  }
  return pow(1. / res, 0.0625);
}

// from glsl-worley
// Permutation polynomial: (34x^2 + x) mod 289
vec3 permute(const vec3 x) {
  return mod((34.0 * x + 1.0) * x, 289.0);
}

vec3 dist(const vec3 x, const vec3 y) {
  return (x * x + y * y);
}

vec2 worley(const vec2 P, const float jitter) {
  float K= 0.142857142857; // 1/7
  float Ko= 0.428571428571 ;// 3/7
  vec2 Pi = mod(floor(P), 289.0);
  vec2 Pf = fract(P);
  vec3 oi = vec3(-1.0, 0.0, 1.0);
  vec3 of = vec3(-0.5, 0.5, 1.5);
  vec3 px = permute(Pi.x + oi);
  vec3 p = permute(px.x + Pi.y + oi); // p11, p12, p13
  vec3 ox = fract(p*K) - Ko;
  vec3 oy = mod(floor(p*K),7.0)*K - Ko;
  vec3 dx = Pf.x + 0.5 + jitter*ox;
  vec3 dy = Pf.y - of + jitter*oy;
  vec3 d1 = dist(dx,dy); // squared
  p = permute(px.y + Pi.y + oi); // p21, p22, p23
  ox = fract(p*K) - Ko;
  oy = mod(floor(p*K),7.0)*K - Ko;
  dx = Pf.x - 0.5 + jitter*ox;
  dy = Pf.y - of + jitter*oy;
  vec3 d2 = dist(dx,dy); // squared
  p = permute(px.z + Pi.y + oi); // p31, p32, p33
  ox = fract(p*K) - Ko;
  oy = mod(floor(p*K),7.0)*K - Ko;
  dx = Pf.x - 1.5 + jitter*ox;
  dy = Pf.y - of + jitter*oy;
  vec3 d3 = dist(dx,dy); // squared

  // Sort out the two smallest distances (F1, F2)
  vec3 d1a = min(d1, d2);
  d2 = max(d1, d2); // Swap to keep candidates for F2
  d2 = min(d2, d3); // neither F1 nor F2 are now in d3
  d1 = min(d1a, d2); // F1 is now in d1
  d2 = max(d1a, d2); // Swap to keep candidates for F2
  d1.xy = (d1.x < d1.y) ? d1.xy : d1.yx; // Swap if smaller
  d1.xz = (d1.x < d1.z) ? d1.xz : d1.zx; // F1 is in d1.x
  d1.yz = min(d1.yz, d2.yz); // F2 is now not in d2.yz
  d1.y = min(d1.y, d1.z); // nor in  d1.z
  d1.y = min(d1.y, d2.x); // F2 is in d1.y, we're done.
  return sqrt(d1.xy);
}
`;

  AFRAME.registerComponent('prefab', {
    schema: {
      template: { default: "" },
      debug: { default: false },
    },

    init() {
      this.templateContent = undefined;
      this.hasPrefab = false;
    },

    remove() {
      this.destroyPrefab();
    },

    updateSchema(newData) {
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
      const originalSchema = AFRAME.components[this.name].schema;
      let newSchema = {};

      for (let prop in newData) {
        if (!(prop in originalSchema)) {
          newSchema[prop] = { type: "string" };
        }
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    update(oldData) {
      const data = this.data;
      
      if (oldData.template !== data.template) {
        loadTemplate( data.template, "", (text) => {
          this.templateContent = text;
          this.destroyPrefab();
          this.createPrefab();
        } );
      }
    },

    createPrefab() {
      if (!this.hasPrefab) {
        const newHTML = this.processTemplate(this.templateContent);
        this.el.innerHTML = newHTML;
        this.hasPrefab = true;

        if (this.data.debug) {
          console.log(newHTML);
        }
      }
    },

    destroyPrefab() {
      if (this.hasPrefab) {
        while (this.el.lastChild) {
          this.el.removeChild(this.el.lastChild);
        }
        this.hasPrefab = false;
      }
    },

    processTemplate(str) {
      const templateArgs = Object.keys(this.data).concat("return `" + str + "`");
      const fn = new Function(...templateArgs);
      return fn(...Object.values(this.data))
    },
  });

  AFRAME.registerComponent( "rumble", {
    schema: {
      events: { default: "" },
      delay: { default: 0 },
      duration: { default: 0.1 },
      force: { default: 1 },
      controllers: { default: "" },
      enabled: { default: true },
    },

    multiple: true,

    init() {
      this.delayClock = basicClock();
      this.eventListener = scopedEvents( this.el, this.onEvent.bind( this ) );
      this.pulses = [];
    },

    remove() {
      this.eventListener.remove();
      this.stopAllActuators();
    },

    play() {
      this.eventListener.add();
    },

    pause() {
      this.eventListener.remove();
      this.stopAllActuators();
    },

    update( oldData ) {
      const data = this.data;
      if ( data.events !== oldData.events ) {
        this.eventListener.set( data.events );
      }

      if ( data.controllers !== oldData.controllers ) {
        this.stopAllActuators();
        this.actuators = []; // will force a rebuild of the actuators
      }

      if ( data.enabled !== oldData.enabled ) {
        if ( !data.enabled ) {
          this.stopAllActuators();
        }
      }
    },

    onEvent( e ) {
      const data = this.data;
      if ( !data.enabled ) {
        return
      }

      const actuators = this.getActuators( e );
      if ( actuators.length === 0 ) {
        return
      }

      function pulseActuators(pulses) {
        pulses = [];
        
        actuators.map( actuator => {
          pulses.push( actuator );

          actuator.pulse( data.force, data.duration*1000 ).then( () => {
            pulses.splice( pulses.indexOf( actuator ), 1 );
          }, ( err ) => {
            pulses.splice( pulses.indexOf( actuator ), 1 );
            console.error( err ); 
          } ); 
        } );
      }

      const self = this;
      this.delayClock.startTimer( data.delay, () => pulseActuators(self.pulses) );
    },

    stopAllActuators() {
      this.delayClock.clearAllTimers();

      for (let actuator of this.pulses) {
        actuator.pulse(0,0);
      }
      this.pulses.length = 0;
    },

    getActuators( e ) {
      if ( this.actuators.length > 0 ) {
        return this.actuators
      }

      const data = this.data;

      const elements = data.controllers ? document.querySelectorAll( data.controllers ) : [ this.el ];
      let actuators = [];

      if ( elements.length === 0 ) {
        warn( this, "no controller elements found" );

      } else {
        for ( let el of elements ) {
          if ( el.components[ 'tracked-controls' ] && el.components[ 'tracked-controls' ].controller ) {
            const gamepad = el.components[ 'tracked-controls' ].controller;
            if ( gamepad.hapticActuators.length > 0 ) {
              actuators.push( ...gamepad.hapticActuators );
            }
          }
        }

        if ( actuators.length === 0 ) {
          warn( this, "no tracked-controls found" );
        }
      }

      {
        this.actuators = actuators;
      }

      return actuators
    },

  } );

  // adapted from 
  // https://github.com/aframevr/aframe/blob/master/src/components/scene/screenshot.js
  // https://github.com/mrdoob/three.js/blob/dev/examples/webgl_depth_texture.html

  /* global ImageData, URL */
  // var registerComponent = require('../../core/component').registerComponent;
  // var THREE = require('../../lib/three');

  var EQUIRECTANGULAR_VERTEX_SHADER = [
    'attribute vec3 position;',
    'attribute vec2 uv;',
    'uniform mat4 projectionMatrix;',
    'uniform mat4 modelViewMatrix;',
    'varying vec2 vUv;',
    'void main()  {',
    '  vUv = vec2( 1.- uv.x, uv.y );',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
    '}'
  ].join('\n');

  var EQUIRECTANGULAR_FRAGMENT_SHADER = [
    'precision mediump float;',
    'uniform samplerCube map;',
    'varying vec2 vUv;',
    '#define M_PI 3.141592653589793238462643383279',
    'void main() {',
    '  vec2 uv = vUv;',
    '  float longitude = uv.x * 2. * M_PI + .5 * M_PI;',
    '  float latitude = uv.y * M_PI;',
    '  vec3 dir = vec3(',
    '    - sin( longitude ) * sin( latitude ),',
    '    cos( latitude ),',
    '    - cos( longitude ) * sin( latitude )',
    '  );',
    '  normalize( dir );',
    '  gl_FragColor = vec4( textureCube( map, dir ).rgb, 1.0 );',
    '}'
  ].join('\n');

  var DEPTH_VERTEX_SHADER = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var DEPTH_FRAGMENT_SHADER = [
    '#include <packing>',
    'varying vec2 vUv;',
    'uniform sampler2D tDepth;',
    'uniform float cameraNear;',
    'uniform float cameraFar;',
    'uniform float maxDepth;',
    'float readDepth( sampler2D depthSampler, vec2 coord ) {',
    '  float fragCoordZ = texture2D( depthSampler, coord ).x;',
    '  float z_n = 2.0 * fragCoordZ - 1.0;',
    '  float z_e = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));',
    '  return clamp(z_e/maxDepth, 0., 1.);',
    '}',
    'void main() {',
    '  //gl_FragColor.rgb = vec3(vUv.x, vUv.y, 0.0);',
    '  //gl_FragColor.rgb = texture2D( tDepth, vUv ).rgb;',
    '  float depth = readDepth( tDepth, vUv );',
    '  gl_FragColor.rgb = 1.0 - vec3( depth );',
    '  gl_FragColor.a = 1.0;',
    '}'
  ].join('\n');

  /**
   * Component to take screenshots of the scene using a keboard shortcut (alt+s).
   * It can be configured to either take 360&deg; captures (`equirectangular`)
   * or regular screenshots (`projection`)
   *
   * This is based on https://github.com/spite/THREE.CubemapToEquirectangular
   * To capture an equirectangular projection of the scene a THREE.CubeCamera is used
   * The cube map produced by the CubeCamera is projected on a quad and then rendered to
   * WebGLRenderTarget with an ortographic camera.
   */
  AFRAME.registerComponent('screenshotx', {
    schema: {
      width: {default: 4096},
      height: {default: 2048},
      camera: {type: 'selector'},
      maxDepth: {default: 10},
    },

    init: function () {
      this.setup = this.setup.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);

      const el = this.el;

      if (el.renderer) {
        this.setup();
      } else {
        el.addEventListener('render-target-loaded', this.setup);
      }
    },

    setup() {
      var gl = this.el.renderer.getContext();
      if (!gl) { return; }

      this.cubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
      this.orthographicCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
      
      this.screenshot = {};
      this.screenshot.canvas = document.createElement('canvas');
      this.screenshot.ctx = this.screenshot.canvas.getContext('2d');

      this.equirectangular = {};
      this.equirectangular.material = new THREE.RawShaderMaterial({
        uniforms: {map: {type: 't', value: null}},
        vertexShader: EQUIRECTANGULAR_VERTEX_SHADER,
        fragmentShader: EQUIRECTANGULAR_FRAGMENT_SHADER,
        side: THREE.DoubleSide
      });
      const equirectangularQuad = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(2, 2),
        this.equirectangular.material
      );
      this.equirectangular.scene = new THREE.Scene();
      this.equirectangular.scene.add(equirectangularQuad);

      this.depth = {};
      this.depth.canvas = document.createElement('canvas');
      this.depth.ctx = this.depth.canvas.getContext('2d');
      this.depth.material = new THREE.ShaderMaterial( {
        vertexShader: DEPTH_VERTEX_SHADER,
        fragmentShader: DEPTH_FRAGMENT_SHADER,
        uniforms: {
          cameraNear: { value: 0 },
          cameraFar: { value: 0 },
          maxDepth: { value: 0 },
          tDepth: { type: 't', value: null }
        }
      } );
      const depthQuad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), this.depth.material );
      this.depth.scene = new THREE.Scene();
      this.depth.scene.add(depthQuad);
    },

    createRenderTarget: function (width, height) {
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      });
      target.stencilBuffer = false;
      target.depthBuffer = true;

      return target
    },

    play: function () {
      window.addEventListener('keydown', this.onKeyDown);
    },

    pause: function() {
      window.removeEventListener('keydown', this.onKeyDown);
    },

    /**
     * <ctrl> + <alt> + s = Regular screenshot.
     * <ctrl> + <alt> + <shift> + s = Equirectangular screenshot.
    */
    onKeyDown: function (evt) {
      const shortcutPressed = evt.keyCode === 83 && evt.ctrlKey && evt.altKey;
      if (this.data && shortcutPressed) {
        const baseFilename = `screenshot${document.title ? '+' + document.title.toLowerCase() : ''}-${Date.now()}`;
        this.capture( evt.shiftKey ? 'equirectangular' : 'perspective', baseFilename );
      }
    },

    capture(projection, baseFilename = undefined) {
      const renderer = this.el.renderer;
      const wasVREnabled = renderer.vr.enabled;
      renderer.vr.enabled = false;

      const camera = (this.data.camera && this.data.camera.components.camera.camera) || this.el.camera;
      const size = { width: this.data.width, height: this.data.height };

      if (projection === 'perspective') {
        this.capturePerspective(camera, size);
      } else {
        this.captureEquirectangular(camera, size);
      }

      if (baseFilename) {
        this.saveCapture(this.screenshot.canvas, baseFilename + '.png');

        if (projection === 'perspective') {
          this.saveCapture(this.depth.canvas, baseFilename + '_depth.png');
        }
      }

      renderer.vr.enabled = wasVREnabled;

      return this.screenshot.canvas
    },

    capturePerspective(camera, size) {
      const renderer = this.el.renderer;

      const screenshotOutput = this.createRenderTarget(size.width, size.height);
      screenshotOutput.depthTexture = new THREE.DepthTexture();
      screenshotOutput.depthTexture.type = THREE.UnsignedShortType;

      renderer.clear();
      renderer.setRenderTarget( screenshotOutput );
      renderer.render( this.el.object3D, camera );

      this.screenshot.canvas.width = size.width;
      this.screenshot.canvas.height = size.height;
      this.copyRenderTargetToCanvas( renderer, screenshotOutput, this.screenshot.ctx, size, true );

      const depthUniforms = this.depth.material.uniforms;
      depthUniforms.tDepth.value = screenshotOutput.depthTexture;
      depthUniforms.cameraNear.value = camera.near;
      depthUniforms.cameraFar.value = camera.far;
      depthUniforms.maxDepth.value = this.data.maxDepth;

      const depthOutput = this.createRenderTarget(size.width, size.height);    
      renderer.setRenderTarget( depthOutput );
      renderer.render( this.depth.scene, this.orthographicCamera );

      this.depth.canvas.width = size.width;
      this.depth.canvas.height = size.height;
      this.copyRenderTargetToCanvas( renderer, depthOutput, this.depth.ctx, size, true );

      renderer.setRenderTarget(null);
    },

    captureEquirectangular(camera, size) {
      const el = this.el;
      const renderer = el.renderer;

      // Create cube camera and copy position from scene camera.
      // NOTE: CubeCamera does not support a depthTexture
      var cubeCamera = new THREE.CubeCamera( camera.near, camera.far, Math.min(this.cubeMapSize, 2048) );
      // cubeCamera.renderTarget.depthTexture = new THREE.DepthTexture()
      // cubeCamera.renderTarget.depthTexture.type = THREE.UnsignedShortType

      // Copy camera position into cube camera;
      camera.getWorldPosition( cubeCamera.position );
      camera.getWorldQuaternion( cubeCamera.quaternion );

      // Render scene into the cube camera texture
      cubeCamera.update( el.renderer, el.object3D );

      const output = this.createRenderTarget(size.width, size.height);

      this.equirectangular.material.uniforms.map.value = cubeCamera.renderTarget.texture;

      renderer.clear();
      renderer.setRenderTarget( output );
      renderer.render( this.equirectangular.scene, this.orthographicCamera );

      this.screenshot.canvas.width = size.width;
      this.screenshot.canvas.height = size.height;
      this.copyRenderTargetToCanvas( renderer, output, this.screenshot.ctx, size, false );

      // this.equirectangular.material.uniforms.map.value = cubeCamera.renderTarget.depthTexture

      // renderer.clear()
      // renderer.setRenderTarget( output )
      // renderer.render( this.equirectangular.scene, this.orthographicCamera )

      // const depthUniforms = this.depth.material.uniforms
      // depthUniforms.tDepth.value = output.texture
      // depthUniforms.cameraNear.value = camera.near
      // depthUniforms.cameraFar.value = camera.far

      // const depthOutput = this.createRenderTarget(size.width, size.height)    
      // renderer.setRenderTarget( depthOutput )
      // renderer.render( this.depth.scene, this.orthographicCamera )

      // this.depth.canvas.width = size.width
      // this.depth.canvas.height = size.height
      // this.copyRenderTargetToCanvas( renderer, output, this.depth.ctx, size, false )

      renderer.setRenderTarget(null);
    },

    flipPixelsVertically: function (pixels, width, height) {
      var flippedPixels = pixels.slice(0);
      for (var x = 0; x < width; ++x) {
        for (var y = 0; y < height; ++y) {
          flippedPixels[x * 4 + y * width * 4] = pixels[x * 4 + (height - y) * width * 4];
          flippedPixels[x * 4 + 1 + y * width * 4] = pixels[x * 4 + 1 + (height - y) * width * 4];
          flippedPixels[x * 4 + 2 + y * width * 4] = pixels[x * 4 + 2 + (height - y) * width * 4];
          flippedPixels[x * 4 + 3 + y * width * 4] = pixels[x * 4 + 3 + (height - y) * width * 4];
        }
      }
      return flippedPixels;
    },

    /**
     * Download capture to file.
     */
    saveCapture: function(canvas, fileName) {
      canvas.toBlob(function (blob) {
        var linkEl = document.createElement('a');
        var url = URL.createObjectURL(blob);
        linkEl.href = url;
        linkEl.setAttribute('download', fileName);
        linkEl.innerHTML = 'downloading...';
        linkEl.style.display = 'none';
        document.body.appendChild(linkEl);
        setTimeout(function () {
          linkEl.click();
          document.body.removeChild(linkEl);
        }, 1);
      }, 'image/png');
    },

    copyRenderTargetToCanvas(renderer, renderTarget, ctx, size, invertY) {
      let pixels = new Uint8Array(4 * size.width * size.height);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, size.width, size.height, pixels);

      if (invertY) {
        pixels = this.flipPixelsVertically(pixels, size.width, size.height);
      }

      const imageData = new ImageData(new Uint8ClampedArray(pixels), size.width, size.height);
      ctx.putImageData(imageData, 0, 0);
    }
  });

  /**
   * SfxrParams
   *
   * Copyright 2010 Thomas Vian
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *
   * @author Thomas Vian
   */
  /** @constructor */
  function SfxrParams() {
    //--------------------------------------------------------------------------
    //
    //  Settings String Methods
    //
    //--------------------------------------------------------------------------

    /**
     * Parses a settings array into the parameters
     * @param values Array of the settings values, where elements 0 - 23 are
     *                a: waveType
     *                b: attackTime
     *                c: sustainTime
     *                d: sustainPunch
     *                e: decayTime
     *                f: startFrequency
     *                g: minFrequency
     *                h: slide
     *                i: deltaSlide
     *                j: vibratoDepth
     *                k: vibratoSpeed
     *                l: changeAmount
     *                m: changeSpeed
     *                n: squareDuty
     *                o: dutySweep
     *                p: repeatSpeed
     *                q: phaserOffset
     *                r: phaserSweep
     *                s: lpFilterCutoff
     *                t: lpFilterCutoffSweep
     *                u: lpFilterResonance
     *                v: hpFilterCutoff
     *                w: hpFilterCutoffSweep
     *                x: masterVolume
     * @return If the string successfully parsed
     */
    this.setSettings = function(values)
    {
      for ( var i = 0; i < 24; i++ )
      {
        this[String.fromCharCode( 97 + i )] = values[i] || 0;
      }

      // I moved this here from the reset(true) function
      if (this['c'] < .01) {
        this['c'] = .01;
      }

      var totalTime = this['b'] + this['c'] + this['e'];
      if (totalTime < .18) {
        var multiplier = .18 / totalTime;
        this['b']  *= multiplier;
        this['c'] *= multiplier;
        this['e']   *= multiplier;
      }
    };
  }

  /**
   * SfxrSynth
   *
   * Copyright 2010 Thomas Vian
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *
   * @author Thomas Vian
   */
  /** @constructor */
  function SfxrSynth() {
    // All variables are kept alive through function closures

    //--------------------------------------------------------------------------
    //
    //  Sound Parameters
    //
    //--------------------------------------------------------------------------

    this._params = new SfxrParams();  // Params instance

    //--------------------------------------------------------------------------
    //
    //  Synth Variables
    //
    //--------------------------------------------------------------------------

    var _envelopeLength0, // Length of the attack stage
        _envelopeLength1, // Length of the sustain stage
        _envelopeLength2, // Length of the decay stage

        _period,          // Period of the wave
        _maxPeriod,       // Maximum period before sound stops (from minFrequency)

        _slide,           // Note slide
        _deltaSlide,      // Change in slide

        _changeAmount,    // Amount to change the note by
        _changeTime,      // Counter for the note change
        _changeLimit,     // Once the time reaches this limit, the note changes

        _squareDuty,      // Offset of center switching point in the square wave
        _dutySweep;       // Amount to change the duty by

    //--------------------------------------------------------------------------
    //
    //  Synth Methods
    //
    //--------------------------------------------------------------------------

    /**
     * Resets the runing variables from the params
     * Used once at the start (total reset) and for the repeat effect (partial reset)
     */
    this.reset = function() {
      // Shorter reference
      var p = this._params;

      _period       = 100 / (p['f'] * p['f'] + .001);
      _maxPeriod    = 100 / (p['g']   * p['g']   + .001);

      _slide        = 1 - p['h'] * p['h'] * p['h'] * .01;
      _deltaSlide   = -p['i'] * p['i'] * p['i'] * .000001;

      if (!p['a']) {
        _squareDuty = .5 - p['n'] / 2;
        _dutySweep  = -p['o'] * .00005;
      }

      _changeAmount =  1 + p['l'] * p['l'] * (p['l'] > 0 ? -.9 : 10);
      _changeTime   = 0;
      _changeLimit  = p['m'] == 1 ? 0 : (1 - p['m']) * (1 - p['m']) * 20000 + 32;
    };

    // I split the reset() function into two functions for better readability
    this.totalReset = function() {
      this.reset();

      // Shorter reference
      var p = this._params;

      // Calculating the length is all that remained here, everything else moved somewhere
      _envelopeLength0 = p['b']  * p['b']  * 100000;
      _envelopeLength1 = p['c'] * p['c'] * 100000;
      _envelopeLength2 = p['e']   * p['e']   * 100000 + 12;
      // Full length of the volume envelop (and therefore sound)
      // Make sure the length can be divided by 3 so we will not need the padding "==" after base64 encode
      return ((_envelopeLength0 + _envelopeLength1 + _envelopeLength2) / 3 | 0) * 3;
    };

    /**
     * Writes the wave to the supplied buffer ByteArray
     * @param buffer A ByteArray to write the wave to
     * @return If the wave is finished
     */
    this.synthWave = function(buffer, length) {
      // Shorter reference
      var p = this._params;

      // If the filters are active
      var _filters = p['s'] != 1 || p['v'],
          // Cutoff multiplier which adjusts the amount the wave position can move
          _hpFilterCutoff = p['v'] * p['v'] * .1,
          // Speed of the high-pass cutoff multiplier
          _hpFilterDeltaCutoff = 1 + p['w'] * .0003,
          // Cutoff multiplier which adjusts the amount the wave position can move
          _lpFilterCutoff = p['s'] * p['s'] * p['s'] * .1,
          // Speed of the low-pass cutoff multiplier
          _lpFilterDeltaCutoff = 1 + p['t'] * .0001,
          // If the low pass filter is active
          _lpFilterOn = p['s'] != 1,
          // masterVolume * masterVolume (for quick calculations)
          _masterVolume = p['x'] * p['x'],
          // Minimum frequency before stopping
          _minFreqency = p['g'],
          // If the phaser is active
          _phaser = p['q'] || p['r'],
          // Change in phase offset
          _phaserDeltaOffset = p['r'] * p['r'] * p['r'] * .2,
          // Phase offset for phaser effect
          _phaserOffset = p['q'] * p['q'] * (p['q'] < 0 ? -1020 : 1020),
          // Once the time reaches this limit, some of the    iables are reset
          _repeatLimit = p['p'] ? ((1 - p['p']) * (1 - p['p']) * 20000 | 0) + 32 : 0,
          // The punch factor (louder at begining of sustain)
          _sustainPunch = p['d'],
          // Amount to change the period of the wave by at the peak of the vibrato wave
          _vibratoAmplitude = p['j'] / 2,
          // Speed at which the vibrato phase moves
          _vibratoSpeed = p['k'] * p['k'] * .01,
          // The type of wave to generate
          _waveType = p['a'];

      var _envelopeLength      = _envelopeLength0,     // Length of the current envelope stage
          _envelopeOverLength0 = 1 / _envelopeLength0, // (for quick calculations)
          _envelopeOverLength1 = 1 / _envelopeLength1, // (for quick calculations)
          _envelopeOverLength2 = 1 / _envelopeLength2; // (for quick calculations)

      // Damping muliplier which restricts how fast the wave position can move
      var _lpFilterDamping = 5 / (1 + p['u'] * p['u'] * 20) * (.01 + _lpFilterCutoff);
      if (_lpFilterDamping > .8) {
        _lpFilterDamping = .8;
      }
      _lpFilterDamping = 1 - _lpFilterDamping;

      var _finished = false,     // If the sound has finished
          _envelopeStage    = 0, // Current stage of the envelope (attack, sustain, decay, end)
          _envelopeTime     = 0, // Current time through current enelope stage
          _envelopeVolume   = 0, // Current volume of the envelope
          _hpFilterPos      = 0, // Adjusted wave position after high-pass filter
          _lpFilterDeltaPos = 0, // Change in low-pass wave position, as allowed by the cutoff and damping
          _lpFilterOldPos,       // Previous low-pass wave position
          _lpFilterPos      = 0, // Adjusted wave position after low-pass filter
          _periodTemp,           // Period modified by vibrato
          _phase            = 0, // Phase through the wave
          _phaserInt,            // Integer phaser offset, for bit maths
          _phaserPos        = 0, // Position through the phaser buffer
          _pos,                  // Phase expresed as a Number from 0-1, used for fast sin approx
          _repeatTime       = 0, // Counter for the repeats
          _sample,               // Sub-sample calculated 8 times per actual sample, averaged out to get the super sample
          _superSample,          // Actual sample writen to the wave
          _vibratoPhase     = 0; // Phase through the vibrato sine wave

      // Buffer of wave values used to create the out of phase second wave
      var _phaserBuffer = new Array(1024),
          // Buffer of random values used to generate noise
          _noiseBuffer  = new Array(32);
      for (var i = _phaserBuffer.length; i--; ) {
        _phaserBuffer[i] = 0;
      }
      for (var i = _noiseBuffer.length; i--; ) {
        _noiseBuffer[i] = Math.random() * 2 - 1;
      }

      for (var i = 0; i < length; i++) {
        if (_finished) {
          return i;
        }

        // Repeats every _repeatLimit times, partially resetting the sound parameters
        if (_repeatLimit) {
          if (++_repeatTime >= _repeatLimit) {
            _repeatTime = 0;
            this.reset();
          }
        }

        // If _changeLimit is reached, shifts the pitch
        if (_changeLimit) {
          if (++_changeTime >= _changeLimit) {
            _changeLimit = 0;
            _period *= _changeAmount;
          }
        }

        // Acccelerate and apply slide
        _slide += _deltaSlide;
        _period *= _slide;

        // Checks for frequency getting too low, and stops the sound if a minFrequency was set
        if (_period > _maxPeriod) {
          _period = _maxPeriod;
          if (_minFreqency > 0) {
            _finished = true;
          }
        }

        _periodTemp = _period;

        // Applies the vibrato effect
        if (_vibratoAmplitude > 0) {
          _vibratoPhase += _vibratoSpeed;
          _periodTemp *= 1 + Math.sin(_vibratoPhase) * _vibratoAmplitude;
        }

        _periodTemp |= 0;
        if (_periodTemp < 8) {
          _periodTemp = 8;
        }

        // Sweeps the square duty
        if (!_waveType) {
          _squareDuty += _dutySweep;
          if (_squareDuty < 0) {
            _squareDuty = 0;
          } else if (_squareDuty > .5) {
            _squareDuty = .5;
          }
        }

        // Moves through the different stages of the volume envelope
        if (++_envelopeTime > _envelopeLength) {
          _envelopeTime = 0;

          switch (++_envelopeStage)  {
            case 1:
              _envelopeLength = _envelopeLength1;
              break;
            case 2:
              _envelopeLength = _envelopeLength2;
          }
        }

        // Sets the volume based on the position in the envelope
        switch (_envelopeStage) {
          case 0:
            _envelopeVolume = _envelopeTime * _envelopeOverLength0;
            break;
          case 1:
            _envelopeVolume = 1 + (1 - _envelopeTime * _envelopeOverLength1) * 2 * _sustainPunch;
            break;
          case 2:
            _envelopeVolume = 1 - _envelopeTime * _envelopeOverLength2;
            break;
          case 3:
            _envelopeVolume = 0;
            _finished = true;
        }

        // Moves the phaser offset
        if (_phaser) {
          _phaserOffset += _phaserDeltaOffset;
          _phaserInt = _phaserOffset | 0;
          if (_phaserInt < 0) {
            _phaserInt = -_phaserInt;
          } else if (_phaserInt > 1023) {
            _phaserInt = 1023;
          }
        }

        // Moves the high-pass filter cutoff
        if (_filters && _hpFilterDeltaCutoff) {
          _hpFilterCutoff *= _hpFilterDeltaCutoff;
          if (_hpFilterCutoff < .00001) {
            _hpFilterCutoff = .00001;
          } else if (_hpFilterCutoff > .1) {
            _hpFilterCutoff = .1;
          }
        }

        _superSample = 0;
        for (var j = 8; j--; ) {
          // Cycles through the period
          _phase++;
          if (_phase >= _periodTemp) {
            _phase %= _periodTemp;

            // Generates new random noise for this period
            if (_waveType == 3) {
              for (var n = _noiseBuffer.length; n--; ) {
                _noiseBuffer[n] = Math.random() * 2 - 1;
              }
            }
          }

          // Gets the sample from the oscillator
          switch (_waveType) {
            case 0: // Square wave
              _sample = ((_phase / _periodTemp) < _squareDuty) ? .5 : -.5;
              break;
            case 1: // Saw wave
              _sample = 1 - _phase / _periodTemp * 2;
              break;
            case 2: // Sine wave (fast and accurate approx)
              _pos = _phase / _periodTemp;
              _pos = (_pos > .5 ? _pos - 1 : _pos) * 6.28318531;
              _sample = 1.27323954 * _pos + .405284735 * _pos * _pos * (_pos < 0 ? 1 : -1);
              _sample = .225 * ((_sample < 0 ? -1 : 1) * _sample * _sample  - _sample) + _sample;
              break;
            case 3: // Noise
              _sample = _noiseBuffer[Math.abs(_phase * 32 / _periodTemp | 0)];
          }

          // Applies the low and high pass filters
          if (_filters) {
            _lpFilterOldPos = _lpFilterPos;
            _lpFilterCutoff *= _lpFilterDeltaCutoff;
            if (_lpFilterCutoff < 0) {
              _lpFilterCutoff = 0;
            } else if (_lpFilterCutoff > .1) {
              _lpFilterCutoff = .1;
            }

            if (_lpFilterOn) {
              _lpFilterDeltaPos += (_sample - _lpFilterPos) * _lpFilterCutoff;
              _lpFilterDeltaPos *= _lpFilterDamping;
            } else {
              _lpFilterPos = _sample;
              _lpFilterDeltaPos = 0;
            }

            _lpFilterPos += _lpFilterDeltaPos;

            _hpFilterPos += _lpFilterPos - _lpFilterOldPos;
            _hpFilterPos *= 1 - _hpFilterCutoff;
            _sample = _hpFilterPos;
          }

          // Applies the phaser effect
          if (_phaser) {
            _phaserBuffer[_phaserPos % 1024] = _sample;
            _sample += _phaserBuffer[(_phaserPos - _phaserInt + 1024) % 1024];
            _phaserPos++;
          }

          _superSample += _sample;
        }

        // Averages out the super samples and applies volumes
        _superSample *= .125 * _envelopeVolume * _masterVolume;

        // Clipping if too loud
        buffer[i] = _superSample >= 1 ? 32767 : _superSample <= -1 ? -32768 : _superSample * 32767 | 0;
      }

      return length;
    };
  }

  // Adapted from http://codebase.es/riffwave/
  var synth = new SfxrSynth();
  // Export for the Closure Compiler
  var jsfxr = function(settings) {
    // Initialize SfxrParams
    synth._params.setSettings(settings);
    // Synthesize Wave
    var envelopeFullLength = synth.totalReset();
    var data = new Uint8Array(((envelopeFullLength + 1) / 2 | 0) * 4 + 44);
    var used = synth.synthWave(new Uint16Array(data.buffer, 44), envelopeFullLength) * 2;
    var dv = new Uint32Array(data.buffer, 0, 44);
    // Initialize header
    dv[0] = 0x46464952; // "RIFF"
    dv[1] = used + 36;  // put total size here
    dv[2] = 0x45564157; // "WAVE"
    dv[3] = 0x20746D66; // "fmt "
    dv[4] = 0x00000010; // size of the following
    dv[5] = 0x00010001; // Mono: 1 channel, PCM format
    dv[6] = 0x0000AC44; // 44,100 samples per second
    dv[7] = 0x00015888; // byte rate: two bytes per sample
    dv[8] = 0x00100002; // 16 bits per sample, aligned on every two bytes
    dv[9] = 0x61746164; // "data"
    dv[10] = used;      // put number of samples here

    // Base64 encoding written by me, @maettig
    used += 44;
    var i = 0,
        base64Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
        output = 'data:audio/wav;base64,';
    for (; i < used; i += 3)
    {
      var a = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
      output += base64Characters[a >> 18] + base64Characters[a >> 12 & 63] + base64Characters[a >> 6 & 63] + base64Characters[a & 63];
    }
    return output;
  };

  // if (typeof require === 'function') {
  //   module.exports = jsfxr;
  // }
  // else {
  //   this.jsfxr = jsfxr;
  // }

  const WAVE_TYPES = ["square", "saw", "sine", "noise"];
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
  };
  const PRESET_SOUNDS = Object.fromEntries( Object.entries(PRESET_SOUNDS_ENTRIES).map(x => [x[0], toNumberArray(x[1])]) );

  function toLowerCase$3(str) { return str.toLowerCase() }
  function clamp$1(x,a,b) { return x < a ? a : (x > b ? b : x) }
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
      waveType: { oneOf: WAVE_TYPES, default: "square", parse: toLowerCase$3 },
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
      this.onEvent = this.onEvent.bind(this);
      this.playSound = this.playSound.bind(this);

      this.player = new Audio();
      this.delayClock = basicClock();
      this.eventListener = scopedEvents( this.el, this.onEvent );
    },

    remove() {
      this.eventListener.remove();
      this.delayClock.clearAllTimeouts();
      this.player.stop();
    },

    pause() {
      this.eventListener.remove();
      this.delayClock.pause();
    },

    play() {
      this.eventListener.add();
      this.delayClock.resume();
    },

    update(oldData) {
      const data = this.data;
      if (oldData._play !== undefined && data._play !== oldData._play) {
        this.playSound();

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
        ];
        this.sendToPlayer(values);
        this.setData(values);
        this.setASFXData(values);
        this.data.preset = "";

        if (oldData.preset !== undefined) {
          this.player.play();
        }

      } else if (oldData.preset !== data.preset && data.preset) {
        const values = PRESET_SOUNDS[data.preset] || PRESET_SOUNDS[0];
        this.sendToPlayer(values);
        this.setData(values);
        this.setASFXData(values);

        if (oldData.preset !== undefined) {
          this.player.play();
        }

      } else if (data.as3fxr !== oldData.as3fxr && data.as3fxr) {
        const values = toNumberArray(data.as3fxr);
        this.sendToPlayer(values);
        this.setData(values);

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
        ]);

        if (data.playOnChange) {
          this.player.play();
        }
      }

      if (data.events !== oldData.events) {
        if (data.events) {
          this.eventListener.set( data.events, "", "self" );
        } else {
          this.delayClock.startTimer( this.data.delay, this.playSound );
        }
      }

    },

    setData(x) {
      const data = this.data;
      data.waveType = WAVE_TYPES[x[0]];
      data.attackTime = x[1];
      data.sustainTime = x[2];
      data.sustainPunch = x[3];
      data.decayTime = x[4];
      data.startFrequency = x[5];
      data.minFrequency = x[6];
      data.slide = x[7];
      data.deltaSlide = x[8];
      data.vibratoDepth = x[9];
      data.vibratoSpeed = x[10];
      data.changeAmount = x[11];
      data.changeSpeed = x[12];
      data.squareDuty = x[13];
      data.dutySweep = x[14];
      data.repeatSpeed = x[15];
      data.phaserOffset = x[16];
      data.phaserSweep = x[17];
      data.lpFilterCutoff = x[18];
      data.lpFilterCutoffSweep = x[19];
      data.lpFilterResonance = x[20];
      data.hpFilterCutoff = x[21];
      data.hpFilterCutoffSweep = x[22];
      data.masterVolume = x[23];
    },

    setASFXData(x) {
      this.data.as3fxr = x.map(v => v != 0 ? v.toFixed(4).replace(/0+$/,'') : '').join(",");
    },

    sendToPlayer(x) {
      this.player.src = jsfxr([
        clamp$1(x[0], 0, WAVE_TYPES.length - 1),
        clamp$1(x[1], 0, 1),
        clamp$1(x[2], 0, 1),
        clamp$1(x[3], 0, 1),
        clamp$1(x[4], 0, 1),
        clamp$1(x[5], 0, 1),
        clamp$1(x[6], 0, 1),
        clamp$1(x[7], -1, 1),
        clamp$1(x[8], -1, 1),
        clamp$1(x[9], 0, 1),
        clamp$1(x[10], 0, 1),
        clamp$1(x[11], -1, 1),
        clamp$1(x[12], 0, 1),
        clamp$1(x[13], 0, 1),
        clamp$1(x[14], -1, 1),
        clamp$1(x[15], 0, 1),
        clamp$1(x[16], -1, 1),
        clamp$1(x[17], -1, 1),
        clamp$1(x[18], 0, 1),
        clamp$1(x[19], -1, 1),
        clamp$1(x[20], 0, 1),
        clamp$1(x[21], 0, 1),
        clamp$1(x[22], -1, 1),
        clamp$1(x[23], 0, 1)
      ]);
    },

    onEvent(event) {
      this.delayClock.startTimer( this.data.delay, this.playSound );
    },

    playSound() {
      if (this.data.enabled) {
        this.player.currentTime = 0;
        this.player.play();
      }
    }
  });

  const MAX_FRAME = 64;
  const degToRad$2 = THREE.Math.degToRad;
  const VEC3_ZERO = new THREE.Vector3(0,0,0);

  const SPAWN_GEOMETRY_FUNCTIONS = {
    "geometrytriangle": randomPointInTriangle,
    "geometryedge": randomPointOnTriangleEdge,
    "geometryvertex": randomVertex,
  };

  const FRAME_STYLES = ["sequence", "randomsequence", "random"];

  function toLowerCase$4(str) {
    return str.toLowerCase()
  }

  AFRAME.registerComponent('simple-emitter', {
    schema: {
      enabled: { default: true },
      count: { default: 100 },
      particles: { default: "particles" },
      textureFrame: { type: "vec2", default: {x:0, y:0} }, // 0,0 implies use the default from the particle system
      lifeTime: { default: "1" },
      loopTime: { default: "0" },
      colors: { default: "" },
      rotations: { default: "" },
      scales: { default: "" },
      opacities: { default: "" },
      frames: { default: "" },
      frameStyle: { default: "sequence", oneOf: FRAME_STYLES, parse: toLowerCase$4 },
      velocity: { default: "0 0 0" },
      acceleration: { default: "0 0 0" },
      radialVelocity: { default: "0" },
      radialAcceleration: { default: "0" },
      angularVelocity: { default: "0 0 0" },
      angularAcceleration: { default: "0 0 0" },
      orbitalVelocity: { default: "0" },
      orbitalAcceleration: { default: "0" },
      spawnShape: { default: "point", oneOf: ["point", "geometrytriangle", "geometryedge", "geometryvertex", "circle", "sphere", "box", "insidecircle", "insidesphere", "insidebox" ], parse: toLowerCase$4 },
      spawnGeometry: { type: "selector" },
    },

    multiple: true,

    init() {
      this.particleSystem = this.el.sceneEl.systems["simple-particles"].getParticles(this.data.particles);
      this.startIndex = undefined;
      this.endIndex = undefined;
      this.maxLifeTime = undefined;
      this.spawnCount = 0;
      this.particles = [];
      this.enabled = true;
      this.spawnOffsets = undefined;
    },

    remove() {
      if (this.startIndex) {
        this.particleSystem.releaseParticles(this.startIndex);
      }
    },

    update(oldData) {
      const data = this.data;

      if (typeof data === "string") {
        warn(this, `attributes are incorrectly formatted '${data}'`);
        return
      }

      this.lifeTime = parseNumber(data.lifeTime);
      this.loopTime = parseNumber(data.loopTime);
      this.rotations = parseNumberArray(data.rotations, degToRad$2);
      this.scales = parseNumberArray(data.scales);
      this.opacities = parseNumberArray(data.opacities);
      this.colors = parseColorArray(data.colors);
      this.frames = parseNumberArray(data.frames);
      this.frameStyle = FRAME_STYLES.indexOf(data.frameStyle) ? FRAME_STYLES.indexOf(data.frameStyle) : 0;
      this.velocity = parseVec3(data.velocity);
      this.acceleration = parseVec3(data.acceleration);
      this.radialVelocity = parseNumber(data.radialVelocity);
      this.radialAcceleration = parseNumber(data.radialAcceleration);
      this.angularVelocity = parseVec3(data.angularVelocity);
      this.angularAcceleration = parseVec3(data.angularAcceleration);
      this.orbitalVelocity = parseNumber(data.orbitalVelocity);
      this.orbitalAcceleration = parseNumber(data.orbitalAcceleration);

      if (SPAWN_GEOMETRY_FUNCTIONS[data.spawnShape] && data.spawnGeometry !== oldData.spawnGeometry) {
        this.spawnGeometryFunction = SPAWN_GEOMETRY_FUNCTIONS[data.spawnShape];
        this.spawnOffsets = this.calcSpawnOffsetsFromGeometry(data.spawnGeometry || this.el);
      } else {
        this.spawnGeometryFunction = undefined;
        this.spawnOffsets = undefined;
      }

      if (data.textureFrame.x > MAX_FRAME || data.textureFrame.y > MAX_FRAME || data.textureFrame.x < 0 || data.textureFrame.y < 0) {
        error(this, `textureFrame (${data.textureFrame.x},${data.textureFrame.y}) is expected in the range (0,${MAX_FRAME}) x (0,${MAX_FRAME})`);
      }

      if (data.textureFrame.x !== ~~data.textureFrame.x || data.textureFrame.y !== ~~data.textureFrame.y) {
        error(this, `textureFrame must be an integer value`);
      }

      const particleSystem = this.particleSystem;
      if (particleSystem) {
        this.maxLifeTime = getMaximum(this.lifeTime);

        if (this.startIndex) {
          particleSystem.releaseParticles(this.startIndex);
          this.startIndex = undefined;
          this.endIndex = undefined;
        }

        this.startIndex = particleSystem.allocateParticles(data.count);
        if (this.startIndex !== undefined) {
          this.endIndex = this.startIndex + data.count;
        }

        this.enabled = this.data.enabled;

        this.createParticles(0);

      } else {
        this.enabled = false;
      }
    },

    createParticles(t) {
      const data = this.data;
      const loopTime = Math.max( randomize(this.loopTime), getMaximum(this.lifeTime) );
      const spawnDelta = loopTime/data.count;

      this.el.object3D.updateMatrixWorld();
      
      for (let i = this.startIndex; i < this.endIndex; i++) {
        this.spawn(i, t + i*spawnDelta, loopTime);
      }

      this.particleSystem.needsUpdate();
    },

    spawn: (function () {
      const offset = new THREE.Vector3();

      return function spawn(i, t, loopTime) {
        const data = this.data;

        const scales = randomizeArray(this.scales);
        const rotations = randomizeArray(this.rotations);
        const colors = randomizeArray(this.colors);
        const opacities = randomizeArray(this.opacities);
        const frames = randomizeArray(this.frames);
        const lifeTime = randomize(this.lifeTime);
        const velocity = randomize(this.velocity);
        const acceleration = randomize(this.acceleration);
        const radialVelocity = randomize(this.radialVelocity);
        const radialAcceleration = randomize(this.radialAcceleration);
        const angularVelocity = randomize(this.angularVelocity);
        const angularAcceleration = randomize(this.angularAcceleration);
        const orbitalVelocity = randomize(this.orbitalVelocity);
        const orbitalAcceleration = randomize(this.orbitalAcceleration);

        if (this.spawnGeometryFunction && this.spawnOffsets) {
          this.spawnGeometryFunction(this.spawnOffsets, offset);
        } else {
          offset.copy(VEC3_ZERO);
        }
    
        const particleSystem = this.particleSystem;
        particleSystem.setMatrixAt(i, this.el.object3D.matrixWorld);
        particleSystem.setPositionAt(i, offset.x, offset.y, offset.z);
        particleSystem.setScalesAt(i, scales);
        particleSystem.setColorsAt(i, colors);
        particleSystem.setRotationsAt(i, rotations);
        particleSystem.setOpacitiesAt(i, opacities);

        const startFrame = frames.length > 0 ? frames[0] : 0;
        const endFrame = frames.length > 1 ? frames[1] : startFrame;
        particleSystem.setFrameAt(i, this.frameStyle, startFrame, endFrame, data.textureFrame.x, data.textureFrame.y);

        particleSystem.setTimingsAt(i, t, lifeTime, loopTime);
        particleSystem.setVelocityAt(i, velocity.x, velocity.y, velocity.z, radialVelocity);
        particleSystem.setAccelerationAt(i, acceleration.x, acceleration.y, acceleration.z, radialAcceleration);
        particleSystem.setAngularVelocityAt(i, angularVelocity.x, angularVelocity.y, angularVelocity.z, orbitalVelocity);
        particleSystem.setAngularAccelerationAt(i, angularAcceleration.x, angularAcceleration.y, angularAcceleration.z, orbitalAcceleration);
      }
    })(),

    calcSpawnOffsetsFromGeometry(geometry) {
      if (!geometry || !geometry.object3D) {
        return undefined
      }

      let worldPositions = [];
      const pos = new THREE.Vector3();
      const inverseObjectMatrix = new THREE.Matrix4();
      const mat4 = new THREE.Matrix4();

      geometry.object3D.updateMatrixWorld();
      inverseObjectMatrix.getInverse(geometry.object3D.matrixWorld);

      geometry.object3D.traverse(node => {
        if (!node.geometry || !node.geometry.getAttribute) {
          return
        }

        const position = node.geometry.getAttribute("position");
        if (!position || position.itemSize !== 3) {
          return
        }

        for (let i = 0; i < position.count; i++) {
          mat4.copy(node.matrixWorld).multiply(inverseObjectMatrix);
          pos.fromBufferAttribute(position, i).applyMatrix4(mat4);
          worldPositions.push(pos.x, pos.y, pos.z);
        }
      });

      return Float32Array.from(worldPositions)
    },

  });

  const MAX_FRAME$1 = 64;
  const WHITE_TEXTURE$1 = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat);
  WHITE_TEXTURE$1.needsUpdate = true;

  function toLowerCase$5(x) { return x.toLowerCase() }

  const BLENDING_MAP = {
    "none": THREE.NoBlending,
    "normal": THREE.NormalBlending,
    "additive": THREE.AdditiveBlending,
    "subtractive": THREE.SubtractiveBlending,
    "multiply": THREE.MultiplyBlending,
  };

  AFRAME.registerSystem('simple-particles', {
    schema: {
      enabled: { default: true }, // this will force warnings if the user tries to add the component version of simple-particles to the a-scene
    },

    init() {
      this.simpleParticles = {};
    },

    registerParticles(name, ptr) {
      if (this.simpleParticles[name]) {
        error(`name '${name}' already in use`);
      } else {
        this.simpleParticles[name] = ptr;
      }
    },

    unregisterParticles(name, ptr) {
      if (this.simpleParticles[name] !== ptr) {
        error(`could not find particles '${name}'`);
      } else {
        this.simpleParticles[name] = undefined;
      }
    },

    getParticles(name) {
      return this.simpleParticles[name]
    }
  });



  AFRAME.registerComponent('simple-particles', {
    schema: {
      name: { default: "particles" },
      count: { default: 1000 }, // cannot be changed at runtime
      texture: { type: 'map' },
      textureFrame: { type: 'vec2', default: {x: 1, y: 1} },
      particleType: { default: 'particle', oneOf: ['particle', 'ribbon'] },
      particleSize: { default: 10 },
      transparent: { default: false },
      alphaTest: { default: 0 },
      depthWrite: { default: true },
      depthTest: { default: true },
      blending: { default: "normal", oneOf: ["none", "normal", "additive", "subtractive", "multiply"], parse: toLowerCase$5 },   
      fog: { default: true },
      usePerspective: { default: true },
      useLinearMotion: { default: true },
      useOrbitalMotion: { default: true },
      useAngularMotion: { default: true },
      useRadialMotion: { default: true },
      useFramesOrRotation: { default: true },
    },

    multiple: true,

    init() {
      this.mesh = undefined;
      this.material = undefined;
      this.geometry = undefined;
      this.system.registerParticles(this.data.name, this);
      this.blocks = blocks(this.data.count);
      this.createMesh(this.data.count);
    },

    remove() {
      this.system.unregisterParticles(this.data.name, this);
    },

    update(oldData) {
      const data = this.data;

      if (data.texture !== oldData.texture) {
        this.loadTexture(data.texture);
      }

      if (data.textureFrame.x > MAX_FRAME$1 || data.textureFrame.y > MAX_FRAME$1 || data.textureFrame.x < 1 || data.textureFrame.y < 1) {
        error(this, `textureFrame (${data.textureFrame.x},${data.textureFrame.y}) is expected in the range (1,${MAX_FRAME$1}) x (1,${MAX_FRAME$1})`);
      }

      if (data.textureFrame.x !== ~~data.textureFrame.x || data.textureFrame.y !== ~~data.textureFrame.y) {
        error(this, `textureFrame must be an integer value`);
      }

      this.updateMaterial(this.material);
    },

    tick(time, deltaTime) {
      if (this.material) {
        this.material.uniforms.t.value = time/1000;
      }
    },

    createMesh(particleCount) {
      this.geometry = new THREE.BufferGeometry();
      this.updateGeometry(this.geometry, particleCount);

      this.material = new THREE.RawShaderMaterial({
        uniforms: {
          map: { type: 't', value: WHITE_TEXTURE$1 },
          textureFrame: { value: new THREE.Vector2(1,1) },
          particleSize: { value: 10 },
          usePerspective: { value: 1 },
          t: { value: 0 },

          fogDensity: { value: 0.00025 },
          fogNear: { value: 1 },
          fogFar: { value: 2000 },
          fogColor: { value: new THREE.Color( 0xffffff ) }
        },

        fragmentShader: SIMPLE_PARTICLE_FRAGMENT, //POINTS_FRAGMENT, //SIMPLE_PARTICLE_FRAGMENT,
        vertexShader: SIMPLE_PARTICLE_VERTEX, //POINTS_VERTEX, //SIMPLE_PARTICLE_VERTEX,

        defines: {},
      });

      this.mesh = new THREE.Points(this.geometry, this.material);
      this.mesh.frustumCulled = false;

      this.el.sceneEl.object3D.add(this.mesh);
    },

    updateGeometry(geometry, particleCount) {
      const NUM_KEYFRAMES = 3;
      geometry.addAttribute("row1", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4));
      geometry.addAttribute("row2", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4));
      geometry.addAttribute("row3", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4));
      geometry.addAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(particleCount*3), 3));
      geometry.addAttribute("scales", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES));
      geometry.addAttribute("rotations", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES));
      geometry.addAttribute("colors", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES)); // rgb is packed into a single float
      geometry.addAttribute("opacities", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES).fill(1), NUM_KEYFRAMES));
      geometry.addAttribute("frame", new THREE.Float32BufferAttribute(new Float32Array(particleCount*2), 2));
      geometry.addAttribute("timings", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4));
      geometry.addAttribute("velocity", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)); // linearVelocity (xyz) + radialVelocity
      geometry.addAttribute("acceleration", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)); // linearAcceleration (xyz) + radialAcceleration
      geometry.addAttribute("angularvelocity", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)); // angularVelocity (xyz) + orbitalVelocity
      geometry.addAttribute("angularacceleration", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)); // angularAcceleration (xyz) + orbitalAcceleration

      const identity = new THREE.Matrix4();
      for (let i = 0; i < particleCount; i++) {
        this.setMatrixAt(i, identity);
      }
    },

    updateMaterial(material) {
      const data = this.data;
      // material.uniforms.map.value = data.texture
      material.uniforms.particleSize.value = data.particleSize;
      material.uniforms.textureFrame.value.x = data.textureFrame.x;
      material.uniforms.textureFrame.value.y = data.textureFrame.y;
      material.uniforms.usePerspective.value = data.usePerspective ? 1 : 0;

      material.transparent = data.transparent;
      material.alphaTest = data.alphaTest;
      material.blending = BLENDING_MAP[data.blending];
      material.fog = data.fog;
      material.depthWrite = data.depthWrite;
      material.depthTest = data.depthTest;

      const defines = {};
      if (data.useAngularMotion) defines.USE_ANGULAR_MOTION = true;
      if (data.useRadialMotion) defines.USE_RADIAL_MOTION = true;
      if (data.useOrbitalMotion) defines.USE_ORBITAL_MOTION = true;
      if (data.useLinearMotion) defines.USE_LINEAR_MOTION = true;
      if (data.useFramesOrRotation) defines.USE_FRAMES_OR_ROTATION = true;
      if (data.fog) defines.USE_FOG = true;

      material.defines = defines;
      
      material.needsUpdate = true;
    },

    loadTexture(filename) {
      if (filename) {
        let materialSystem = this.el.sceneEl.systems["material"];
        materialSystem.loadTexture(filename, {src: filename}, (texture) => {
          // if (this.isRibbon()) {
          //   texture.wrapS = THREE.RepeatWrapping // needed by ribbonUVMultipler
          // }
          this.material.uniforms.map.value = texture;          
        });
      } else {
        this.material.uniforms.map.value = WHITE_TEXTURE$1;
      }
    },

    setMatrixAt(i, mat4) {
      const m = mat4.elements;
      const row1 = this.geometry.getAttribute("row1");
      const row2 = this.geometry.getAttribute("row2");
      const row3 = this.geometry.getAttribute("row3");
      row1.setXYZW(i, m[0], m[4], m[ 8], m[12]);
      row2.setXYZW(i, m[1], m[5], m[ 9], m[13]);
      row3.setXYZW(i, m[2], m[6], m[10], m[14]);
    },

    setPositionAt(i, x, y, z) {
      const position = this.geometry.getAttribute("position");
      if (Array.isArray(x)) {
        z = x[2];
        y = x[1];
        x = x[0];
      } else if (typeof x === "object") {
        z = x.z;
        y = x.y;
        x = x.x;
      }

      position.setXYZ(i, x, y, z);
    },

    setColorsAt(i, colorArray) {
      function pack3Floats(a, b, c) {
        return ~~(a*255)/256 + ~~(b*255)/65536 + ~~(c*255)/16777216
      }

      const colors = this.geometry.getAttribute("colors");
      const color0 = colorArray[0], color1 = colorArray[1], color2 = colorArray[2];
      let packedR, packedG, packedB;

      switch (colorArray.length) {
        case 0: 
          packedR = packedG = packedB = pack3Floats(1, 1, 1); // white
          break

        case 1:
          packedR = pack3Floats(color0.r, color0.r, color0.r);
          packedG = pack3Floats(color0.g, color0.g, color0.g);
          packedB = pack3Floats(color0.b, color0.b, color0.b);
          break

        case 2:
          packedR = pack3Floats(color0.r, .5*(color0.r + color1.r), color1.r);
          packedG = pack3Floats(color0.g, .5*(color0.g + color1.g), color1.g);
          packedB = pack3Floats(color0.b, .5*(color0.b + color1.b), color1.b);
          break

        default:
          packedR = pack3Floats(color0.r, color1.r, color2.r);
          packedG = pack3Floats(color0.g, color1.g, color2.g);
          packedB = pack3Floats(color0.b, color1.b, color2.b);
          break
      }

      colors.setXYZ(i, packedR, packedG, packedB);
    },

    setOpacitiesAt(i, opacityArray) {
      const opacities = this.geometry.getAttribute("opacities");
      this.setKeyframesAt(opacities, i, opacityArray, 1);
    },

    setTimingsAt(i, spawnTime, lifeTime, loopTime, seed = Math.random() ) {
      const timings = this.geometry.getAttribute("timings");
      timings.setXYZW(i, spawnTime, lifeTime, loopTime, seed);
    },

    setFrameAt(i, frameStyle, startFrame, endFrame, width = 0, height = 0) {
      width = width || this.data.textureFrame.x;
      height = height || this.data.textureFrame.y;

      const frame = this.geometry.getAttribute("frame");
      const packA = ~~(width) + .015625*~~(height) + .000003814697265625*~~(startFrame);
      const packB = frameStyle + .000003814697265625*~~(endFrame);
      frame.setXY(i, packA, packB);
    },

    setScalesAt(i, scaleArray) {
      const scales = this.geometry.getAttribute("scales");
      this.setKeyframesAt(scales, i, scaleArray, 1);
    },

    setRotationsAt(i, rotationArray) {
      const rotations = this.geometry.getAttribute("rotations");
      this.setKeyframesAt(rotations, i, rotationArray, 0);
    },

    setVelocityAt(i, x, y, z, radial = 0) {
      const velocity = this.geometry.getAttribute("velocity");
      velocity.setXYZW(i, x, y, z, radial);
    },

    setAccelerationAt(i, x, y, z, radial = 0) {
      const acceleration = this.geometry.getAttribute("acceleration");
      acceleration.setXYZW(i, x, y, z, radial);
    },

    setAngularVelocityAt(i, x, y, z, orbital = 0) {
      const angularvelocity = this.geometry.getAttribute("angularvelocity");
      angularvelocity.setXYZW(i, x, y, z, orbital);
    },

    setAngularAccelerationAt(i, x, y, z, orbital = 0) {
      const angularacceleration = this.geometry.getAttribute("angularacceleration");
      angularacceleration.setXYZW(i, x, y, z, orbital);
    },

    setKeyframesAt(attribute, i, valueArray, defaultValue) {
      const x = valueArray[0], y = valueArray[1], z = valueArray[2];
      switch (valueArray.length) {
        case 0: attribute.setXYZ(i, defaultValue, defaultValue, defaultValue); break
        case 1: attribute.setXYZ(i, x, x, x); break
        case 2: attribute.setXYZ(i, x, .5*(x+y), y); break
        default: attribute.setXYZ(i, x, y, z); break
      }
    },

    needsUpdate() {
      this.geometry.getAttribute("row1").needsUpdate = true;
      this.geometry.getAttribute("row2").needsUpdate = true;
      this.geometry.getAttribute("row3").needsUpdate = true;
      this.geometry.getAttribute("position").needsUpdate = true;
      this.geometry.getAttribute("scales").needsUpdate = true;
      this.geometry.getAttribute("colors").needsUpdate = true;
      this.geometry.getAttribute("opacities").needsUpdate = true;
      this.geometry.getAttribute("rotations").needsUpdate = true;
      this.geometry.getAttribute("timings").needsUpdate = true;
      this.geometry.getAttribute("frame").needsUpdate = true;
      this.geometry.getAttribute("velocity").needsUpdate = true;
      this.geometry.getAttribute("acceleration").needsUpdate = true;
    },

    multipleNeedsUpdate(attributes) {
      for (let attribute of attributes) {
        this.needsUpdate(attribute);
      }
    },

    allocateParticles(count) {
      return this.blocks.allocate(count)
    },

    releaseParticles(index) {
      const count = this.blocks.release(index);
      if (count > 0) {
        const scales = this.geometry.getAttribute("scales");
        for (let i = index; i < index + count; i++) {
          scales.setXYZ(i, 0, 0, 0); // deactivate the particle
        }
      }

      return count
    }
  });

  const SIMPLE_PARTICLE_VERTEX = `
precision highp float;
precision highp int;

attribute vec4 row1;
attribute vec4 row2;
attribute vec4 row3;
attribute vec3 position;
attribute vec3 scales;
attribute vec3 rotations;
attribute vec3 colors;
attribute vec3 opacities;
attribute vec4 timings;
attribute vec2 frame;
attribute vec4 velocity;
attribute vec4 acceleration;
attribute vec4 angularvelocity;
attribute vec4 angularacceleration;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 textureFrame;
uniform float particleSize;
uniform float usePerspective;
uniform float t;

varying mat3 vUvTransform;
varying vec4 vParticleColor;
varying vec2 vUv;
varying float vFogDepth;

float pseudoRandom( const float seed )
{
  return mod( 1664525.*seed + 1013904223., 4294967296. )/4294967296.;
}

vec3 unpackFrame( float pack )
{
  float y = fract( pack ) * 64.;
  return floor( vec3( pack, y, fract( y ) * 4096. ) );
}

vec3 unpackRGB( float pack )
{
  vec3 enc = fract( pack * vec3( 1., 256., 65536. ) );
  enc -= enc.yzz * vec3( 1./256., 1./256., 0. );
  return enc;
}

float interpolate( const vec3 keys, const float r )
{
  float k = r*2.;
  return k < 1. ? mix( keys.x, keys.y, k ) : mix( keys.y, keys.z, k - 1. );
}

// assumes euler order is YXZ
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

void main()
{
  float spawnTime = timings.x;
  float lifeTime = timings.y;
  float loopTime = timings.z;
  float seed = timings.w;
  float age = mod( t - spawnTime, loopTime );
  float timeRatio = age / lifeTime;

  float scale = interpolate( scales, timeRatio );
  float rotation = interpolate( rotations, timeRatio );
  float opacity = interpolate( opacities, timeRatio );
  vec3 color = vec3(
    interpolate( unpackRGB( colors.x ), timeRatio ),
    interpolate( unpackRGB( colors.y ), timeRatio ),
    interpolate( unpackRGB( colors.z ), timeRatio )
  );

  mat4 particleMatrix = mat4(
    vec4( row1.x, row2.x, row3.x, 0. ),
    vec4( row1.y, row2.y, row3.y, 0. ),
    vec4( row1.z, row2.z, row3.z, 0. ),
    vec4( row1.w, row2.w, row3.w, 1. )
  );

  float distance = length( position );
  vec3 direction = distance == 0. ? position : position / distance;

#if defined(USE_RADIAL_MOTION)
  distance += ( .5 * acceleration.w * age + velocity.w ) * age;
#endif

#if defined(USE_ANGULAR_MOTION)
  if ( length( angularacceleration.xyz ) > 0. || length( angularvelocity.xyz ) > 0. )
  {
    vec3 angularMotion = ( .5 * angularacceleration.xyz * age + angularvelocity.xyz ) * age;
    direction = applyQuaternion( direction, eulerToQuaternion( angularMotion ) );
  }
#endif

#if defined(USE_ORBITAL_MOTION)
  if ( angularacceleration.w != 0. || angularvelocity.w != 0. ) 
  {
    float orbitalMotion = ( .5 * angularacceleration.w * age + angularvelocity.w ) * age;
    vec3 axis;
    axis.x = pseudoRandom(spawnTime + loopTime);
    axis.y = pseudoRandom(axis.x);
    axis.z = pseudoRandom(axis.y);
    normalize(axis);
    direction = applyQuaternion( direction, axisAngleToQuaternion( axis, orbitalMotion ) );
  }
#endif

  vec3 motion = direction * distance;
  
#if defined(USE_LINEAR_MOTION)
  motion += ( .5 * acceleration.xyz * age + velocity.xyz ) * age;
#endif

  vec4 mvPosition = modelViewMatrix * particleMatrix * vec4( motion, 1. );

  vParticleColor = vec4( color, opacity );
  vUv = vec2( 0. );
  vFogDepth = -mvPosition.z;

  vUvTransform = mat3( 1. );

#if defined(USE_FRAMES_OR_ROTATION)

  vec3 frameInfoA = unpackFrame( frame.x );
  vec3 frameInfoB = unpackFrame( frame.y );

  float frameWidth = frameInfoA.x;
  float frameHeight = frameInfoA.y;
  float startFrame = frameInfoA.z;
  float endFrame = frameInfoB.z;
  float frameStyle = frameInfoB.x;
  float invFrameWidth = 1./frameWidth;
  float invFrameHeight = 1./frameHeight;
  float numFrames = endFrame - startFrame + 1.;
  float currentFrame = floor( mix( startFrame, endFrame + .99999, timeRatio ) );

  currentFrame = frameStyle == 0. ? currentFrame 
    : frameStyle == 1. ? ( floor( pseudoRandom( currentFrame * 6311. + seed ) * numFrames ) + startFrame  )
    : ( floor( seed * numFrames ) + startFrame );

  float tx = mod( currentFrame, frameWidth ) * invFrameWidth;
  float ty = 1. - floor( currentFrame * invFrameWidth ) * invFrameHeight;
  float sx = invFrameWidth;
  float sy = invFrameHeight;
  float cx = .5 * sx;
  float cy = -.5 * sy;
  float c = cos( rotation );
  float s = sin( rotation );

  mat3 uvrot = mat3( vec3( c, -s, 0. ), vec3( s, c, 0. ), vec3( 0., 0., 1.) );
  mat3 uvtrans = mat3( vec3( 1., 0., 0. ), vec3( 0., 1., 0. ), vec3( tx + cx, ty + cy, 1. ) );
  mat3 uvscale = mat3( vec3( sx, 0., 0. ), vec3( 0., sy, 0. ), vec3( 0., 0., 1.) );
  mat3 uvcenter = mat3( vec3( 1., 0., 0. ), vec3( 0., 1., 0. ), vec3( -cx / sx, cy / sy, 1. ) );  

  vUvTransform = uvtrans * uvscale * uvrot * uvcenter;

#endif // USE_FRAMES_OR_ROTATION

#if defined(USE_RIBBON)
#else
  gl_PointSize = scale * particleSize * mix( 1., 1. / - mvPosition.z, usePerspective );
#endif // USE_RIBBON

  gl_Position = projectionMatrix * mvPosition;

  if (scale <= 0. || timeRatio < 0. || timeRatio > 1. )
  {
    gl_Position.w = -2.; // don't draw
  }
}`;

  const SIMPLE_PARTICLE_FRAGMENT = `
precision highp float;
precision highp int;

uniform sampler2D map;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying mat3 vUvTransform;
varying vec4 vParticleColor;
varying vec2 vUv;
varying float vFogDepth;

void main()
{

#if defined(USE_RIBBON)
  vec2 uv = ( vUvTransform * vec3( vUv, 1. ) ).xy;
#else
  vec2 uv = ( vUvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1. ) ).xy;
#endif // USE_RIBBON

  vec4 diffuseColor = vParticleColor;

  vec4 mapTexel = texture2D( map, uv );
  // diffuseColor *= mapTexelToLinear( mapTexel );
  diffuseColor *= mapTexel;

#if defined(ALPHATEST)
  if ( diffuseColor.a < ALPHATEST ) {
    discard;
  }
#endif // ALPHATEST

  gl_FragColor = diffuseColor;

#if defined(USE_FOG)
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );

  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif // USE_FOG
}`;

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
  const PARAMS_LENGTH = 5; // 0->4

  const MODEL_MESH = "mesh";
  const VERTS_PER_RIBBON = 2;
  const INDICES_PER_RIBBON = 6;

  const RANDOM_REPEAT_COUNT = 131072; // random numbers will start repeating after this number of particles

  // @ts-ignore
  const degToRad$3 = THREE.Math.degToRad;

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
  const PARTICLE_ORDER_STRINGS = ["newest", "oldest", "any"];
  const AXES_NAMES = ["x", "y", "z"];

  // Bring all sub-array elements into a single array e.g. [[1,2],[[3],4],5] => [1,2,3,4,5]
  const flattenDeep = arr1 => arr1.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);

  // Convert a vector range string into an array of elements. def defines the default elements for each vector
  const parseVecRange = (str, def) => {
    let parts = str.split("->").map(a => a.trim().split(" ").map(b => {
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
      let parts = a.split("->");
      if (parts.length === 1) parts[1] = parts[0]; // if there is no second part then copy the first part
      parts.length = 2;
      return parts.map(b => new THREE.Color(b.trim())) 
    }) )
  };

  function toLowerCase$6(x) { return x.toLowerCase() }

  // console.assert(AFRAME.utils.deepEqual(parseVecRange("", [1,2,3]), [1,2,3,1,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5", [1,2,3]), [5,2,3,5,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6", [1,2,3]), [5,6,3,5,6,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6 7 8", [1,2,3]), [5,6,7,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("8 9->10", [1,2,3]), [8,9,3,10,2,3]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("->5 6 7", [1,2,3]), [1,2,3,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("2 3 4->5 6 7", [1,2,3]), [2,3,4,5,6,7]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRange("5 6 7->", [1,2,3]), [5,6,7,1,2,3]))

  // console.assert(AFRAME.utils.deepEqual(parseVecRangeArray("5 6 7->,9->10 11 12", [1,2,3]), [5,6,7,1,2,3,9,2,3,10,11,12]))
  // console.assert(AFRAME.utils.deepEqual(parseVecRangeArray("1,2,,,3", [10]), [1,1,2,2,10,10,10,10,3,3]))

  // console.assert(AFRAME.utils.deepEqual(parseColorRangeArray("black->red,blue,,#ff0->#00ffaa").map(a => a.getHexString()), ["000000","ff0000","0000ff","0000ff","ffffff","ffffff","ffff00","00ffaa"]))

  let WHITE_TEXTURE$2 = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat);
  WHITE_TEXTURE$2.needsUpdate = true;

  const BLENDING_MAP$1 = {
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
      spawnType: { default: "continuous", oneOf: ["continuous", "burst"], parse: toLowerCase$6 },
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
      ribbonShape: { default: "flat", oneOf: ["flat", "taperin", "taperout", "taper"], parse: toLowerCase$6 },
      ribbonUVType: { default: "overtime", oneOf: UV_TYPE_STRINGS, parse: toLowerCase$6 },
      emitterColor: { type: "color" },

      lifeTime: { default: "1" },
      position: { default: "0 0 0" },
      velocity: { default: "0 0 0" },
      acceleration: { default: "0 0 0" },
      radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circlexz"], parse: toLowerCase$6 },
      radialPosition: { default: "0" },
      radialVelocity: { default: "0" },
      radialAcceleration: { default: "0" },
      angularVelocity: { default: "0 0 0" },
      angularAcceleration: { default: "0 0 0" },
      orbitalVelocity: { default: "0" },
      orbitalAcceleration: { default: "0" },
      scale: { default: "1" },
      color: { default: "white", parse: toLowerCase$6 },
      rotation: { default: "0" }, // if rotating textureFrames important to have enough space so overlapping parts of frames are blank (circle of sqrt(2) around the center of the frame will be viewable while rotating)
      opacity: { default: "1" },
      velocityScale: { default: 0 },
      velocityScaleMinMax: { type: "vec2", default: {x: 0, y: 3} },
      drag: { default: 0 },
      destination: { type: "selector" },
      destinationOffset: { default: "0 0 0" },
      destinationWeight: { default: "0" },

      events: { default: "" },
      enabled: { default: true },
      emitterTime: { default: 0 },
      model: { type: "selector" },
      modelFill: { default: "triangle", oneOf: ["triangle", "edge", "vertex"], parse: toLowerCase$6 },
      direction: { default: "forward", oneOf: ["forward", "backward"], parse: toLowerCase$6 },
      particleOrder: { default: "any", oneOf: PARTICLE_ORDER_STRINGS },
      ribbonUVMultiplier: { default: 1 },
      materialSide: { default: "double", oneOf: ["double", "front", "back"], parse: toLowerCase$6 },
      screenDepthOffset: { default: 0 },
      alphaTest: { default: 0 },
      fog: { default: true },
      depthWrite: { default: false },
      depthTest: { default: true },
      blending: { default: "normal", oneOf: ["none", "normal", "additive", "subtractive", "multiply"], parse: toLowerCase$6 },
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
      this.paused = false; // track paused because isPlaying will be false on the first frame

      // this.useTransparent = false
      this.textureFrames = new Float32Array(4); // xy is TextureFrame, z is TextureCount, w is TextureLoop
      this.offset = new Float32Array(2*4); // xyz is position, w is radialPosition
      this.velocity = new Float32Array(2*4); // xyz is velocity, w is radialVelocity
      this.acceleration = new Float32Array(2*4); // xyz is acceleration, w is radialAcceleration
      this.angularVelocity = new Float32Array(2*4); // xyz is angularVelocity, w is lifeTime
      this.angularAcceleration = new Float32Array(2*4); // xyz is angularAcceleration
      this.orbital = new Float32Array(2*2); // x is orbitalVelocity, y is orbitalAcceleration
      this.colorOverTime; // color is xyz and opacity is w. created in update()
      this.rotationScaleOverTime; // x is rotation, y is scale. created in update()
      this.params = new Float32Array(5*4); // see ..._PARAM constants
      this.velocityScale = new Float32Array(3); // x is velocityScale, y is velocityScaleMinMax.x and z is velocityScaleMinMax.y
      this.emitterColor = new THREE.Vector3(); // use vec3 for color
      this.destination = new Float32Array(2*4); // range value, xyz is destinationEntity.position + destinationOffset, w is destinationWeight
      this.destinationOffset; // parsed value for destinationOffset, this will be blended into destination
      this.destinationWeight; // parsed value for destinationWeight
      this.nextID = 0;
      this.nextTime = 0;
      this.startDisabled = !this.data.enabled || !!this.data.events; // prevents the tick, and doesn't spawn any particles
      this.manageIDs = false;

      this.params[ID_PARAM] = -1; // unmanaged IDs

      this.eventListener = scopedEvents( this.el, this.onEvent.bind(this) );
      this.delayClock = basicClock();
    },

    remove() {
      if (this.mesh) {
        this.el.removeObject3D(this.mesh.name);
      }

      if (this.data.model) {
        this.data.model.removeEventListener("object3dset", this.handleObject3DSet);
      }

      this.eventListener.remove();
      this.delayClock.clearAllTimers();
    },

    update(oldData) {
      const data = this.data;
      
      let boundsDirty = data.particleSize !== oldData.particleSize;
      let overTimeDirty = false;

      // can only change overTimeSlots while paused, as it will rebuild the shader (see updateDefines())
      if (data.overTimeSlots !== oldData.overTimeSlots && !this.isPlaying) {
        this.overTimeArrayLength = this.data.overTimeSlots*2 + 1; // each slot represents 2 glsl array elements pluse one element for the length info
        this.colorOverTime = new Float32Array(4*this.overTimeArrayLength); // color is xyz and opacity is w
        this.rotationScaleOverTime = new Float32Array(2*this.overTimeArrayLength); // x is rotation, y is scale
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
        this.material.blending = BLENDING_MAP$1[data.blending];
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

      if (data.enabled && this.startDisabled && !data.events) {
        this.startDisabled = false;
      }

      if (data.model !== oldData.model && data.model && "getObject3D" in data.model) {
        if (oldData.model) { oldData.model.removeEventListener("object3dset", this.handleObject3DSet); }
        this.updateModelMesh(data.model.getObject3D(MODEL_MESH));
        if (data.model) { data.model.addEventListener("object3dset", this.handleObject3DSet); }
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
      this.manageIDs = this.manageIDs || !data.enabled || !!data.events || data.source || typeof this.el.getDOMAttribute(this.attrName).enabled !== "undefined" || data.model || data.delay > 0;

      // call loadTexture() after createMesh() to ensure that the material is available to accept the texture
      if (data.texture !== oldData.texture) {
        this.loadTexture(data.texture);
      }

      if (data.events !== oldData.events) {
        this.eventListener.set(data.events);
      }
    },

    tick(time, deltaTime) {
      const data = this.data;

      if (this.startDisabled) { return }

      if (deltaTime > 100) deltaTime = 100; // ignore long pauses
      const dt = deltaTime/1000; // dt is in seconds

      if (data.enabled) { this.delayTime -= dt; }
      if (this.delayTime >= 0) { return }

      if (!data.model || this.modelVertices) {
        this.emitterTime += dt;
        this.params[TIME_PARAM] = this.emitterTime;

        if (this.geometry && this.manageIDs) {
          this.spawnParticles(this.emitterTime);
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
      this.eventListener.remove();
      this.delayClock.pause();
    },

    play() {
      this.paused = false;
      this.enableEditorObject(false);
      this.eventListener.add();
      this.delayClock.resume();
    },

    onEvent() {
      const self = this;
      const data = this.data;

      this.delayClock.startTimer( data.delay, 
      () => {
        self.emitterTime = data.emitterTime;
        self.nextTime = 0;
        self.nextID = 0;
        self.delayTime = 0;
        self.startDisabled = false;
      } );
    },

    handleObject3DSet(e) {
      if (e.target === this.data.model && e.detail.type === MODEL_MESH) {
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
        this.material.uniforms.map.value = WHITE_TEXTURE$2;
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
          map: { type: "t", value: WHITE_TEXTURE$2 },
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
        blending: BLENDING_MAP$1[data.blending],
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
        //this.mesh.drawMode = THREE.TriangleStripDrawMode
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
        this.rotationScaleOverTime[k] = degToRad$3(rotation[i]); // glsl rotationScaleOverTime[1..].x
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
        this[uniformAttr][j++] = degToRad$3(vecRange[i++]); // x
        this[uniformAttr][j++] = degToRad$3(vecRange[i++]); // y
        this[uniformAttr][j++] = degToRad$3(vecRange[i++]); // z
        j++; // skip the w
      }
    },

    updateAngularVec2PartRange(vecData, def, uniformAttr, part) {
      const vecRange = parseVecRange(vecData, def);
      this[uniformAttr][part] = degToRad$3(vecRange[0]);
      this[uniformAttr][part + 2] = degToRad$3(vecRange[1]);
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

        } else {
          for (let i = 0; i < n; i++) {
            vertexIDs[i] = i;
          }
        }

        this.geometry.setAttribute("vertexID", new THREE.Float32BufferAttribute(vertexIDs, 1)); // gl_VertexID is not supported, so make our own id
        this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n*3), 3));

        if (this.data.source) {
          this.geometry.setAttribute("quaternion", new THREE.Float32BufferAttribute(new Float32Array(n*4), 4));
        }

        // the ribbons are presented as indexed triangles (triangle strips are no longer supported), with
        // 2 verts and 6 indices per particle.  To ensure each particle ribbon is not connected to other ribbons we place each
        // one in a group containing only the verts for that ribbon
        if (this.isRibbon()) {
          this.geometry.clearGroups();

          const numParticles = this.count/VERTS_PER_RIBBON/this.trailCount;
          const indicesPerParticle = (this.trailCount - 1)*INDICES_PER_RIBBON;
          const vertsPerParticle = this.trailCount*VERTS_PER_RIBBON;
          const numIndices = numParticles*indicesPerParticle;
          const indices = new Array(numIndices);

          for (let i = 0, particle = 0; i < numIndices; i += indicesPerParticle, particle++) {
            this.geometry.addGroup(i, indicesPerParticle, 0);

            for (let j = 0, vertex = 0; j < indicesPerParticle; j += INDICES_PER_RIBBON, vertex += VERTS_PER_RIBBON) {
              const startVertex = particle*vertsPerParticle + vertex;
              indices[i+j] = startVertex;
              indices[i+j+1] = startVertex + 2;
              indices[i+j+2] = startVertex + 3;
              indices[i+j+3] = startVertex;
              indices[i+j+4] = startVertex + 3;
              indices[i+j+5] = startVertex + 1;
            }
    
          }

          this.geometry.setIndex( indices );
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

    spawnParticles: (function() {
      let position = new THREE.Vector3();
      let quaternion = new THREE.Quaternion();
      let scale = new THREE.Vector3();
      let modelPosition = new THREE.Vector3();
      let m4 = new THREE.Matrix4();

      return function spawnParticles(emitterTime) {
        const data = this.data;
        const n = this.count;

        // for particles using a source the CPU sets the instancePosition and instanceQuaternion
        // of the new particles to the current object3D position/orientation, and tells the GPU
        // the ID of last emitted particle (this.params[ID_PARAM])
        const spawnRate = this.data.spawnRate;
        const isBurst = data.spawnType === "burst";
        const spawnDelta = isBurst ? 0 : 1/spawnRate; // for burst particles spawn everything at once
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

        let modelFillFn = randomPointInTriangle$1;
        switch (data.modelFill) {
          case "edge": modelFillFn = randomPointOnTriangleEdge$1; break
          case "vertex": modelFillFn = randomVertex$1; break
        }

        // the nextTime represents the startTime for each particle, so while the nextTime
        // is less than this frame's time, keep emitting particles. Note, if the spawnRate is
        // low, we may have to wait several frames before a particle is emitted, but if the 
        // spawnRate is high we will emit several particles per frame
        while (this.nextTime < emitterTime && numSpawned < this.count) {

          if (isUsingModel) {
            modelFillFn(this.modelVertices, modelPosition);
          }

          // for each particle, give all of its trails the same position/quaternion. if there are no trails, then
          // trailcount is 1
          for (let trail = 0; trail < this.trailCount; trail++) {
            for (let ribbonVert = 0, ribbonVertCount = isRibbon ? VERTS_PER_RIBBON : 1; ribbonVert < ribbonVertCount; ribbonVert++) {
              id = this.nextID;

              if (isUsingModel) {
                particlePosition.setXYZ(index, modelPosition.x, modelPosition.y, modelPosition.z);
              }
    
              if (hasSource) {
                particlePosition.setXYZ(index, position.x, position.y, position.z);
                particleQuaternion.setXYZW(index, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
              }
    
              particleVertexID.setX(index, data.enabled ? id : -1); // id is unique and is tied to position and quaternion
    
              index = (index + 1) % n;  // wrap around to 0 if we'd emitted the last particle in our stack
              numSpawned++;

              if (isIDUnique) {
                this.nextID++;
              } else {
                this.nextID = index;
              }
            }
          }

          this.nextTime += spawnDelta;
        }

        if (numSpawned > 0) {
          const trailVertCount = this.trailCount * (isRibbon ? VERTS_PER_RIBBON : 1);
          this.params[ID_PARAM] = Math.floor(id/trailVertCount); // ID of previous particle

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
            particlePosition.updateRange.offset = startIndex*3;
            particlePosition.updateRange.count = numSpawned*3;
            particlePosition.needsUpdate = true;
          }

          if (hasSource) {
            particleQuaternion.updateRange.offset = startIndex*4;
            particleQuaternion.updateRange.count = numSpawned*4;
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

  const randomPointInTriangle$1 = (function() {
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

  const randomPointOnTriangleEdge$1 = (function() {
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

  function randomVertex$1(vertices, pos) {
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

varying mat3 vUvTransform;
varying vec4 vParticleColor;
varying vec2 vUv;
varying float vOverTimeRatio;

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
  // throughout 0->particleLoopTime (spawnType == 1).  We calculate the ID of the last spawned particle particleID0 
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
  float particleID = rawParticleID > particleID0 ? rawParticleID - particleCount : rawParticleID; // cyclic (any)
#endif

#endif // defined(USE_PARTICLE_SOURCE)

  // for burst mode we use the rawParticleID, because the concept of particleID0 is irrelevant
  particleID = mix( rawParticleID, particleID, spawnType ); 

  float particleStartTime = particleLoop * particleLoopTime + particleID / spawnRate * spawnType;

  // we use the id as a seed for the randomizer, but because the IDs are fixed in 
  // the range 0->particleCount we calculate a virtual ID by taking into account
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
  trailID += rawTrailID > mod( trailID0, trailCount ) ? rawTrailID - trailCount : rawTrailID; // cyclic (any order)
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

#if defined(USE_PARTICLE_RANDOMIZE_FRAMES)
  float frame = floor ( random( seed ) * textureFrames.z );
#else
  float textureCount = textureFrames.z;
  float textureLoop = textureFrames.w;

  float frame = floor( mod( vOverTimeRatio * textureCount * textureLoop, textureCount ) );
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

vUvTransform = mat3(1.);

#if defined(USE_PARTICLE_ROTATION) || defined(USE_PARTICLE_FRAMES) || defined(USE_PARTICLE_VELOCITY_SCALE)
  {
    vec2 invTextureFrame = 1. / textureFrames.xy;
    float textureCount = textureFrames.z;
    float textureLoop = textureFrames.w;

    float tx = mod( frame, textureFrames.x ) * invTextureFrame.x;
    float ty = (textureFrames.y - 1. - floor( frame * invTextureFrame.x )) * invTextureFrame.y; // assumes textures are flipped on y
    float sx = invTextureFrame.x;
    float sy = invTextureFrame.y;
    float cx = tx + invTextureFrame.x * .5;
    float cy = ty + invTextureFrame.y * .5;
  
    vUvTransform[0][0] = sx * c;
    vUvTransform[0][1] = -sx * s;
    vUvTransform[1][0] = sy * s;
    vUvTransform[1][1] = sy * c;
    vUvTransform[2][0] = c * tx + s * ty - ( c * cx + s * cy ) + cx;
    vUvTransform[2][1] = -s * tx + c * ty - ( -s * cx + c * cy ) + cy;
  }
#endif // defined(USE_PARTICLE_ROTATION) || defined(USE_PARTICLE_FRAMES) || defined(USE_PARTICLE_VELOCITY_SCALE)

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

varying mat3 vUvTransform;
varying vec4 vParticleColor;
varying vec2 vUv;
varying float vOverTimeRatio;

void main() {
  if ( vOverTimeRatio < 0. || vOverTimeRatio > 1. ) {
    discard;
  }

  #include <clipping_planes_fragment>

  vec3 outgoingLight = vec3( 0. );
  vec4 diffuseColor = vec4( emitterColor, 1. );

  // #include <logdepthbuf_fragment>
  // #include <map_particle_fragment>
  // #include <color_fragment>

#ifdef USE_MAP

#if defined(USE_RIBBON_TRAILS) || defined(USE_RIBBON_3D_TRAILS)
  vec2 uv = ( vUvTransform * vec3( vUv, 1. ) ).xy;
#else
  vec2 uv = ( vUvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1. ) ).xy;
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

  function toLowerCase$7(x) {
    return typeof x === "string" ? x.toLowerCase() : x
  }

  AFRAME.registerComponent('store', {
    schema: {
      type: { default: "temporary", oneOf: ["temporary", "local", "session"], parse: toLowerCase$7 },
    },

    multiple: true,

    updateSchema(newData) {
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
      const originalSchema = AFRAME.components[this.name].schema;
      let newSchema = {};

      for (let prop in newData) {
        if (!(prop in originalSchema)) {
          newSchema[prop] = { type: "string" };
        }
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }
    },

    init() {
      this.binds = [];
      this.firstTime = true;

      this.loadStorage();
      this.el.emit("store-loaded", { store: this, name: this.attrName });
    },

    update(oldData) {
      const data = this.data;

      for (let bind of this.binds) {
        const key = bind.key;
        if (data[key] !== oldData[key]) {
          setProperty(bind.target, bind.prop, data[key]);
        }
      }

      if (!this.firstTime) {
        this.saveStorage();
      }

      this.firstTime = false;
    },

    loadStorage() {
      const originalSchema = AFRAME.components[this.name].schema;
      const data = this.data;
      if (data.type === "temporary") { return }

      for (let key in this.data) {
        if (!(key in originalSchema)) {
          let value = null;
          if (data.type === "local") {
            value = localStorage.getItem(key);
          } else if (data.type === "session") {
            value = sessionStorage.getItem(key);
          }

          if (value !== null) {
            data[key] = value;
          }
        }
      }
    },

    saveStorage() {
      const originalSchema = AFRAME.components[this.name].schema;
      const data = this.data;
      if (data.type === "temporary") { return }

      for (let key in this.data) {
        if (!(key in originalSchema)) {
          if (data.type === "local") {
            localStorage.setItem(key, data[key]);
          } else if (data.type === "session") {
            sessionStorage.setItem(key, data[key]);
          }
        }
      }
    },

    bind(key, target, prop) {
      if (this.binds.find(item => item.target === target && item.prop === prop)) {
        warn(`bind '${target}.${prop}' already exists`);
      }
      this.binds.push({key, target, prop});
    },

    unbind(key, target, prop) {
      const i = this.binds.findIndex(item => item.target === target && item.prop === prop && item.key === key);
      if (i >= 0) {
        this.binds.splice(i, 1);
      } else {
        warn(`unable to find bind '${target}.${prop}' for store key '${key}'`);
      }
    }
  });


  AFRAME.registerComponent('store-bind', {
    schema: {
      store: { type: "selector" },
      from: { default: "" },
      to: { default: "" },
    },

    multiple: true,

    init() {
      this.onStoreLoaded = this.onStoreLoaded.bind(this);
    },

    remove() {
      const data = this.data;
      this.removeListeners(data.store);
      this.unbind(data.store, data.from, data.to);
    },

    update(oldData) {
      const data = this.data;

      this.unbind(oldData.store, oldData.from, oldData.to);
      this.bind(data.store, data.from, data.to);

      if (oldData.store !== data.store) {
        this.removeListeners(oldData.store);
        this.addListeners(data.store);
      }
    },

    addListeners(store) {
      if (store) {
        store.addEventListener("store-loaded", this.onStoreLoaded);
      }
    },

    removeListeners(store) {
      if (store) {
        store.removeEventListener("store-loaded", this.onStoreLoaded);
      }
    },

    // stores placed on the scene do not init until after the entity components!
    onStoreLoaded(e) {
      const data = this.data;
      this.bind(data.store, data.from, data.to);
    },

    bind(store, from, to) {
      if (store && from && to) {
        const [fromComp, key] = from.split(".");
        const storeComponent = store.components[fromComp];

        if (storeComponent && 'bind' in storeComponent) {
          storeComponent.bind(key, this.el, to);
        }
      }
    },

    unbind(store, from, to) {
      if (store && from && to) {
        const [fromComp, key] = from.split(".");
        const storeComponent = store.components[fromComp];

        if (storeComponent && 'unbind' in storeComponent) {
          storeComponent.unbind(key, this.el, to);
        }
      }
    }
  });

  const HOVER_CLASS = "hover";
  const SVG_HTML_WIDTH = 256;
  const SVG_HTML_HEIGHT = 256;
  const isSVG = (str) => typeof str === "string" && /\<svg/.test(str);

  function appendUnique(list, otherList) {
    for (let i = 0; i < otherList.length; i++) {
      if (!list.includes(otherList[i])) {
        list.push(otherList[i]);
      }
    }
    return list
  }

  AFRAME.registerComponent("svg-ui", {
    schema: {
      template: { default: "" },
      clickSelectors: { default: "" },
      hoverSelectors: { default: "" },
      touchSelectors: { default: "" },
      touchDistance: { default: 0.07 },
      resolution: { type: "vec2", default: {x: 512, y:512} },
      touchDeadZone: { default: .5 },
      bubbles: { default: false },
      debug: { default: false },
      enabled: { default: true },
      useHoverClass: { default: false },
      interactIfOccluded: { default: false },
    },

    // copy new properties to the schema so they will appear in the Inspector
    updateSchema(newData) {
      if (typeof newData !== "object") {
        error(this, `invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
      const originalSchema = AFRAME.components[this.name].schema;
      let newSchema = {};

      for (let prop in newData) {
        if (!(prop in originalSchema)) {
          newSchema[prop] = { type: "string" };
        }
      }

      if (Object.keys(newSchema).length > 0) {
        this.extendSchema(newSchema);
      }

    },

    init() {
      this.hasUIListeners = false;
      this.raycasters = [];
      this.hoverEls = [];
      this.touchEls = new Map();
      this.hasPendingUpdateSVGTexture = false;

      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.onRaycasterIntersected = this.onRaycasterIntersected.bind(this);
      this.onRaycasterIntersectedCleared = this.onRaycasterIntersectedCleared.bind(this);
      this.onClick = this.onClick.bind(this);

      this.el.addEventListener("object3dset", this.onObject3DSet);

      this.createSVGTexture();
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);

      if (this.proxyEl && this.proxyEl.parent) {
        this.proxyEl.parent.removeChild(this.proxyEl);
      }
    },

    play() {
      this.addUIListeners();
    },

    pause() {
      this.removeUIListeners();
    },

    update(oldData) {
      const data = this.data;

      if (oldData.template !== data.template) {
        loadTemplate(data.template, "<svg", (text) => {
          this.templateContent = text;
          if (!isSVG(text)) {
            warn(this, `template '${data.template}' doesn't look like SVG: ${text}`);
          }

          this.createSVGFunction(text);
          this.requestUpdateSVGTexture();
        });
        
      } else if (this.templateContent) {
        if (Object.keys(oldData) !== Object.keys(data)) {
          this.createSVGFunction(this.templateContent);
        }

        this.requestUpdateSVGTexture();
      }

      this.addUIListeners();
    },

    tick() {
      if (this.hasPendingUpdateSVGTexture) {
        this.updateSVGTexture();
      }

      if (this.data.enabled && this.raycasters && this.proxySVGEl) {
        this.updateHoverAndTouch();
      }
    },

    // other components can set the template content directly
    setTemplate(newContent) {
      this.templateContent = newContent;
      this.requestUpdateSVGTexture();
    },

    isSelectable() {
      const data = this.data;
      return data.clickSelectors || data.hoverSelectors || data.touchSelectors
    },

    addUIListeners() {
      if (!this.hasUIListeners && this.isSelectable()) {
        this.el.addEventListener("raycaster-intersected", this.onRaycasterIntersected);
        this.el.addEventListener("raycaster-intersected-cleared", this.onRaycasterIntersectedCleared);
        this.el.addEventListener("click", this.onClick);
        this.hasUIListeners = false;
      }
    },

    removeUIListeners() {
      if (this.hasUIListeners) {
        this.el.removeEventListener("raycaster-intersected", this.onRaycasterIntersected);
        this.el.removeEventListener("raycaster-intersected-cleared", this.onRaycasterIntersectedCleared);
        this.el.removeEventListener("click", this.onClick);
        this.hasUIListeners = false;
      }
    },

    createSVGTexture() {
      const data = this.data;

      this.imageEl = document.createElement("img");
      this.imageEl.width = data.resolution.x;
      this.imageEl.height = data.resolution.y;
      this.imageEl.isReady = true;

      const texture = this.texture = new THREE.Texture(this.imageEl);

      // steps for successful rendering of the texture
      // - imageEl.src = <new svg>
      // - imageEl.onload
      // - texture.needsUpdate = true
      // - texture.onUpdate
      // - image.isReady = true
      // - render any pending content

      // steps for failed update
      // - imageEl.src = <new svg>
      // - imageEl.onerror
      // - image.isReady = true
      // - render any pending content

      this.imageEl.onload = () => {
        texture.needsUpdate = true;
      };

      this.imageEl.onerror = () => {
        error(this, "invalid svg", this.lastContent);
        texture.image.isReady = true;
      };

      texture.onUpdate = () => {
        texture.image.isReady = true;
      };

      this.requestUpdateSVGTexture();
      this.showSVGTextureOnMesh();
    },

    requestUpdateSVGTexture() {
      // queue the requests, so that we perform the (expensive) SVG update at most once per frame
      this.hasPendingUpdateSVGTexture = true;
    },

    updateSVGTexture() {
      if (this.templateContent) {

        let generatedContent = this.processTemplate(this.templateContent);
        if (this.data.debug) {
          console.log(generatedContent);
        }

        if (this.isSelectable()) {
          if (!this.proxyEl) {
            this.proxyEl = document.createElement("div");
            this.proxyEl.style.position = "absolute";
            this.proxyEl.style.top = "0";
            this.proxyEl.style.left = "0";
            this.proxyEl.style.zIndex = "-999";

            this.el.appendChild(this.proxyEl);
          }

          this.proxyEl.innerHTML = generatedContent;

          this.proxySVGEl = this.proxyEl.children[0];
          this.proxySVGEl.setAttribute("width", SVG_HTML_WIDTH);
          this.proxySVGEl.setAttribute("height", SVG_HTML_HEIGHT);

          if (this.data.useHoverClass) {
            // because we just updated the proxyEl, the elements have been recreated,
            // only the ids are valid
            for (let hoverEl of this.hoverEls) {
              if (!hoverEl.id) {
                warn(this, `an element (${getDebugName(hoverEl)}) matching the hoverSelectors (${this.data.hoverSelectors}), does not have an id`);
              } else {
                const newHoverEl = this.proxyEl.querySelector("#" + hoverEl.id);
                if (newHoverEl) {
                  newHoverEl.classList.add(HOVER_CLASS);
                }
              }
            }

            generatedContent = this.proxyEl.innerHTML;
          }
        }

        this.pendingContent = generatedContent;
        this.updatePendingContent();
      }

      this.hasPendingUpdateSVGTexture = false;
    },

    updatePendingContent() {
      if (this.imageEl.isReady && this.pendingContent) {
        this.imageEl.src = 'data:image/svg+xml;utf8,' + this.pendingContent;
        this.imageEl.isReady = false;
        this.lastContent = this.pendingContent;
        this.pendingContent = undefined;
      }
    },

    showSVGTextureOnMesh() {
      const mesh = this.el.getObject3D("mesh");
      if (mesh) {
        if (!Array.isArray(mesh.material)) {
          mesh.material.map = this.texture;

          const materialColor = mesh.material.color;
          if (materialColor && (materialColor.r < .95 || materialColor.g < .95 || materialColor.b < .95)) {
            warn(this, `svg-ui material color is not white, it may be difficult to see the ui`);
          }
        }
      }
    },

    createSVGFunction(str) {
      const templateArgs = Object.keys(this.data).concat("return `" + str + "`");
      this.svgTextFunction = new Function(...templateArgs);
    },

    processTemplate(str) {
      if (this.svgTextFunction) {
        const result = this.svgTextFunction(...Object.values(this.data));
        return result.replace(/%/g, "%25").replace(/#/g, '%23') // patch all # and % because they are special characters for data:image
      }
    },

    calcViewXYFomUV: (function() {
      let transformedUV = new THREE.Vector2();

      return function calcXYFomUV(uv) {
        transformedUV.copy(uv);
        this.texture.transformUv(transformedUV);

        const viewBox = this.proxySVGEl.viewBox.animVal;
        const x = viewBox.width*transformedUV.x + viewBox.x;
        const y = viewBox.height*transformedUV.y + viewBox.y;
        return {x,y}
      }
    })(),

    calcElementsFromUV: (function () {
      let transformedUV = new THREE.Vector2();

      return function calcElementsFromUV(uv, selector, debug) {
        transformedUV.copy(uv);
        this.texture.transformUv(transformedUV);

        const x = SVG_HTML_WIDTH*transformedUV.x;
        const y = SVG_HTML_HEIGHT*transformedUV.y;

        // only show elements that are part of this panel's svg
        let elements = document.elementsFromPoint(x,y).filter(el => hasAncestor(el, this.proxySVGEl));

        if (debug) {
          console.log("hitElements", x, y, elements);
        }

        if (selector) {
          elements = elements.map(el => findMatchingAncestor(el, selector)).filter(a => a);
          if (debug) {
            console.log("selectedElements", elements);
          }  
        }

        return elements
      }
    })(),

    updateHoverAndTouch() {
      let hoverElements = [];
      const interactIfOccluded = this.data.interactIfOccluded;
      const thisEl = this.el;

      function getIntersection(raycaster) {
        const intersections = raycaster.components["raycaster"].intersections;
        if (interactIfOccluded) {
          return intersections.find(intersection => intersection.object.el === thisEl)
        } else {
          // if the raycaster hits it's own entity, then ignore it and get the second intersection
          return intersections.length > 0 ? ( intersections[0].object.el === raycaster ? intersections[1] : intersections[0] ) : undefined
        }
      }

      for (let raycaster of this.raycasters) {
        const intersection = getIntersection(raycaster);
        if (intersection.object.el === this.el) {
          let touchElements = [];
          let hasMoved = false;
          // const intersection = raycaster.components.raycaster.getIntersection(this.el)
          const touchInfo = this.touchEls.get(raycaster);
    
          if (intersection) {
            intersection.svg = this.calcViewXYFomUV(intersection.uv);

            if (touchInfo.lastMove) {
              hasMoved = Math.hypot(touchInfo.lastMove.x - intersection.svg.x, touchInfo.lastMove.y - intersection.svg.y) > this.data.touchDeadZone;
            }

            appendUnique( hoverElements, this.calcElementsFromUV(intersection.uv, this.data.hoverSelectors, false) );
    
            if (intersection.distance < this.data.touchDistance) {
              touchElements = this.calcElementsFromUV(intersection.uv, this.data.touchSelectors, this.data.debug);
            }
          }

          const touchIds = touchElements.map(x => x.id);

          for (let prevEl of touchInfo.elements) {
            if (!touchElements.find(newEl => newEl.id === prevEl.id)) {
              this.sendEvent("svg-ui-touchend", { uiTarget: prevEl, intersection, touches: touchIds }, raycaster);
            }
          }
      
          for (let newEl of touchElements) {
            if (touchInfo.elements.find(prevEl => prevEl.id === newEl.id)) {
              if (hasMoved) {
                this.sendEvent("svg-ui-touchmove", { uiTarget: newEl, intersection, touches: touchIds }, raycaster);
              }
            } else {
              this.sendEvent("svg-ui-touchstart", { uiTarget: newEl, intersection, touches: touchIds }, raycaster);
            }
          }
      
          if (hasMoved || !touchInfo.lastMove) {
            touchInfo.lastMove = intersection.svg;
          }
          touchInfo.elements = touchElements;
        }
      }

      const hoverIds = hoverElements.map(x => x.id);
      let hoverChanged = false;

      for (let el of this.hoverEls) {
        if (!hoverElements.find(otherEl => otherEl.id === el.id)) {
          this.sendEvent("svg-ui-hoverend", { uiTarget: el, hovers: hoverIds });
          hoverChanged = true;
        }
      }

      for (let el of hoverElements) {
        if (!this.hoverEls.find(otherEl => otherEl.id === el.id)) {
          this.sendEvent("svg-ui-hoverstart", { uiTarget: el, hovers: hoverIds });
          hoverChanged = true;
        }
      }

      if (this.data.useHoverClass && hoverChanged) {
        this.requestUpdateSVGTexture();
      }

      this.hoverEls = hoverElements;
    },

    sendEvent(name, details, targetEl) {
      if (this.data.debug) {
        console.log("emit", name, details, targetEl);
      }

      this.el.emit(name, details, this.data.bubbles);

      if (targetEl) {
        targetEl.emit(name, details, this.data.bubbles);
      }
    },

    onObject3DSet(e) {
      this.showSVGTextureOnMesh();
    },

    onRaycasterIntersected(e) {
      if (this.data.debug) {
        console.log("onRaycasterIntersected", this.el.id);
      }
      const raycaster = e.detail.el;

      this.touchEls.set(raycaster, { elements: [] });
      this.raycasters.push(raycaster);
    },

    onRaycasterIntersectedCleared(e) {
      if (this.data.debug) {
        console.log("onRaycasterIntersectedCleared", this.el.id);
      }

      const raycaster = e.detail.el;
      this.raycasters.splice( this.raycasters.indexOf(raycaster), 1 );
      this.touchEls.delete(raycaster);
    },

    onClick(e) {
      const data = this.data;
      if (data.debug) {
        console.log("click", this.el.id);
      }

      if (e.detail.intersection && data.enabled) {
        let hitElements = this.calcElementsFromUV(e.detail.intersection.uv, data.clickSelectors, data.debug);
        const intersection = { ...e.detail.intersection, svg: this.calcViewXYFomUV(e.detail.intersection.uv) };

        if (hitElements && hitElements.length > 0) {
          this.sendEvent("svg-ui-click", { uiTarget: hitElements[0], intersection });
        }
      }
    },
  });

  AFRAME.registerComponent('texture-updater', {
    schema: {
      maps: { default: "map" },
      meshName: { default: "mesh" },
    },

    update() {
      this.maps = this.data.maps.split(",").map(x => x.trim());
    },

    tick() {
      const mesh = this.el.getObject3D(this.data.meshName);
      if (mesh && mesh.material) {
        for (let map of this.maps) {
          if (Array.isArray(mesh.material)) {
            for (let material of mesh.material) {
              if (material[map] && typeof material[map] === "object") {
                material[map].needsUpdate = true;
              }
            }
          } else if (mesh.material[map] && typeof mesh.material[map] === "object") {
            mesh.material[map].needsUpdate = true;
          }
        }
      }
    },
  });

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
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
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

  // @ts-ignore
  const radToDeg = THREE.Math.radToDeg;
  // @ts-ignore
  const degToRad$4 = THREE.Math.degToRad;
  const parseToLowerCase = str => (typeof str === "string") ? str.toLowerCase() : str;

  AFRAME.registerComponent("tool", {
    dependencies: ["position", "rotation", "scale"],

    schema: {
      debug: { default: false },
      handPosition: { type: "vec3" },
      handRotation: { type: "vec3" },
      handScale: { type: "vec3", default: {x:1, y:1, z:1} },
      maxHands: { default: 1 },
      usage: { default: "stayondrop", oneOf: ["respawnOnDrop", "stayOnDrop"], parse: parseToLowerCase },
    },

    init() {
      this.hands = [];
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);
      this.offsetMatrix = new THREE.Matrix4();
      this.objectMatrixOnEquip = new THREE.Matrix4();
      this.originalScale = new THREE.Vector3();
      this.invRotationMatrix = new THREE.Matrix4();

      const system = this.el.sceneEl.systems["grab-system"];
      system.registerTarget(this.el);
    },

    play() {
      this.el.addEventListener("grabstart", this.onGrabStart);
      this.el.addEventListener("grabend", this.onGrabEnd);
    },

    pause() {
      this.el.removeEventListener("grabstart", this.onGrabStart);
      this.el.removeEventListener("grabend", this.onGrabEnd);
    },

    update(oldData) {
      const data = this.data;

      if (oldData.handRotation !== data.handRotation || oldData.handPosition !== data.handPosition || oldData.handScale !== data.handScale) {
        const euler = new THREE.Euler().set(degToRad$4(data.handRotation.x), degToRad$4(data.handRotation.y), degToRad$4(data.handRotation.z), "YXZ");
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        this.offsetMatrix.compose(data.handPosition, quaternion, data.handScale);
        this.invRotationMatrix.makeRotationFromQuaternion(quaternion);
        this.invRotationMatrix.getInverse(this.invRotationMatrix);
      }
    },

    tick: (function() {
      const newMatrix = new THREE.Matrix4();
      const inverseParentMat = new THREE.Matrix4();
      const forwardVector = new THREE.Vector3(0,0,1);
      const secondVector = new THREE.Vector3();
      const secondHandPosition = new THREE.Vector3();
      const firstHandPosition = new THREE.Vector3();
      const twoHandQuaternion = new THREE.Quaternion();
      const twooffsetMatrix = new THREE.Matrix4();

      return function tick() {
        if (this.hands.length === 0) {
          this.el.sceneEl.removeBehavior(this);
          return
        }
    
        const object3D = this.el.object3D;
        const hand3D = this.hands[0].object3D;

        hand3D.updateMatrixWorld(true);
        object3D.parent.updateMatrixWorld(true);

        // get the inverse each frame in case the parent is moving
        inverseParentMat.getInverse(object3D.parent.matrixWorld);

        if (this.hands.length > 1) {
          const secondHand3D = this.hands[1].object3D;
          secondHand3D.updateMatrixWorld(true);
          secondHand3D.getWorldPosition(secondHandPosition);
          hand3D.getWorldPosition(firstHandPosition);
          secondVector.subVectors(firstHandPosition, secondHandPosition).normalize();
          forwardVector.set(0,0,1);
          twoHandQuaternion.setFromUnitVectors(forwardVector, secondVector);
          twooffsetMatrix.makeRotationFromQuaternion(twoHandQuaternion);
          twooffsetMatrix.multiply(this.invRotationMatrix);
          twooffsetMatrix.setPosition(firstHandPosition);
          newMatrix.copy(this.offsetMatrix).premultiply(twooffsetMatrix).premultiply(inverseParentMat);
        } else {
          newMatrix.copy(this.offsetMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat);
        }

        newMatrix.decompose(object3D.position, object3D.quaternion, object3D.scale);
        object3D.scale.multiply(this.originalScale);
      }
    })(),

    onGrabStart(e) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const data = this.data;

      this.hands.length = Math.min(data.maxHands - 1, this.hands.length);
      this.hands.push(e.detail.hand);
      this.objectMatrixOnEquip.copy(this.el.object3D.matrix);
      this.el.object3D.matrix.decompose(position, quaternion, this.originalScale);
      this.el.sceneEl.addBehavior(this);
    },

    onGrabEnd(e) {
      const data = this.data;
      const object3D = this.el.object3D;
      const handIndex = this.hands.indexOf(e.detail.hand);

      if (handIndex !== -1) {
        this.hands.splice(handIndex, 1);

        if (this.hands.length === 0 && data.usage === "respawnondrop") {
          this.objectMatrixOnEquip.decompose(object3D.position, object3D.quaternion, object3D.scale);
        }
      }
    },
  });

  AFRAME.registerComponent("toy", {
    schema: {
      routeEvents: { default: "controllerconnected, controllerdisconnected, gripdown, gripup, gripchanged, trackpaddown, trackpadup, triggerdown, triggerup" },
      debug: { default: false }
    },

    init() {
      this.invGrabMatrix = new THREE.Matrix4();
      this.grabHand = undefined;
      this.routeEvents = [];
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);
      this.onRouteEvent = this.onRouteEvent.bind(this);

      const system = this.el.sceneEl.systems["grab-system"];
      system.registerTarget(this.el);
    },

    play() {
      this.el.addEventListener("grabstart", this.onGrabStart);
      this.el.addEventListener("grabend", this.onGrabEnd);
      this.addRouteListeners();
    },

    pause() {
      this.removeRouteListeners();
      this.el.removeEventListener("grabend", this.onGrabEnd);
      this.el.removeEventListener("grabstart", this.onGrabStart);
    },

    update(oldData) {
      const data = this.data;

      if (oldData.routeEvents !== data.routeEvents) {
        this.routeEvents = data.routeEvents.split(",").map(x => x.trim());
      }
    },

    tick() {
      if (!this.grabHand) {
        this.el.sceneEl.removeBehavior(this);
        return
      }

      this.stickToHand();
    },

    stickToHand: (function() {
      const invParentMatrix = new THREE.Matrix4();
      const newMatrix = new THREE.Matrix4();

      return function stickToHand() {
        const hand3D = this.grabHand.object3D;
        const self3D = this.el.object3D;

        invParentMatrix.getInverse(self3D.parent.matrixWorld);
        newMatrix.multiplyMatrices(hand3D.matrixWorld, this.invGrabMatrix); // determine new hover3D world matrix
        newMatrix.premultiply(invParentMatrix); // convert to a local matrix
        newMatrix.decompose(self3D.position, self3D.quaternion, self3D.scale);
      }  
    })(),

    sendEvent(el, type, detail) {
      if (this.data.debug) {
        log(this, `send '${type}' to '${getDebugName(el)}'`);
      }
      el.emit(type, detail);
    },

    addRouteListeners() {
      if (this.grabHand) {
        for (let type of this.routeEvents) {
          this.grabHand.addEventListener(type, this.onRouteEvent);
        }  
      }
    },

    removeRouteListeners() {
      if (this.grabHand) {
        for (let type of this.routeEvents) {
          this.grabHand.removeEventListener(type, this.onRouteEvent);
        }  
      }
    },

    onGrabStart(event) {
      if (this.data.debug) {
        log(this, `${event.type}`);
      }

      this.removeRouteListeners();

      this.grabHand = event.detail.hand;
      const hand3D = this.grabHand.object3D;
      const self3D = this.el.object3D;

      this.invGrabMatrix.getInverse(hand3D.matrixWorld).multiply(self3D.matrixWorld);

      this.addRouteListeners();

      this.el.sceneEl.addBehavior(this);
    },

    onGrabEnd(event) {
      if (this.data.debug) {
        log(this, `${event.type}`);
      }

      if (this.grabHand === event.detail.hand) {
        this.removeRouteListeners();
    
        this.grabHand = undefined;
      }
    },

    onRouteEvent(event) {
      this.sendEvent(this.el, event.type, { ...event.detail, hand: this.grabHand });
    },
  });

  AFRAME.registerComponent("trigger-zone", {
    schema: {
      triggerSelectors: { default: "" },
      watch: { default: false },
      debug: { default: false },
      tickMS: { default: 100 },
      bubbles: { default: false },
      enabled: { default: true },
      test: { default: "overlap", oneOf: ["overlap", "within"]},
    },

    multiple: true,

    init() {
      this.firstTime = true;
      this.debugShape = undefined;
      this.overlapping = [];
      this.triggerElements = [];
      this.observer = undefined;
      this.onSceneLoaded = this.onSceneLoaded.bind(this);
      this.onSceneChanged = this.onSceneChanged.bind(this);

      this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
    },

    remove() {
      this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);

      if (this.observer) {
        this.observer.disconnect();
        this.observer = undefined;
      }

      this.hideDebugShape();
    },

    update(oldData) {
      const data = this.data;

      // don't perform these operations on the first update as we'll do them in onSceneLoaded() when all the other nodes are present
      if (!this.firstTime && oldData.triggerSelectors !== data.triggerSelectors) {
        this.gatherElements();
      }

      if (!this.firstTime && (oldData.watch !== data.watch || oldData.enabled !== data.enabled) ) {
        this.setupWatch();
      }

      if (oldData.tickMS !== data.tickMS) {
        this.tick = AFRAME.utils.throttleTick(this.tick, data.tickMS, this);
      }

      if (oldData.debug !== data.debug || oldData.enabled !== data.enabled) {
        this.showDebugShape();
      }

      this.firstTime = false;
    },

    tick() {
      if (this.triggerElements.length > 0 && this.data.enabled) {
        this.checkForEnterLeave();
      }
    },

    gatherElements() {
      const data = this.data;
      this.triggerElements = data.triggerSelectors ? Array.from(document.querySelectorAll(data.triggerSelectors)) : [];

      if (data.debug) {
        console.log(`gathering ${this.triggerElements.length} elements`);
      }

      if (this.triggerElements.length === 0) {
        warn(`no trigger elements using '${data.triggerSelectors}' for trigger-zone`);
      }
    },

    checkForEnterLeave() {
      const elements = this.findOverlapping(this.triggerElements, "cyan");

      for (let overlapping of this.overlapping) {
        if (!elements.includes(overlapping)) {
          this.sendTwoEvents("trigger-zone-leave", overlapping);
        }
      }

      for (let newEl of elements) {
        if (!this.overlapping.includes(newEl)) {
          this.sendTwoEvents("trigger-zone-enter", newEl);
        }
      }

      this.overlapping = elements;
    },

    findOverlapping: (function () {
      const obj3DPosition = new THREE.Vector3();
      const zonePosition = new THREE.Vector3();
      const zoneScale_2 = new THREE.Vector3();
      const BOX_MIN_EXTENTS = new THREE.Vector3(-.5,-.5,-.5);
      const BOX_MAX_EXTENTS = new THREE.Vector3(.5,.5,.5);

      return function findOverlapping(els, debugColor) {
        let overlappingEls = [];
        const object3D = this.el.object3D;

        object3D.updateMatrixWorld(true);
        object3D.getWorldPosition(zonePosition);
        object3D.getWorldScale(zoneScale_2).multiplyScalar(0.5);
        const zoneRadius = Math.hypot(zoneScale_2.x, zoneScale_2.y, zoneScale_2.z);

        for (let el of els) {
          if (!el.isEntity || !el.object3D) {
            continue
          }

          let el3D = el.object3D;
          if (!el3D.boundingSphere || !el3D.boundingBox || el3D.boundingBox.isEmpty()) {
            generateOrientedBoundingBox(el3D, debugColor);
          }

          if (el3D.boundingBox.isEmpty()) {
            continue
          }

          // Bounding sphere collision detection
          obj3DPosition.copy(el3D.boundingSphere.center).applyMatrix4(el3D.matrixWorld);
          const radius = el3D.boundingSphere.radius*Math.max(el3D.scale.x, el3D.scale.y, el3D.scale.z);
          const distance = zonePosition.distanceTo(obj3DPosition);

          if (distance > radius + zoneRadius) {
            continue
          }

          // Bounding box collision check
          let isOverlapping = false;
          if (this.data.test === "overlap") {
            isOverlapping = boxWithBox(el3D.boundingBox.min, el3D.boundingBox.max, el3D.matrixWorld.elements, BOX_MIN_EXTENTS, BOX_MAX_EXTENTS, object3D.matrixWorld.elements);
          } else {
            isOverlapping = boxWithinBox(el3D.boundingBox.min, el3D.boundingBox.max, el3D.matrixWorld.elements, BOX_MIN_EXTENTS, BOX_MAX_EXTENTS, object3D.matrixWorld.elements);
          }

          if (isOverlapping) {
            overlappingEls.push(el);
          }
        }

        return overlappingEls
      }

    })(),

    sendTwoEvents(name, to) {
      if (this.data.debug) {
        console.log(name, getDebugName(this.el), getDebugName(to));
      }

      const bubbles = this.data.bubbles;
      this.el.emit(name, { zoneTarget: to, zoneSource: this.el }, bubbles);
      to.emit(name, { zoneTarget: to, zoneSource: this.el }, bubbles);
    },

    setupWatch() {
      if (this.data.watch && this.data.enabled) {
        this.observer = this.observer ? this.observer : new MutationObserver(this.onSceneChanged);
        this.observer.observe(this.el.sceneEl, {childList: true, subtree: true});
      } else if (this.observer) {
        this.observer.disconnect();
      }
    },

    showDebugShape() {
      this.hideDebugShape();

      const geometry = new THREE.BoxBufferGeometry();
      const wireframe = new THREE.WireframeGeometry(geometry);
      this.debugShape = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: this.data.enabled ? "blue" : "grey" }));
      this.el.object3D.add(this.debugShape);
    },

    hideDebugShape() {
      if (this.debugShape) {
        this.el.object3D.remove(this.debugShape);
        this.debugShape = undefined;
      }
    },

    onSceneLoaded(e) {
      this.gatherElements();
      this.setupWatch();
    },

    onSceneChanged(mutations) {
      applyNodeMutations(this.triggerElements, mutations, this.data.triggerSelectors);
    },
  });

  function toLowerCase$8(str) { return str.toLowerCase() }

  const WRAPPING_MAP = {
    "repeat": THREE.RepeatWrapping,
    "clamptoedge": THREE.ClampToEdgeWrapping,
    "mirroredrepeat": THREE.MirroredRepeatWrapping,
  };

  AFRAME.registerComponent("uv-transform", {
    schema: {
      offset: { type: "vec2" },
      repeat: { type: "vec2", default: {x:1, y:1} },
      rotate: { type: "number" },
      pivot: { type: "vec2", default: {x:.5, y:.5} },
      meshName: { default: "mesh" },
      wrapS: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase$8},
      wrapT: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase$8},
      maps: { type: "string", default: "map" },
      textureFrame: { type: "vec2", default: {x:1, y:1} },
      frame: { default: 0 },
    },

    multiple: true,

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.onMaterialTextureLoaded = this.onMaterialTextureLoaded.bind(this);

      this.el.addEventListener("object3dset", this.onObject3DSet);
      this.el.addEventListener("materialtextureloaded", this.onMaterialTextureLoaded);
    },

    remove() {
      this.el.removeEventListener("materialtextureloaded", this.onMaterialTextureLoaded);
      this.el.removeEventListener("object3dset", this.onObject3DSet);
    },

    update(oldData) {
      const data = this.data;

      if (oldData.rotate !== data.rotate) {
        this.rotate = THREE.Math.degToRad(data.rotate);
      }

      if (oldData.wrapS !== data.wrapS || oldData.wrapT !== data.wrapT) {
        this.wrapS = WRAPPING_MAP[data.wrapS] || THREE.RepeatWrapping;
        this.wrapT = WRAPPING_MAP[data.wrapT] || THREE.RepeatWrapping;
      }

      if (oldData.maps !== data.maps) {
        this.maps = data.maps.split(",").map(x => x.trim());
        this.cloneMaps();
      }

      this.updateUVs();
    },

    onObject3DSet(e) {
      if (e.target === this.el && e.detail.type === this.data.meshName) {
        this.cloneMaps();
        this.updateUVs();
      }
    },

    onMaterialTextureLoaded(e) {
      if (e.target === this.el) {
        this.cloneMaps();
        this.updateUVs();
      }
    },

    updateUVs() {
      const data = this.data;
      const repeat = data.repeat;
      const rotate = this.rotate;
      const pivot = data.pivot;
      const wrapS = this.wrapS;
      const wrapT = this.wrapT;
      const textureFrame = data.textureFrame;
      const frame = Math.trunc( data.frame );
      const frameX = frame % textureFrame.x / textureFrame.x;
      const frameY = 1 - Math.floor( frame / textureFrame.x ) / textureFrame.y;
      const offsetX = data.offset.x + frameX - pivot.x + pivot.x/textureFrame.x;
      const offsetY = data.offset.y + frameY - pivot.y - ( 1 - pivot.y )/textureFrame.y;

      function setElements(map) {
        if (map) {
          map.wrapS = wrapS;
          map.wrapT = wrapT;
          map.offset.set(offsetX, offsetY);
          map.repeat.copy(repeat).divide(textureFrame);
          map.center.copy(pivot);
          map.rotation = rotate;
          // map.needsUpdate = true
        }
      }

      const mesh = this.el.getObject3D(this.data.meshName);
      if (mesh && mesh.material) {
        for (let map of this.maps) {
          setElements(mesh.material[map]);
        }
      }
    },

    // by default a single texture is assigned to each image file, so if we have
    // multiple uv-transforms that use the same image we need to make a copy of the texture
    cloneMaps() {
      const mesh = this.el.getObject3D(this.data.meshName);
      if (mesh && mesh.material && this.maps) {
        for (let map of this.maps) {
          const texture = mesh.material[map];
          if (texture) {
            mesh.material[map] = texture.clone();
            mesh.material[map].needsUpdate = true;
          }
        }
      }
    }
  });

  // @ts-ignore
  const COLOR_FLOATS_PER_VERTEX$1 = 3;

  function parseIntArray$1(str) {
    return typeof str === "string" ? str.split(",").map(s => parseInt(s, 10)) : str
  }

  AFRAME.registerComponent("vertex-color", {
    schema: {
      color: { type: "color" },
      verts: { type: "array", parse: parseIntArray$1 },
      minPosition: { type: "vec3", default: {x:-1e10, y:-1e10, z:-1e10} }, // top left
      maxPosition: { type: "vec3", default: {x:1e10, y:1e10, z:1e10} }, // bottom right
      minSlope: { type: "int", default: 0 }, // absolute slope
      maxSlope: { type: "int", default: 90 }, // absolute slope
      meshName: { default: "mesh" },
    },
    multiple: true,

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this);
      this.el.addEventListener("object3dset", this.onObject3DSet);
      this.isFirstFrame = true;
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);
    },

    update() {
      if (this.isFirstFrame) {
        this.applyVertexColors();
        this.isFirstFrame = false;
      } else {
        // if only one of the vertex color components on an element is updated i.e. via the 
        // inspector, then need to update all of them in-order so the colors are applied
        // correctly
        const selfComponents = this.el.components;
        for (let name in selfComponents) {
          if (name.indexOf("vertex-color") === 0) {
            selfComponents[name].applyVertexColors();
          }
        }
      }
    },

    onObject3DSet(e) {
      if (e.target === this.el && e.detail.type === this.data.meshName) {
        this.applyVertexColors();
      }
    },

    applyVertexColors() {
      const data = this.data;
      const mesh = this.el.getObject3D(data.meshName);
      if (mesh) {
        const geometry = mesh.geometry;
        const material = mesh.material;
        const materialColor = mesh.material.color;

        material.vertexColors = THREE.VertexColors;

        if (materialColor.r < .3 && materialColor.g < .3 && materialColor.b < .3) {
          warn("material color is very dark, vertex-color will also be dark");
        }

        console.assert(geometry.isBufferGeometry, "vertex-color only supports buffer geometry");

        if (!geometry.getAttribute("color")) {
          const whiteColors = new Float32Array(geometry.getAttribute("position").count*COLOR_FLOATS_PER_VERTEX$1).fill(1);
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX$1));
        }

        const positions = geometry.getAttribute("position");
        const normals = geometry.getAttribute("normal");
        const colors = geometry.getAttribute("color");

        // data.min/maxPosition are in the range (0,1), but the X and Z vertices use (-.5,.5)
        const minX = data.minPosition.x-.5, minY = data.minPosition.y, minZ = data.minPosition.z-.5;
        const maxX = data.maxPosition.x-.5, maxY = data.maxPosition.y, maxZ = data.maxPosition.z-.5;
        const col = new THREE.Color(data.color);
        const EPSILON = 0.00001;
        const degToRad = THREE.Math.degToRad;

        // minSlope will give the largest cos() and vice versa, use EPSILON to counter rounding errors
        const maxSlope = Math.cos(degToRad(Math.max(0, data.minSlope))) + EPSILON;
        const minSlope = Math.cos(degToRad(Math.max(0, data.maxSlope))) - EPSILON;

        for (let i = 0, n = colors.count; i < n; i++) {

          if (data.verts.length > 0 && !data.verts.includes(i)) {
            continue
          }

          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
            continue
          }

          const slope = Math.abs(normals.getY(i)); // dot(normal,UP)
          if (slope < minSlope || slope > maxSlope) {
            continue
          }  

          colors.setXYZ(i, col.r, col.g, col.b);
        }

        colors.needsUpdate = true;
      }
    },


  });

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
      delay: { default: "0" },
      events: { default: "" },
      source: { default: "" },
      sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
      add: { type: "array" },
      addRepeat: { type: "int", default: 1 },
      remove: { type: "array" },
    },
    multiple: true,

    init() {
      this.addRemoveEntities = this.addRemoveEntities.bind(this);
      this.onEvent = this.onEvent.bind(this);

      this.delayClock = basicClock();
      this.eventListener = scopedEvents(this.el, this.onEvent);
    },

    remove() {
      this.delayClock.clearAllTimers();
      this.eventListener.remove();
    },

    update(oldData) {
      const data = this.data;
      if (oldData.events !== data.events || oldData.source !== data.source || oldData.sourceScope !== data.sourceScope) {
        this.eventListener.set(data.events, data.source, data.sourceScope);
      }
      
      // must be last as the waitTimer may trigger immediately
      if (oldData.delay !== data.delay) {
        this.delay = parse$1(data.delay);
        if (data.events === "") {
          this.delayClock.startTimer( randomize(this.delay), this.addRemoveEntities );
        }
      }
    },

    pause() {
      this.delayClock.pause();
      this.eventListener.remove();
    },

    play() {
      this.eventListener.add();
      this.delayClock.resume();
    },

    // there may be several events "pending" at the same time, so use a separate timer for each event
    onEvent() {
      const data = this.data;
      this.delayClock.startTimer( randomize(this.delay), this.addRemoveEntities );
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

  //-----------------------------------------------------------------------------
  // "wait-emit" component for emitting events on this or other elements after a delay or event
  // 
  AFRAME.registerComponent("wait-emit", {
    schema: {
      events: { default: "" },
      delay: { default: "0" },
      source: { default: "" },
      sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
      out: { default: "" },
      target: { default: "" },
      targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
      bubbles: { default: false },
      debug: { default: false },
    },
    multiple: true,

    init() {
      this.onEvent = this.onEvent.bind(this);
      this.sendEvent = this.sendEvent.bind(this);
      this.sources = [];

      this.delayClock = basicClock();
      this.eventListener = scopedEvents( this.el, this.onEvent );
    },

    remove() {
      this.eventListener.remove();
      this.delayClock.clearAllTimeouts();
    },

    update(oldData) {
      const data = this.data;

      if (data.events !== oldData.events || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.eventListener.set( data.events, data.source, data.sourceScope );
      }

      // must be last as the waitTimer may trigger immediately
      if (data.delay !== oldData.delay) {
        this.delay = parse$1(data.delay);
        if (data.events === "") {
          this.delayClock.startTimer( randomize(data.delay), this.sendEvent );
        }
      }
    },

    pause() {
      this.eventListener.remove();
      this.delayClock.pause();
    },

    play() {
      this.eventListener.add();
      this.delayClock.resume();
    },

    sendEvent(event) {
      const data = this.data;
      const targets = getElementsInScope(this.el, data.target, data.targetScope, event ? event.target : undefined);
      const eventData = Object.assign(event, { source: this.el });
      const name = data.out ? data.out : data.event;
      const bubbles = this.data.bubbles;

      for (let target of targets) {
        if ( this.data.debug ) {
          console.log( getDebugName( target ), this.attrName, "send", name, eventData, bubbles );
        }

        target.emit(name, eventData, bubbles);
      }
    },

    // there may be several events "pending" at the same time, so use a separate timer for each event
    onEvent( e ) {
      if ( this.data.debug ) {
        console.log( getDebugName( this.el ), this.attrName, "onEvent", e.type );
      }

      const self = this;
      this.delayClock.startTimer( randomize(this.delay), () => self.sendEvent(e) );
    },

  });

  //-----------------------------------------------------------------------------
  // "wait-set" component for setting attributes on this or other elements after a delay or events
  // 
  AFRAME.registerComponent("wait-set", {
    schema: {
      delay: { default: "0" },
      events: { default: "" },
      source: { default: "" },
      sourceScope: { default: "document", oneOf: ["parent", "self", "document"] },
      target: { default: "" },
      targetScope: { default: "document", oneOf: ["parent", "self", "document", "event"] },
      toggles: { default: "" },
      seed: { type: "int", default: -1 },
      debug: { default: false },
    },
    multiple: true,

    init() {
      this.onEvent = this.onEvent.bind(this);
      this.setProperties = this.setProperties.bind(this);

      this.rules = {};
      this.toggles = [];

      this.eventListener = scopedEvents( this.el, this.onEvent );
      this.delayClock = basicClock();
      this.lcg = lcg();
    },

    remove() {
      this.eventListener.remove();
      this.delayClock.clearAllTimers();
    },

    updateSchema(newData) {
      if (typeof newData !== "object") {
        console.error(`invalid properties, expected format <property>:<value>; '${newData}'`);
      }
      
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

      if (data.events !== oldData.events || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.eventListener.set( data.events, data.source, data.sourceScope );
      }

      if (data.toggles !== oldData.toggles) {
        this.toggles = data.toggles.split(",").map(x => x.trim()).filter(x => x);
      }

      // must be last as the waitTimer may trigger immediately
      if (data.delay !== oldData.delay) {
        this.delay = parse$1(data.delay);
        if (data.events === "") {
          this.delayClock.startTimer( randomize(this.delay), this.setProperties );
        }
      }
    },

    pause() {
      this.eventListener.remove();
      this.delayClock.pause();
    },

    play() {
      this.delayClock.resume();
      this.eventListener.add();
    },

    setProperties(event) {
      const target = substitute$$1( this.data.target, this.el, event );
      const elements = getElementsInScope(this.el, target, this.data.targetScope, event ? event.target : undefined);

      if (this.data.debug) {
        console.log( getDebugName( this.el ), this.attrName, "setProperties", "target=", target );
      }

      for (let el of elements) {
        for (let prop in this.rules) {
          let rule = this.rules[prop];

          const value = stringify( randomize(rule, this.lcg.random) );
          const processedValue = substitute$$1( value, this.el, event );
          if (this.data.debug) {
            console.log( getDebugName( this.el ), this.attrName, "setProperties", "element=", getDebugName(el), "property=", prop, "value=", value, "$event=", event);
          }

          setProperty(el, prop, processedValue);
        }

        for (let prop of this.toggles) {
          const toggleValue = !getProperty(el, prop);
          setProperty(el, prop, toggleValue);
        }
      }
    },

    // there may be several events "pending" at the same time, so use a separate timer for each event
    onEvent(e) {
      if (this.data.debug) {
        console.log( getDebugName(this.el), this.attrName, "onEvent", e.type, e );
      }
      const self = this;
      this.delayClock.startTimer( randomize(this.delay), () => self.setProperties(e) );
    },

  });

  function substitute$$1( str, el, event ) {
    return str.replace(/\$([\.\w]+)/g, (_, p1) => processValue$1( p1, el, event ) )
  }

  function processValue$1( value, el, event ) {
    let result = value;

    if ( value.indexOf( "event" ) === 0 ) {
      if ( !event ) {
        console.log( `value of $event but no event received` );
      } else {
        result = stringify( getWithPath( event, value.slice( 6 ).split( "." ) ) );
      }
    } else {
      result = stringify( getProperty( el, value.slice( 1 ) ) );
    }

    return result
  }

})));
