import { aframeHelper, utils } from "harlyq-helpers"

const MAX_FRAME = 64
const WHITE_TEXTURE = new THREE.DataTexture(new Uint8Array(3).fill(255), 1, 1, THREE.RGBFormat)
WHITE_TEXTURE.needsUpdate = true

function toLowerCase(x) { return x.toLowerCase() }

const BLENDING_MAP = {
  "none": THREE.NoBlending,
  "normal": THREE.NormalBlending,
  "additive": THREE.AdditiveBlending,
  "subtractive": THREE.SubtractiveBlending,
  "multiply": THREE.MultiplyBlending,
}

AFRAME.registerSystem('simple-particles', {
  schema: {
    enabled: { default: true }, // this will force warnings if the user tries to add the component version of simple-particles to the a-scene
  },

  init() {
    this.simpleParticles = {}
  },

  registerParticles(name, ptr) {
    if (this.simpleParticles[name]) {
      aframeHelper.error(`name '${name}' already in use`)
    } else {
      this.simpleParticles[name] = ptr
    }
  },

  unregisterParticles(name, ptr) {
    if (this.simpleParticles[name] !== ptr) {
      aframeHelper.error(`could not find particles '${name}'`)
    } else {
      this.simpleParticles[name] = undefined
    }
  },

  getParticles(name) {
    return this.simpleParticles[name]
  }
})



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
    blending: { default: "normal", oneOf: ["none", "normal", "additive", "subtractive", "multiply"], parse: toLowerCase },   
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
    this.mesh = undefined
    this.material = undefined
    this.geometry = undefined
    this.system.registerParticles(this.data.name, this)
    this.blocks = utils.blocks(this.data.count)
    this.createMesh(this.data.count)
  },

  remove() {
    this.system.unregisterParticles(this.data.name, this)
  },

  update(oldData) {
    const data = this.data

    if (data.texture !== oldData.texture) {
      this.loadTexture(data.texture)
    }

    if (data.textureFrame.x > MAX_FRAME || data.textureFrame.y > MAX_FRAME || data.textureFrame.x < 1 || data.textureFrame.y < 1) {
      aframeHelper.error(this, `textureFrame (${data.textureFrame.x},${data.textureFrame.y}) is expected in the range (1,${MAX_FRAME}) x (1,${MAX_FRAME})`)
    }

    if (data.textureFrame.x !== ~~data.textureFrame.x || data.textureFrame.y !== ~~data.textureFrame.y) {
      aframeHelper.error(this, `textureFrame must be an integer value`)
    }

    this.updateMaterial(this.material)
  },

  tick(time, deltaTime) {
    if (this.material) {
      this.material.uniforms.t.value = time/1000
    }
  },

  createMesh(particleCount) {
    this.geometry = new THREE.BufferGeometry()
    this.updateGeometry(this.geometry, particleCount)

    this.material = new THREE.RawShaderMaterial({
      uniforms: {
        map: { type: 't', value: WHITE_TEXTURE },
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
    })

    this.mesh = new THREE.Points(this.geometry, this.material)
    this.mesh.frustumCulled = false

    this.el.sceneEl.object3D.add(this.mesh)
  },

  updateGeometry(geometry, particleCount) {
    const NUM_KEYFRAMES = 3
    geometry.addAttribute("row1", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4))
    geometry.addAttribute("row2", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4))
    geometry.addAttribute("row3", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4))
    geometry.addAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(particleCount*3), 3))
    geometry.addAttribute("scales", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES))
    geometry.addAttribute("rotations", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES))
    geometry.addAttribute("colors", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES), NUM_KEYFRAMES)) // rgb is packed into a single float
    geometry.addAttribute("opacities", new THREE.Float32BufferAttribute(new Float32Array(particleCount*NUM_KEYFRAMES).fill(1), NUM_KEYFRAMES))
    geometry.addAttribute("frame", new THREE.Float32BufferAttribute(new Float32Array(particleCount*2), 2))
    geometry.addAttribute("timings", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4))
    geometry.addAttribute("velocity", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)) // linearVelocity (xyz) + radialVelocity
    geometry.addAttribute("acceleration", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)) // linearAcceleration (xyz) + radialAcceleration
    geometry.addAttribute("angularvelocity", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)) // angularVelocity (xyz) + orbitalVelocity
    geometry.addAttribute("angularacceleration", new THREE.Float32BufferAttribute(new Float32Array(particleCount*4), 4)) // angularAcceleration (xyz) + orbitalAcceleration

    const identity = new THREE.Matrix4()
    for (let i = 0; i < particleCount; i++) {
      this.setMatrixAt(i, identity)
    }
  },

  updateMaterial(material) {
    const data = this.data
    // material.uniforms.map.value = data.texture
    material.uniforms.particleSize.value = data.particleSize
    material.uniforms.textureFrame.value.x = data.textureFrame.x
    material.uniforms.textureFrame.value.y = data.textureFrame.y
    material.uniforms.usePerspective.value = data.usePerspective ? 1 : 0

    material.transparent = data.transparent
    material.alphaTest = data.alphaTest
    material.blending = BLENDING_MAP[data.blending]
    material.fog = data.fog
    material.depthWrite = data.depthWrite
    material.depthTest = data.depthTest

    const defines = {}
    if (data.useAngularMotion) defines.USE_ANGULAR_MOTION = true
    if (data.useRadialMotion) defines.USE_RADIAL_MOTION = true
    if (data.useOrbitalMotion) defines.USE_ORBITAL_MOTION = true
    if (data.useLinearMotion) defines.USE_LINEAR_MOTION = true
    if (data.useFramesOrRotation) defines.USE_FRAMES_OR_ROTATION = true
    if (data.fog) defines.USE_FOG = true

    material.defines = defines
    
    material.needsUpdate = true
  },

  loadTexture(filename) {
    if (filename) {
      let materialSystem = this.el.sceneEl.systems["material"]
      materialSystem.loadTexture(filename, {src: filename}, (texture) => {
        // if (this.isRibbon()) {
        //   texture.wrapS = THREE.RepeatWrapping // needed by ribbonUVMultipler
        // }
        this.material.uniforms.map.value = texture          
      })
    } else {
      this.material.uniforms.map.value = WHITE_TEXTURE
    }
  },

  setMatrixAt(i, mat4) {
    const m = mat4.elements
    const row1 = this.geometry.getAttribute("row1")
    const row2 = this.geometry.getAttribute("row2")
    const row3 = this.geometry.getAttribute("row3")
    row1.setXYZW(i, m[0], m[4], m[ 8], m[12])
    row2.setXYZW(i, m[1], m[5], m[ 9], m[13])
    row3.setXYZW(i, m[2], m[6], m[10], m[14])
  },

  setPositionAt(i, x, y, z) {
    const position = this.geometry.getAttribute("position")
    if (Array.isArray(x)) {
      z = x[2]
      y = x[1]
      x = x[0]
    } else if (typeof x === "object") {
      z = x.z
      y = x.y
      x = x.x
    }

    position.setXYZ(i, x, y, z)
  },

  setColorsAt(i, colorArray) {
    function pack3Floats(a, b, c) {
      return ~~(a*255)/256 + ~~(b*255)/65536 + ~~(c*255)/16777216
    }

    const colors = this.geometry.getAttribute("colors")
    const color0 = colorArray[0], color1 = colorArray[1], color2 = colorArray[2]
    let packedR, packedG, packedB

    switch (colorArray.length) {
      case 0: 
        packedR = packedG = packedB = pack3Floats(1, 1, 1) // white
        break

      case 1:
        packedR = pack3Floats(color0.r, color0.r, color0.r)
        packedG = pack3Floats(color0.g, color0.g, color0.g)
        packedB = pack3Floats(color0.b, color0.b, color0.b)
        break

      case 2:
        packedR = pack3Floats(color0.r, .5*(color0.r + color1.r), color1.r)
        packedG = pack3Floats(color0.g, .5*(color0.g + color1.g), color1.g)
        packedB = pack3Floats(color0.b, .5*(color0.b + color1.b), color1.b)
        break

      default:
        packedR = pack3Floats(color0.r, color1.r, color2.r)
        packedG = pack3Floats(color0.g, color1.g, color2.g)
        packedB = pack3Floats(color0.b, color1.b, color2.b)
        break
    }

    colors.setXYZ(i, packedR, packedG, packedB)
  },

  setOpacitiesAt(i, opacityArray) {
    const opacities = this.geometry.getAttribute("opacities")
    this.setKeyframesAt(opacities, i, opacityArray, 1)
  },

  setTimingsAt(i, spawnTime, lifeTime, loopTime, seed = Math.random() ) {
    const timings = this.geometry.getAttribute("timings")
    timings.setXYZW(i, spawnTime, lifeTime, loopTime, seed)
  },

  setFrameAt(i, frameStyle, startFrame, endFrame, width = 0, height = 0) {
    width = width || this.data.textureFrame.x
    height = height || this.data.textureFrame.y

    const frame = this.geometry.getAttribute("frame")
    const packA = ~~(width) + .015625*~~(height) + .000003814697265625*~~(startFrame)
    const packB = frameStyle + .000003814697265625*~~(endFrame)
    frame.setXY(i, packA, packB)
  },

  setScalesAt(i, scaleArray) {
    const scales = this.geometry.getAttribute("scales")
    this.setKeyframesAt(scales, i, scaleArray, 1)
  },

  setRotationsAt(i, rotationArray) {
    const rotations = this.geometry.getAttribute("rotations")
    this.setKeyframesAt(rotations, i, rotationArray, 0)
  },

  setVelocityAt(i, x, y, z, radial = 0) {
    const velocity = this.geometry.getAttribute("velocity")
    velocity.setXYZW(i, x, y, z, radial)
  },

  setAccelerationAt(i, x, y, z, radial = 0) {
    const acceleration = this.geometry.getAttribute("acceleration")
    acceleration.setXYZW(i, x, y, z, radial)
  },

  setAngularVelocityAt(i, x, y, z, orbital = 0) {
    const angularvelocity = this.geometry.getAttribute("angularvelocity")
    angularvelocity.setXYZW(i, x, y, z, orbital)
  },

  setAngularAccelerationAt(i, x, y, z, orbital = 0) {
    const angularacceleration = this.geometry.getAttribute("angularacceleration")
    angularacceleration.setXYZW(i, x, y, z, orbital)
  },

  setKeyframesAt(attribute, i, valueArray, defaultValue) {
    const x = valueArray[0], y = valueArray[1], z = valueArray[2]
    switch (valueArray.length) {
      case 0: attribute.setXYZ(i, defaultValue, defaultValue, defaultValue); break
      case 1: attribute.setXYZ(i, x, x, x); break
      case 2: attribute.setXYZ(i, x, .5*(x+y), y); break
      default: attribute.setXYZ(i, x, y, z); break
    }
  },

  needsUpdate() {
    this.geometry.getAttribute("row1").needsUpdate = true
    this.geometry.getAttribute("row2").needsUpdate = true
    this.geometry.getAttribute("row3").needsUpdate = true
    this.geometry.getAttribute("position").needsUpdate = true
    this.geometry.getAttribute("scales").needsUpdate = true
    this.geometry.getAttribute("colors").needsUpdate = true
    this.geometry.getAttribute("opacities").needsUpdate = true
    this.geometry.getAttribute("rotations").needsUpdate = true
    this.geometry.getAttribute("timings").needsUpdate = true
    this.geometry.getAttribute("frame").needsUpdate = true
    this.geometry.getAttribute("velocity").needsUpdate = true
    this.geometry.getAttribute("acceleration").needsUpdate = true
  },

  multipleNeedsUpdate(attributes) {
    for (let attribute of attributes) {
      this.needsUpdate(attribute)
    }
  },

  allocateParticles(count) {
    return this.blocks.allocate(count)
  },

  releaseParticles(index) {
    const count = this.blocks.release(index)
    if (count > 0) {
      const scales = this.geometry.getAttribute("scales")
      for (let i = index; i < index + count; i++) {
        scales.setXYZ(i, 0, 0, 0) // deactivate the particle
      }
    }

    return count
  }
})

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
}`

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
}`

