(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
}(function () { 'use strict';

  // @ts-ignore
  const UP_VECTOR = new THREE.Vector3(0,1,0);
  const MAX_HISTORY_LENGTH = 3;

  AFRAME.registerComponent("arm-swinger", {
    schema: {
      left: { type: "selector" },
      right: { type: "selector" },
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
    },

    update(oldData) {
      const data = this.data;

      this.left = { hand: data.left, positions: [], forwards: [] };
      this.right = { hand: data.right, positions: [], forwards: [] };

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

      let [dLeft, forwardLeft] = this.tickHand(this.left);
      let [dRight, forwardRight] = this.tickHand(this.right);

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
        this.addListeners(this.left.hand);
        this.addListeners(this.right.hand);
        this.isEnabled = true;
      }
    },

    disable() {
      if (this.isEnabled) {
        this.left.active = false;
        this.right.active = false;
        this.removeListeners(this.left.hand);
        this.removeListeners(this.right.hand);
        this.isEnabled = false;
      }
    },

    onStartEvent(e) {
      if (e.target == this.left.hand) {
        this.activate(this.left);
      } else if (e.target == this.right.hand) {
        this.activate(this.right);
      }
    },

    onEndEvent(e) {
      if (e.target == this.left.hand) {
        this.left.active = false;
      } else if (e.target == this.right.hand) {
        this.right.active = false;
      }
    },

    addListeners(hand) {
      if (hand) {
        hand.addEventListener(this.data.startEvent, this.onStartEvent);
        hand.addEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    removeListeners(hand) {
      if (hand) {
        hand.removeEventListener(this.data.startEvent, this.onStartEvent);
        hand.removeEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    activate(side) {
      side.active = true;
      side.positions = [];
      side.forwards = [];
    },

    tickHand(side) {
      if (!side.hand || !side.active) {
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
      const handMatrixWorld = side.hand.object3D.matrixWorld;
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

  const DEG_TO_RAD = Math.PI/180;

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
   * @typedef {{x: number, y: number}} VecXY
   * @typedef {{x: number, y: number, z: number}} VecXYZ
   * @typedef {{x: number, y: number, z: number, w: number}} VecXYZW
   * @typedef {{r: number, g: number, b: number}} RGBColor
   * @typedef {number | VecXY | VecXYZ | VecXYZW | RGBColor | string} AttributePart
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

  /** @type {(att: Attribute, randFn: () => number) => AttributePart} */
  function randomize(attr, randFn = Math.random) {
    if (attr.range) {
      const min = attr.range[0];
      const max = attr.range[1];

      if (isColor(min)) {
        return color({r:0, g:0, b:0}, /** @type {RGBColor} */ (min), /** @type {RGBColor} */ (max), randFn)
      } else if (typeof min === "object" && "x" in min && typeof max === "object" && "x" in max) {
        return vector({x:0, y: 0}, (min), (max), randFn)
      } else if (typeof min === "number" && typeof max === "number") {
        return float(min, max)
      } else {
        return min
      }
      
    } else if (attr.options) {
      return entry(attr.options, randFn)
    }
  }

  /** @type {(attr: any) => string} */
  function stringify(attr) {
    if (typeof attr === "object") {
      if (attr.range) { return stringify(attr.range[0]) + ".." + stringify(attr.range[1]) }
      if (attr.options) { return attr.options.map(option => stringify(option)).join("|") }
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
      if (object3D.children.length === 0) {
        return ext
      }

      // HACK we force the worldmatrix to identity for the object and remmove the parent
      // so we can get a bounding box based around the origin
      tempPosition.copy(object3D.position);
      tempQuaternion.copy(object3D.quaternion);
      tempScale.copy(object3D.scale);
      const tempParent = object3D.parent;

      object3D.parent = null;
      object3D.position.set(0,0,0);
      object3D.quaternion.set(0,0,0,1);
      object3D.scale.set(1,1,1);

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
        obj3D.boundingBoxDebug = new THREE.Box3Helper(obj3D.boundingBox, debugColor);
        obj3D.boundingBoxDebug.name = "orientedBoundingDebug";
        obj3D.add(obj3D.boundingBoxDebug);
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

  AFRAME.registerComponent("climb", {
    schema: {
      cameraRig: { type: "selector" },
      enabled: { default: true },
      debug: { default: false },
    },

    init() {
      this.onGrabStart = this.onGrabStart.bind(this);
      this.onGrabEnd = this.onGrabEnd.bind(this);
      this.onSceneLoaded = this.onSceneLoaded.bind(this);

      this.grab = { hand: undefined, target: undefined, position: new THREE.Vector3() };

      this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
    },

    remove() {
      this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
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

    onSceneLoaded() {
      // if (!this.data.cameraRig) {
      //   console.warn(`no cameraRig found`)
      // }
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
          console.warn("material color is very dark, face-color will also be dark");
        }

        if (geometry.isInstancedBufferGeometry) {
          console.warn("face-color does not support InstancedBufferGeometry");
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
          geometry.addAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX));
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

    //   geometry.addAttribute("color", new THREE.Float32BufferAttribute(newColors, COLOR_FLOATS_PER_VERTEX))
    // },
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
        console.warn(`heightfield: unable to access image '${this.data.src}'`);
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
    
        geometry.addAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.addAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.addAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

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
        console.error( `cannot set 'src' to yourself` );
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
            console.warn( `'src' must point to an entity` );
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
      geo.addAttribute( "position", new THREE.BufferAttribute( Float32Array.from( newPositions ), 3 ) );

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
            console.warn(`no more instances available`);
          }
        } else {
          console.warn(`no 'instance-pool' found on src`);
        }
      } else {
        console.error(`missing 'src' on 'instance' component`);
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
  const FLOATS_PER_POSITION = 3;
  const FLOATS_PER_QUATERNION = 4;
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

      this.onSetObject3D = this.onSetObject3D.bind(this);
      this.onBeforeCompile = this.onBeforeCompile.bind(this);

      this.el.addEventListener("setobject3d", this.onSetObject3D);
    },

    remove() {
      this.el.removeEventListener("setobject3d", this.setobject3d);
      this.destroyInstances();
    },

    update() {
      this.createInstances();
    },

    onSetObject3D(e) {
      if (e.target === this.el && e.detail.type === "mesh") {
        this.destroyInstances();
        this.createInstances();
      }
    },

    createInstances() {
      const mesh = this.el.getObject3D("mesh");
      if (!mesh || !mesh.geometry || !mesh.material) {
        return
      }

      this.oldMesh = mesh;

      const data = this.data;
      const instancedGeometry = new THREE.InstancedBufferGeometry().copy(mesh.geometry);

      const numInstances = data.size;
      instancedGeometry.maxInstancedCount = 0;

      const positions = this.positions && this.positions.length === numInstances ? this.positions : new Float32Array(numInstances*FLOATS_PER_POSITION);
      const scales = this.scales && this.scales.length === numInstances ? this.scales : new Float32Array(numInstances*FLOATS_PER_SCALE).fill(0); // scale to 0 to hide
      const colors = this.colors && this.colors.length === numInstances ? this.colors : new Float32Array(numInstances*FLOATS_PER_COLOR).fill(1);
      const quaternions = this.quaternions && this.quaternions === numInstances ? this.quaternions : new Float32Array(numInstances*FLOATS_PER_QUATERNION).map((x,i) => (i-3) % FLOATS_PER_QUATERNION ? 0 : 1);

      this.instancePosition = new THREE.InstancedBufferAttribute(positions, FLOATS_PER_POSITION);
      this.instanceQuaternion = new THREE.InstancedBufferAttribute(quaternions, FLOATS_PER_QUATERNION);
      this.instanceScale = new THREE.InstancedBufferAttribute(scales, FLOATS_PER_SCALE);
      this.instanceColor = new THREE.InstancedBufferAttribute(colors, FLOATS_PER_COLOR);

      instancedGeometry.addAttribute("instancePosition", this.instancePosition);
      instancedGeometry.addAttribute("instanceQuaternion", this.instanceQuaternion);
      instancedGeometry.addAttribute("instanceScale", this.instanceScale);
      instancedGeometry.addAttribute("instanceColor", this.instanceColor);

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

    reserveBlock(requestedSize) {
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
      const j = i*FLOATS_PER_POSITION;
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
      const j = i*FLOATS_PER_QUATERNION;
      this.quaternions[j] = x;
      this.quaternions[j+1] = y;
      this.quaternions[j+2] = z;
      this.quaternions[j+3] = w;
      this.instanceQuaternion.needsUpdate = true;
    },

    getPositionAt(i, out) {
      const j = i*FLOATS_PER_POSITION;
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
      const j = i*FLOATS_PER_QUATERNION;
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
      console.warn(`unknown path for getProperty() '${prop}'`);
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
              let info = i == 0 ? parsePart(getPropertyAsString(this.el, prop)) : lastKey;
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
      this.onSetObject3D = this.onSetObject3D.bind(this);

      this.system.registerLogger(this);

      this.createTexture();

      this.el.addEventListener("setobject3d", this.onSetObject3D);

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
      this.el.removeEventListener("setobject3d", this.onSetObject3D);

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

    onSetObject3D(e) {
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

  const toLowerCase = x => x.toLowerCase();
  const warn = msg => console.warn("mesh-particles", msg);

  const TWO_PI = 2*Math.PI;
  const PI_2 = .5*Math.PI;
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

  function validateVec3(vec3) {
    return typeof vec3 === "object" && "x" in vec3 && "y" in vec3 && "z" in vec3
  }

  function validateColor(color) {
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
    if (!result.every(part => validateRangeOption(part, validateVec3))) {
      console.warn(`unrecognized array of vec3 range options '${str}'`);
      return undefined
    }
    return result
  }

  function parseFloatRangeOptionArray(str) {
    if (!str) return undefined

    const result = nestedSplit(str).flatMap( str => parse$1(str) );
    if (!result.every(part => validateRangeOption(part, validateFloat))) {
      console.warn(`unrecognized array of float range options '${str}'`);
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
    if (!result.every(part => validateRangeOption(part, validateVec3) || validateRangeOption(part, validateFloat))) {
      console.warn(`unrecognized array of float or vec3 range options '${str}'`);
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
    if (!result.every(part => validateRangeOption(part, validateColor))) {
      console.warn(`unrecognized array of color range options '${str}'`);
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
      radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circleyz", "circlexz"], parse: toLowerCase },
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
          // this.instanceBlocks = this.instancePools.map(inst => inst.requestBlock(this.maxParticles))
          // this.instanceBlocks.forEach((block,i) => { if (!block) warn(`unable to reserve blocks for instance '${this.instancePools[i].el.id}'`) })
          this.instanceIndices = this.instancePools.map( instance => instance.reserveBlock(Math.ceil( this.maxParticles / this.instancePools.length)) );
          this.instanceIndices.forEach((index,i) => { if (index === undefined) warn(`unable to reserve blocks for instance '${this.instancePools[i].el.id}'`); });
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
      newParticle.radialPhi = (data.radialType !== "circlexz") ? 2*Math.acos( random()*2 - 1 ) : PI_2;
      newParticle.radialTheta = data.radialType === "circleyz" ? 0 : (data.radialType === "circle" || data.radialType === "circlexy") ? PI_2 : random()*TWO_PI;

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
        console.warn( "no controller elements found" );

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
          console.warn( "no tracked-controls found" );
        }
      }

      {
        this.actuators = actuators;
      }

      return actuators
    },

  } );

  const TOO_MANY_ENTITIES_WARNING = 100;

  // inspired by donmccurdy/aframe-extras/sphere-collider.js
  AFRAME.registerComponent("simple-hands", {
    schema: {
      grabSelectors: { default: "" },
      toolSelectors: { default: "" },
      colliderOffset: { type: "vec3" },
      colliderRadius: { default: 0.05 },
      handSelectors: { default: "" },
      grabStart: { default: "triggerdown" },
      grabEnd: { default: "triggerup" },
      toolEquip: { default: "triggerdown" },
      toolDrop: { default: "gripdown" },
      watch: { default: true },
      bubbles: { default: false },
      debug: { default: false },
    },

    init() {
      this.observer = null;
      this.sides = [];

      this.grabEls = [];
      this.toolEls = [];
      
      this.onSceneChanged = this.onSceneChanged.bind(this);
      this.onGrabStartEvent = this.onGrabStartEvent.bind(this);
      this.onGrabEndEvent = this.onGrabEndEvent.bind(this);
      this.onToolEquipEvent = this.onToolEquipEvent.bind(this);
      this.onToolDropEvent = this.onToolDropEvent.bind(this);
      this.onSceneLoaded = this.onSceneLoaded.bind(this);

      this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
    },

    remove() {
      this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
      this.hideColliderDebug();

      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    },

    play() {
      for (let side of this.sides) {
        this.addListeners(side);
      }
    },

    pause() {
      for (let side of this.sides) {
        this.removeListeners(side);
      }
    },

    addListeners(side) {
      if (side.hand && !side.hasListeners) {
        const data = this.data;
        side.hand.addEventListener(data.grabStart, this.onGrabStartEvent);
        side.hand.addEventListener(data.grabEnd, this.onGrabEndEvent);
        side.hand.addEventListener(data.toolEquip, this.onToolEquipEvent);
        side.hand.addEventListener(data.toolDrop, this.onToolDropEvent);
        side.hasListeners = true;
      }
    },

    removeListeners(side) {
      if (side.hand && side.hasListeners) {
        const data = this.data;
        side.hand.removeEventListener(data.grabStart, this.onGrabStartEvent);
        side.hand.removeEventListener(data.grabEnd, this.onGrabEndEvent);
        side.hand.removeEventListener(data.toolEquip, this.onToolEquipEvent);
        side.hand.removeEventListener(data.toolDrop, this.onToolDropEvent);
        side.hasListeners = false;
      }
    },

    /**
     * Update list of entities to test for collision.
     */
    update(oldData) {
      const data = this.data;

      if (oldData.grabSelectors !== data.grabSelectors || 
        oldData.toolSelectors !== data.toolSelectors || 
        oldData.handSelectors !== data.handSelectors) {
        this.gatherElements();
      }

      if (!AFRAME.utils.deepEqual(data.colliderOffset, oldData.colliderOffset) || data.colliderRadius !== oldData.colliderRadius) {
        for (let side of this.sides) {
          this.hideColliderDebug( side );
          this.showColliderDebug( side );
        }
      }
    },

    tick() {
      for ( let side of this.sides ) {
        if ( side.mode === "hover" && side.hand ) {
          this.updateHover( side );
        }
      }
    },

    setMode( side, mode ) {
      if ( side.mode !== mode ) {
        side.mode = mode;
      }
    },

    findOverlapping: (function () {
      const obj3DPosition = new THREE.Vector3();

      return function findOverlapping(handPosition, handRadius, els, debugColor) {
        let minScore = Number.MAX_VALUE;
        let overlappingEl = undefined;
      
        for (let el of els) {
          if (!el.isEntity || !el.object3D) { 
            continue 
          }
    
          let obj3D = el.object3D;  
          if (!obj3D.boundingSphere || !obj3D.boundingBox || obj3D.boundingBox.isEmpty()) {
            generateOrientedBoundingBox(obj3D, debugColor);
          }
    
          if (obj3D.boundingBox.isEmpty()) { 
            continue 
          }
    
          // Bounding sphere collision detection
          obj3DPosition.copy(obj3D.boundingSphere.center).applyMatrix4(obj3D.matrixWorld);
          const radius = obj3D.boundingSphere.radius*Math.max(obj3D.scale.x, obj3D.scale.y, obj3D.scale.z);
          const distance = handPosition.distanceTo(obj3DPosition);

          if (distance > radius + handRadius) {
            continue
          }
    
          // Bounding box collision check
          const distanceToBox = pointToBox(handPosition, obj3D.boundingBox.min, obj3D.boundingBox.max, obj3D.matrixWorld.elements);
          // console.log("box", el.id, distanceToBox)

          if (distanceToBox > handRadius) {
            continue
          }

          const score = volume( obj3D.boundingBox );
          // console.log("score", el.id, score)
          if (score < minScore) {
            minScore = score;
            overlappingEl = el;
          }
        }
    
        return overlappingEl
      }

    })(),

    gatherElements() {
      const data = this.data;
      const sceneEl = this.el.sceneEl;

      this.grabEls = data.grabSelectors ? sceneEl.querySelectorAll( data.grabSelectors ) : [];

      if ( this.grabEls.length > TOO_MANY_ENTITIES_WARNING ) {
        console.warn( `many entities in grabSelectors (${ this.grabEls.length }), performance may be affected` );
      }

      this.toolEls = data.toolSelectors ? sceneEl.querySelectorAll( data.toolSelectors ) : [];

      if ( this.toolEls.length > TOO_MANY_ENTITIES_WARNING ) {
        console.warn( `many entities in toolSelectors (${ this.toolEls.length }), performance may be affected` );
      }

      const handEls = data.handSelectors ? sceneEl.querySelectorAll( data.handSelectors ) : [];
      this.setSides( Array.from( handEls ) );
    },

    setSides( handEls ) {
      for ( let i = 0; i < this.sides.length; ) {
        const side = this.sides[ i ];

        if ( !handEls.includes( side.hand ) ) {
          this.removeListeners( side );
          this.hideColliderDebug( side );
          this.sides.splice( i, 1 );
        } else {
          i++;
        }
      }

      for ( let el of handEls ) {
        if ( !this.sides.find( side => side.hand === el ) ) {
          const newSide = { hand: el, mode: "hover", };
          this.sides.push( newSide );
          this.addListeners( newSide );
          this.removeListeners( newSide );
        }
      }
    },

    updateHover: (function() {
      const handOffset = new THREE.Vector3();
      const yellow = new THREE.Color('yellow');
      const blue = new THREE.Color('blue');

      return function updateHover(side) {
        const data = this.data;
        const handObject3D = side.hand.object3D;
        const handRadius = data.colliderRadius;
        let newHoverEl = undefined;
        let newHoverType = undefined;
        
        handOffset.copy(data.colliderOffset).applyMatrix4(handObject3D.matrixWorld);

        // prefer tools to grab targets
        newHoverEl = this.findOverlapping(handOffset, handRadius, this.toolEls, data.debug ? blue : undefined);
        newHoverType = "tool";
        if (!newHoverEl) {
          newHoverEl = this.findOverlapping(handOffset, handRadius, this.grabEls, data.debug ? yellow : undefined);
          newHoverType = "grab";
        }

        // if (newHoverEl) console.log("closest", newHoverEl.id)

        if (side.target && side.target !== newHoverEl) {
          this.sendTwoEvents("hoverend", side.hand, side.target);
        }
        if (newHoverEl && newHoverEl !== side.target) {
          this.sendTwoEvents("hoverstart", side.hand, newHoverEl);
        } 
        side.target = newHoverEl;
        side.targetType = newHoverEl ? newHoverType : undefined;
      }
    })(),

    hideColliderDebug(side) {
      if (side.colliderDebug) {
        side.hand.object3D.remove( side.colliderDebug );
      }
    },

    showColliderDebug(side) {
      const data = this.data;
      if (side.hand && data.debug) {
        const sphereGeo = new THREE.SphereBufferGeometry(data.colliderRadius, 6, 6);
        sphereGeo.translate(data.colliderOffset.x, data.colliderOffset.y, data.colliderOffset.z);
        const wireGeo = new THREE.WireframeGeometry(sphereGeo);
        side.colliderDebug = new THREE.LineSegments( wireGeo, new THREE.LineBasicMaterial({color: 0xffff00}) );
        side.hand.object3D.add(side.colliderDebug);
      }
    },

    determineSide(el) {
      return this.sides.find( side => side.hand === el )
    },

    sendTwoEvents(name, handEl, targetEl) {
      const bubbles = this.data.bubbles;
      if (this.data.debug) {
        console.log( getDebugName( targetEl ), "send", name );
        console.log( getDebugName( this.el ), "send", name );
      }

      targetEl.emit(name, { hand: handEl, object: targetEl }, bubbles);
      this.el.emit(name, { hand: handEl, object: targetEl }, bubbles);
    },

    onSceneLoaded() {
      // only observe once the scene is loaded, this is better than doing it in the update()
      // where we would be spammed by the observer while the scene loads
      this.gatherElements();

      if (this.data.watch) {
        this.observer = new MutationObserver(this.onSceneChanged);
        this.observer.observe(this.el.sceneEl, {childList: true, subtree: true});
      }

      const data = this.data;
      if (this.sides.length === 0) { 
        console.warn(`unable to find any hand elements (${data.handSelectors})`);
      }
      if (this.grabEls.length === 0 && this.toolEls.length === 0) {
        console.warn(`no grab (${data.grabSelectors}) or tool (${data.toolSelectors}) elements`);
      }
    },

    onSceneChanged(mutations) {
      applyNodeMutations(this.grabEls, mutations, this.data.grabSelectors);
      applyNodeMutations(this.toolEls, mutations, this.data.toolSelectors);

      // assume no need to check hands for add/remove
    },

    onGrabStartEvent(e) {
      const side = this.determineSide(e.target);
      if (side && side.mode === "hover" && side.target && side.targetType === "grab") {
        this.sendTwoEvents("hoverend", side.hand, side.target);
        this.setMode(side, "grab");
        this.sendTwoEvents("grabstart", side.hand, side.target);
      }
    },

    onGrabEndEvent(e) {
      const side = this.determineSide(e.target);
      if (side.mode === "grab" && side.target) {
        this.sendTwoEvents("grabend", side.hand, side.target);
        this.setMode(side, "hover");
        side.target = undefined;
      }
    },

    onToolEquipEvent(e) {
      const side = this.determineSide(e.target);
      if (side.mode === "hover" && side.target && side.targetType === "tool") {
        this.sendTwoEvents("hoverend", side.hand, side.target);
        this.setMode(side, "tool");
        this.sendTwoEvents("toolequip", side.hand, side.target);
      }
    },

    onToolDropEvent(e) {
      const side = this.determineSide(e.target);
      if (side.mode === "tool" && side.target) {
        this.sendTwoEvents("tooldrop", side.hand, side.target);
        this.setMode(side, "hover");
        side.target = undefined;
      }
    },
  });

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

  // @ts-ignore
  const degToRad$2 = THREE.Math.degToRad;

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

  function toLowerCase$1(x) { return x.toLowerCase() }

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
      spawnType: { default: "continuous", oneOf: ["continuous", "burst"], parse: toLowerCase$1 },
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
      ribbonShape: { default: "flat", oneOf: ["flat", "taperin", "taperout", "taper"], parse: toLowerCase$1 },
      ribbonUVType: { default: "overtime", oneOf: UV_TYPE_STRINGS, parse: toLowerCase$1 },
      emitterColor: { type: "color" },

      lifeTime: { default: "1" },
      position: { default: "0 0 0" },
      velocity: { default: "0 0 0" },
      acceleration: { default: "0 0 0" },
      radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circlexz"], parse: toLowerCase$1 },
      radialPosition: { default: "0" },
      radialVelocity: { default: "0" },
      radialAcceleration: { default: "0" },
      angularVelocity: { default: "0 0 0" },
      angularAcceleration: { default: "0 0 0" },
      orbitalVelocity: { default: "0" },
      orbitalAcceleration: { default: "0" },
      scale: { default: "1" },
      color: { default: "white", parse: toLowerCase$1 },
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
      modelFill: { default: "triangle", oneOf: ["triangle", "edge", "vertex"], parse: toLowerCase$1 },
      direction: { default: "forward", oneOf: ["forward", "backward"], parse: toLowerCase$1 },
      particleOrder: { default: "any", oneOf: PARTICLE_ORDER_STRINGS },
      ribbonUVMultiplier: { default: 1 },
      materialSide: { default: "front", oneOf: ["double", "front", "back"], parse: toLowerCase$1 },
      screenDepthOffset: { default: 0 },
      alphaTest: { default: 0 },
      fog: { default: true },
      depthWrite: { default: false },
      depthTest: { default: true },
      blending: { default: "normal", oneOf: ["none", "normal", "additive", "subtractive", "multiply"], parse: toLowerCase$1 },
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
        this.rotationScaleOverTime[k] = degToRad$2(rotation[i]); // glsl rotationScaleOverTime[1..].x
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
        this[uniformAttr][j++] = degToRad$2(vecRange[i++]); // x
        this[uniformAttr][j++] = degToRad$2(vecRange[i++]); // y
        this[uniformAttr][j++] = degToRad$2(vecRange[i++]); // z
        j++; // skip the w
      }
    },

    updateAngularVec2PartRange(vecData, def, uniformAttr, part) {
      const vecRange = parseVecRange(vecData, def);
      this[uniformAttr][part] = degToRad$2(vecRange[0]);
      this[uniformAttr][part + 2] = degToRad$2(vecRange[1]);
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
  float particleID = rawParticleID > particleID0 ? rawParticleID - particleCount : rawParticleID; // cyclic (any)
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

  function toLowerCase$2(x) {
    return typeof x === "string" ? x.toLowerCase() : x
  }

  AFRAME.registerComponent('store', {
    schema: {
      type: { default: "temporary", oneOf: ["temporary", "local", "session"], parse: toLowerCase$2 },
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
        console.warn(`bind '${target}.${prop}' already exists`);
      }
      this.binds.push({key, target, prop});
    },

    unbind(key, target, prop) {
      const i = this.binds.findIndex(item => item.target === target && item.prop === prop && item.key === key);
      if (i >= 0) {
        this.binds.splice(i, 1);
      } else {
        console.warn(`unable to find bind '${target}.${prop}' for store key '${key}'`);
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
    },

    // copy new properties to the schema so they will appear in the Inspector
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
      this.hasUIListeners = false;
      this.raycasters = [];
      this.hoverEls = [];
      this.touchEls = new Map();
      this.onSetObject3D = this.onSetObject3D.bind(this);
      this.onRaycasterIntersected = this.onRaycasterIntersected.bind(this);
      this.onRaycasterIntersectedCleared = this.onRaycasterIntersectedCleared.bind(this);
      this.onClick = this.onClick.bind(this);

      this.el.addEventListener("setobject3d", this.onSetObject3D);

      this.createSVGTexture();
    },

    remove() {
      this.el.removeEventListener("setobject3d", this.onSetObject3D);

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
            console.warn(`template '${data.template}' doesn't look like SVG: ${text}`);
          }

          this.createSVGFunction(text);
          this.updateSVGTexture();
        });
        
      } else if (this.templateContent) {
        if (Object.keys(oldData) !== Object.keys(data)) {
          this.createSVGFunction(this.templateContent);
        }

        this.updateSVGTexture();
      }

      this.addUIListeners();
    },

    tick() {
      if (this.raycasters.length === 0) {
        this.el.sceneEl.removeBehavior(this);
      } else if (this.data.enabled) {
        this.updateHoverAndTouch();
      }
    },

    // other components can set the template content directly
    setTemplate(newContent) {
      this.templateContent = newContent;
      this.updateSVGTexture();
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
      const self = this;

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
        console.error("invalid svg", this.lastContent);
        texture.image.isReady = true;
        self.updatePendingContent();
      };

      texture.onUpdate = () => {
        texture.image.isReady = true;
        self.updatePendingContent();
      };

      this.updateSVGTexture();
      this.showSVGTextureOnMesh();
    },

    updateSVGTexture() {
      if (this.templateContent) {

        const generatedContent = this.processTemplate(this.templateContent);
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

            document.body.appendChild(this.proxyEl);
          }

          this.proxyEl.innerHTML = generatedContent;

          this.proxySVGEl = this.proxyEl.children[0];
          this.proxySVGEl.setAttribute("width", SVG_HTML_WIDTH);
          this.proxySVGEl.setAttribute("height", SVG_HTML_HEIGHT);
        }

        this.pendingContent = generatedContent;
        this.updatePendingContent();
      }
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
            console.warn(`svg-ui material color is not white, it may be difficult to see the ui`);
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

      for (let raycaster of this.raycasters) {
        if (raycaster) {
          let touchElements = [];
          let hasMoved = false;
          const intersection = raycaster.components.raycaster.getIntersection(this.el);
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

      for (let el of this.hoverEls) {
        if (!hoverElements.find(otherEl => otherEl.id === el.id)) {
          this.sendEvent("svg-ui-hoverend", { uiTarget: el, hovers: hoverElements.map(x => x.id) });
        }
      }

      for (let el of hoverElements) {
        if (!this.hoverEls.find(otherEl => otherEl.id === el.id)) {
          this.sendEvent("svg-ui-hoverstart", { uiTarget: el, hovers: hoverElements.map(x => x.id) });
        }
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

    onSetObject3D(e) {
      this.showSVGTextureOnMesh();
    },

    onRaycasterIntersected(e) {
      if (this.data.debug) {
        console.log("onRaycasterIntersected", this.el.id);
      }
      const raycaster = e.detail.el;

      this.touchEls.set(raycaster, { elements: [] });
      this.raycasters.push(raycaster);
      this.el.sceneEl.addBehavior(this);
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
  const degToRad$3 = THREE.Math.degToRad;
  const parseToLowerCase = str => (typeof str === "string") ? str.toLowerCase() : str;

  AFRAME.registerComponent("tool", {
    dependencies: ["position", "rotation", "scale"],

    schema: {
      debug: { default: false },
      handPosition: { type: "vec3" },
      handRotation: { type: "vec3" },
      handScale: { type: "vec3", default: {x:1, y:1, z:1} },
      usage: { default: "respawnondrop", oneOf: ["respawnOnDrop", "reparentOnEquip", "stayOnDrop"], parse: parseToLowerCase },

      // when we reparent this entity, the component is re-initialized, 
      // so before the reparent we can store the hand entity (see onToolEquip())
      // then on the first update recalculate the hand entity
      hand: { default: "" }
    },

    // this component will be re-initialized when we change it's parent
    init() {
      this.handA = undefined;
      this.onToolEquip = this.onToolEquip.bind(this);
      this.onToolDrop = this.onToolDrop.bind(this);
      this.handMatrix = new THREE.Matrix4();
      this.objectMatrixOnEquip = new THREE.Matrix4();
    },

    play() {
      this.el.addEventListener("toolequip", this.onToolEquip);
      this.el.addEventListener("tooldrop", this.onToolDrop);
    },

    pause() {
      this.el.removeEventListener("toolequip", this.onToolEquip);
      this.el.removeEventListener("tooldrop", this.onToolDrop);
    },

    update(oldData) {
      const data = this.data;

      if (oldData.handRotation !== data.handRotation || oldData.handPosition !== data.handPosition || oldData.handScale !== data.handScale) {
        const euler = new THREE.Euler().set(degToRad$3(data.handRotation.x), degToRad$3(data.handRotation.y), degToRad$3(data.handRotation.z), "YXZ");
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        this.handMatrix.compose(data.handPosition, quaternion, data.handScale);
      }

      // if we have a hand, then place the tool into that hand
      if (oldData.hand !== data.hand) {
        this.handA = data.hand ? document.querySelector(data.hand) : undefined;
      }
    },

    tick: (function() {
      const newMatrix = new THREE.Matrix4();
      const inverseParentMat = new THREE.Matrix4();

      return function tick() {
        if (!this.handA) {
          this.el.sceneEl.removeBehavior(this);
          return
        }
    
        const data = this.data;      
        if (this.handA && data.usage !== "reparentonequip") {
          const object3D = this.el.object3D;
          const hand3D = this.handA.object3D;

          hand3D.updateMatrixWorld(true);
          object3D.parent.updateMatrixWorld(true);

          // get the inverse each frame in case the parent is moving
          inverseParentMat.getInverse(object3D.parent.matrixWorld);
          newMatrix.copy(this.handMatrix).premultiply(hand3D.matrixWorld).premultiply(inverseParentMat);
          newMatrix.decompose(object3D.position, object3D.quaternion, object3D.scale);
        }
      }
    })(),

    onToolEquip(e) {
      const data = this.data;

      this.handA = e.detail.hand;
      this.el.setAttribute( "tool", { hand: "#" + e.detail.hand.id } );

      if (data.usage === "reparentonequip") {
        // remember the hand, so after the re-init() we start in that hand
        this.el.setAttribute("position", data.handPosition);
        this.el.setAttribute("rotation", data.handRotation);
        this.el.flushToDOM();
    
        this.handA.appendChild(this.el); // this will force a re-init()

      } else {
        this.objectMatrixOnEquip.copy(this.el.object3D.matrix);
        this.el.sceneEl.addBehavior(this);
      }
    },

    onToolDrop(e) {
      const data = this.data;
      const object3D = this.el.object3D;

      this.handA = undefined;
      this.el.setAttribute( "tool", { hand: "" } );

      if (data.usage === "reparentonequip") {
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldEuler = new THREE.Euler(0, 0, 0, "YXZ");

        object3D.getWorldPosition(worldPosition);
        object3D.getWorldQuaternion(worldQuaternion);
        worldEuler.setFromQuaternion(worldQuaternion, "YXZ");

        // set components directly because they are re-applied when we reparent
        this.el.setAttribute("position", worldPosition);
        this.el.setAttribute("rotation", `${radToDeg(worldEuler.x)} ${radToDeg(worldEuler.y)} ${radToDeg(worldEuler.z)}`);
        this.el.flushToDOM();

        this.el.sceneEl.appendChild(this.el); // this will force a re-init()

      } else if (data.usage === "respawnondrop") {
        
        this.objectMatrixOnEquip.decompose(object3D.position, object3D.quaternion, object3D.scale);
      }
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
        console.warn(`no trigger elements using '${data.triggerSelectors}' for trigger-zone`);
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

  const debug3D = function(obj3D) {
    let numVertices = 0;

    const stride = 3;
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array( 1000*stride );
    geo.addAttribute( "position", new THREE.BufferAttribute( vertices, stride) );
    const debugLine = new THREE.Line( geo, new THREE.LineBasicMaterial( { color: "lime" } ) );
    debugLine.name = "debug3D.debugLine";
    geo.setDrawRange( 0, 0 );
    obj3D.add( debugLine );

    function reset() {
      numVertices = 0;
      geo.setDrawRange( 0, 0 );
    }

    const end = new THREE.Vector3();

    function line( start, dir, len ) {
      copyVector3( numVertices++, start ); 
      copyVector3( numVertices++, end.copy( dir ).multiplyScalar( len ).add( start ) );
      geo.setDrawRange( 0, numVertices );
    }

    function copyVector3( index, vector3 ) {
      let i = index*stride;
      vertices[i++] = vector3.x;
      vertices[i++] = vector3.y;
      vertices[i++] = vector3.z;
    }

    return {
      reset,
      line,
    }
  };

  AFRAME.registerComponent("two-handed-transform", {
    schema: {
      left: { type: "selector" },
      right: { type: "selector" },
      startEvent: { default: "gripdown" },
      endEvent: { default: "gripup"},
      target: { type: "selector" },
      enable: { default: true },
      debug: { default: false },
    },

    init() {
      this.onStartEvent = this.onStartEvent.bind(this);
      this.onEndEvent = this.onEndEvent.bind(this);
      this.debug3D = debug3D(this.el.sceneEl.object3D);

      this.isEnabled = false;

      this.left = { hand: undefined, active: false, startPosition: new THREE.Vector3() };
      this.right = { hand: undefined, active: false, startPosition: new THREE.Vector3() };
      this.target = { 
        object3D: undefined, 
        startMatrix: new THREE.Matrix4(), 
        startPosition: new THREE.Vector3(), 
        startQuaternion: new THREE.Quaternion(),
        startScale: new THREE.Vector3(),
        handGap: new THREE.Vector3(), 
        handPivot: new THREE.Vector3(),
        rightPosition: new THREE.Vector3(),
      };
    },

    update(oldData) {
      const data = this.data;

      this.left.hand = data.left;
      this.left.active = false;
      this.right.hand = data.right;
      this.right.active = false;

      if (oldData.enable !== data.enable) {
        if (data.enable) {
          this.enable();
        } else {
          this.disable();
        }
      }
    },

    play() {
      if (this.data.enable) {
        this.enable();
      }
    },

    pause() {
      this.disable();
    },

    tick() {
      this.debug3D.reset();

      if (this.left.active !== this.right.active) {
        this.oneHanded(this.left.active ? this.left : this.right);
      } else if (this.left.active && this.right.active) {
        this.twoHanded();
      }
    },

    enable() {
      if (!this.isEnabled) {
        this.addListeners(this.left.hand);
        this.addListeners(this.right.hand);
        this.isEnabled = true;
      }
    },

    disable() {
      if (this.isEnabled) {
        this.left.active = false;
        this.right.active = false;
        this.removeListeners(this.left.hand);
        this.removeListeners(this.right.hand);
        this.isEnabled = false;
      }
    },

    onStartEvent(e) {
      if (this.data.debug) {
        console.log( getDebugName(this.el), this.attrName, "onStartEvent", e.type, getDebugName(e.target) );
      }

      if (e.target == this.left.hand) {
        this.activate(this.left);
      } else if (e.target == this.right.hand) {
        this.activate(this.right);
      }
    },

    onEndEvent(e) {
      if (this.data.debug) {
        console.log( getDebugName(this.el), this.attrName, "onEndEvent", e.type, getDebugName(e.target) );
      }

      if (e.target == this.left.hand) {
        this.deactivate(this.left);
      } else if (e.target == this.right.hand) {
        this.deactivate(this.right);
      }
    },

    addListeners(hand) {
      if (hand) {
        if (this.data.debug) {
          console.log( getDebugName(this.el), this.attrName, "addListeners", this.data.startEvent, this.data.endEvent, getDebugName(hand) );
        }
        hand.addEventListener(this.data.startEvent, this.onStartEvent);
        hand.addEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    removeListeners(hand) {
      if (hand) {
        if (this.data.debug) {
          console.log( getDebugName(this.el), this.attrName, "removeListeners", this.data.startEvent, this.data.endEvent, getDebugName(hand) );
        }
        hand.removeEventListener(this.data.startEvent, this.onStartEvent);
        hand.removeEventListener(this.data.endEvent, this.onEndEvent);
      }
    },

    activate(side) {
      side.active = true;
      this.captureStartPositions();
    },

    deactivate(side) {
      side.active = false;
      this.captureStartPositions();
    },

    captureStartPositions: (function() {
      const inverseTargetWorldMatrix = new THREE.Matrix4();
      const leftPositionWorld = new THREE.Vector3();
      const rightPositionWorld = new THREE.Vector3();
      const handShape = { translate: new THREE.Vector3(), scale: 1, euler: new THREE.Euler(0,0,0,"YXZ") };

      return function captureStartPositions() {
        const target3D = this.data.target ? this.data.target.object3D : this.el.object3D;
        this.target.object3D = target3D;

        if (target3D) {
          if (this.left.active) {
            this.left.startPosition.copy(this.left.hand.object3D.position);
          }
          if (this.right.active) {
            this.right.startPosition.copy(this.right.hand.object3D.position);
          }
    
          this.target.startMatrix.copy(target3D.matrix);
          this.target.startPosition.copy(target3D.position);
          this.target.startQuaternion.copy(target3D.quaternion);
          this.target.startScale.copy(target3D.scale);
    
          if (this.right.active && this.left.active) {
            this.left.hand.object3D.getWorldPosition(leftPositionWorld);
            this.right.hand.object3D.getWorldPosition(rightPositionWorld);
            this.target.handGap.copy(rightPositionWorld).sub(leftPositionWorld);
            this.target.handPivot.copy(this.right.hand.object3D.position).add(this.left.hand.object3D.position).multiplyScalar(0.5);
            this.target.rightPosition.copy(rightPositionWorld);

            // the rotationPivot is in target local space
            inverseTargetWorldMatrix.getInverse(this.target.object3D.matrixWorld);
            this.target.rotationPivot.copy(rightPositionWorld).add(leftPositionWorld).multiplyScalar(0.5);
            this.target.rotationPivot.applyMatrix4(inverseTargetWorldMatrix);
          }
        } else {
          console.warn(`unable to find Object3D for '${this.data.target}'`);
        }
      }
    
    })(),

    oneHanded: (function() {
      const newTranslate = new THREE.Vector3();
      const newScale = new THREE.Vector3(1,1,1);
      const newEuler = new THREE.Euler(0,0,0,"YXZ");
      const newQuaternion = new THREE.Quaternion();

      return function oneHanded(side) {
        const target3D = this.target.object3D;
        if (target3D) {
          newTranslate.copy(side.hand.object3D.position).sub(side.startPosition);

          // const scale = side.hand.object3D.position.distanceTo(side.startPosition)
          // newScale.set(scale, scale, scale)

          target3D.position.copy( newTranslate.add(this.target.startPosition) );
          // target3D.quaternion.copy( newQuaternion.multiply( this.target.startQuaternion ) )
          // target3D.scale.copy( newScale.multiply( this.target.startScale ) )
        }
      }
    })(),

    twoHanded: (function() {
      const firstPosition = new THREE.Vector3();
      const secondPosition = new THREE.Vector3();
      const newHandGap = new THREE.Vector3();
      const rotationGap = new THREE.Vector3();
      const newRotationGap = new THREE.Vector3();
      const newPivot = new THREE.Vector3();
      const newTranslate = new THREE.Vector3();
      const newScale = new THREE.Vector3(1,1,1);
      const newEuler = new THREE.Euler(0,0,0,"YXZ");
      const newQuaternion = new THREE.Quaternion();

      return function twoHanded() {
        const target3D = this.target.object3D;
        if (target3D) {
          firstPosition.copy(this.left.hand.object3D.position);
          secondPosition.copy(this.right.hand.object3D.position);
          newHandGap.copy(secondPosition).sub(firstPosition);
          newPivot.copy(secondPosition).add(firstPosition).multiplyScalar(0.5);

          const scale = newHandGap.length() / this.target.handGap.length();
          newScale.set(scale, scale, scale);

          newRotationGap.copy(secondPosition).sub(newPivot).normalize();
          rotationGap.copy(this.target.rightPosition).sub(this.target.handPivot).normalize();
          newQuaternion.setFromUnitVectors(rotationGap, newRotationGap);
          newEuler.setFromQuaternion(newQuaternion, "YXZ", false);
          newQuaternion.setFromEuler(newEuler);

          newTranslate.copy(secondPosition).add(firstPosition).multiplyScalar(0.5).sub(this.target.handPivot);

          target3D.position.copy( newTranslate.add( this.target.startPosition ) );
          target3D.quaternion.copy( newQuaternion.multiply( this.target.startQuaternion ) );
          target3D.scale.copy( newScale.multiply( this.target.startScale ) );
        }
      }
    })(),

  });

  function toLowerCase$3(str) { return str.toLowerCase() }

  const WRAPPING_MAP = {
    "repeat": THREE.RepeatWrapping,
    "clamptoedge": THREE.ClampToEdgeWrapping,
    "mirroredrepeat": THREE.MirroredRepeatWrapping,
  };

  AFRAME.registerComponent("uv-transform", {
    schema: {
      offset: { type: "vec2" },
      repeat: { type: "vec2", default: {x:1, y:1} },
      rotation: { type: "number" },
      center: { type: "vec2", default: {x:.5, y:.5} },
      meshName: { default: "mesh" },
      wrapS: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase$3},
      wrapT: { default: "repeat", oneOf: ["repeat", "clampToEdge", "mirroredRepeat"], parse: toLowerCase$3},
      maps: { type: "string", default: "map" }
    },

    multiple: true,

    init() {
      this.onObject3DSet = this.onObject3DSet.bind(this);

      this.el.addEventListener("object3dset", this.onObject3DSet);
    },

    remove() {
      this.el.removeEventListener("object3dset", this.onObject3DSet);
    },

    update(oldData) {
      const data = this.data;

      if (oldData.rotation !== data.rotation) {
        this.rotation = THREE.Math.degToRad(data.rotation);
      }

      if (oldData.wrapS !== data.wrapS || oldData.wrapT !== data.wrapT) {
        this.wrapS = WRAPPING_MAP[data.wrapS] || THREE.RepeatWrapping;
        this.wrapT = WRAPPING_MAP[data.wrapT] || THREE.RepeatWrapping;
      }

      if (oldData.maps !== data.maps) {
        this.maps = data.maps.split(",").map(x => x.trim());
      }

      this.updateUVs();
    },

    onObject3DSet(e) {
      if (e.target === this.el && e.detail.type === this.data.meshName) {
        this.updateUVs();
      }
    },

    updateUVs() {
      const data = this.data;
      const offset = data.offset;
      const repeat = data.repeat;
      const rotation = this.rotation;
      const center = data.center;
      const wrapS = this.wrapS;
      const wrapT = this.wrapT;

      function setElements(map) {
        if (map) {
          map.wrapS = wrapS;
          map.wrapT = wrapT;
          map.offset.copy(offset);
          map.repeat.copy(repeat);
          map.center.copy(center);
          map.rotation = rotation;
        }
      }

      const mesh = this.el.getObject3D(this.data.meshName);
      if (mesh && mesh.material) {
        for (let map of this.maps) {
          setElements(mesh.material[map]);
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
          console.warn("material color is very dark, vertex-color will also be dark");
        }

        console.assert(geometry.isBufferGeometry, "vertex-color only supports buffer geometry");

        if (!geometry.getAttribute("color")) {
          const whiteColors = new Float32Array(geometry.getAttribute("position").count*COLOR_FLOATS_PER_VERTEX$1).fill(1);
          geometry.addAttribute("color", new THREE.Float32BufferAttribute(whiteColors, COLOR_FLOATS_PER_VERTEX$1));
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
        this.eventListener.set(data.events, data.source, data.sourceScope, data.events);
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
      this.waitClock.clearAllTimeouts();
    },

    update(oldData) {
      const data = this.data;

      if (data.events !== oldData.events || data.source !== oldData.source || data.sourceScope !== oldData.sourceScope) {
        this.eventListener.set( data.events, data.source, data.sourceScope, data.events );
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

  function substitute$( str, el, event ) {
    return str.replace(/\$([\.\w]+)/g, (_, p1) => processValue( p1, el, event ) )
  }

  function processValue( value, el, event ) {
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

}));
