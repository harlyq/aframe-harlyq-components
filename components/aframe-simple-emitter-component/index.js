import { aframeHelper, attribute, interpolation, threeHelper } from "harlyq-helpers"

const MAX_FRAME = 64
const degToRad = THREE.Math.degToRad
const VEC3_ZERO = new THREE.Vector3(0,0,0)

const SPAWN_GEOMETRY_FUNCTIONS = {
  "geometrytriangle": threeHelper.randomPointInTriangle,
  "geometryedge": threeHelper.randomPointOnTriangleEdge,
  "geometryvertex": threeHelper.randomVertex,
}

const FRAME_STYLES = ["sequence", "randomsequence", "random"]

function toLowerCase(str) {
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
    frameStyle: { default: "sequence", oneOf: FRAME_STYLES, parse: toLowerCase },
    velocity: { default: "0 0 0" },
    acceleration: { default: "0 0 0" },
    radialVelocity: { default: "0" },
    radialAcceleration: { default: "0" },
    angularVelocity: { default: "0 0 0" },
    angularAcceleration: { default: "0 0 0" },
    orbitalVelocity: { default: "0" },
    orbitalAcceleration: { default: "0" },
    spawnShape: { default: "point", oneOf: ["point", "geometrytriangle", "geometryedge", "geometryvertex", "circle", "sphere", "box", "insidecircle", "insidesphere", "insidebox" ], parse: toLowerCase },
    spawnGeometry: { type: "selector" },
  },

  multiple: true,

  init() {
    this.particleSystem = this.el.sceneEl.systems["simple-particles"].getParticles(this.data.particles)
    this.startIndex = undefined
    this.endIndex = undefined
    this.maxLifeTime = undefined
    this.spawnCount = 0
    this.particles = []
    this.enabled = true
    this.spawnOffsets = undefined
  },

  remove() {
    if (this.startIndex) {
      this.particleSystem.releaseParticles(this.startIndex)
    }
  },

  update(oldData) {
    const data = this.data

    if (typeof data === "string") {
      aframeHelper.warn(this, `attributes are incorrectly formatted '${data}'`)
      return
    }

    this.lifeTime = attribute.parseNumber(data.lifeTime)
    this.loopTime = attribute.parseNumber(data.loopTime)
    this.rotations = attribute.parseNumberArray(data.rotations, degToRad)
    this.scales = attribute.parseNumberArray(data.scales)
    this.opacities = attribute.parseNumberArray(data.opacities)
    this.colors = attribute.parseColorArray(data.colors)
    this.frames = attribute.parseNumberArray(data.frames)
    this.frameStyle = FRAME_STYLES.indexOf(data.frameStyle) ? FRAME_STYLES.indexOf(data.frameStyle) : 0
    this.velocity = attribute.parseVec3(data.velocity)
    this.acceleration = attribute.parseVec3(data.acceleration)
    this.radialVelocity = attribute.parseNumber(data.radialVelocity)
    this.radialAcceleration = attribute.parseNumber(data.radialAcceleration)
    this.angularVelocity = attribute.parseVec3(data.angularVelocity)
    this.angularAcceleration = attribute.parseVec3(data.angularAcceleration)
    this.orbitalVelocity = attribute.parseNumber(data.orbitalVelocity)
    this.orbitalAcceleration = attribute.parseNumber(data.orbitalAcceleration)

    if (SPAWN_GEOMETRY_FUNCTIONS[data.spawnShape] && data.spawnGeometry !== oldData.spawnGeometry) {
      this.spawnGeometryFunction = SPAWN_GEOMETRY_FUNCTIONS[data.spawnShape]
      this.spawnOffsets = this.calcSpawnOffsetsFromGeometry(data.spawnGeometry || this.el)
    } else {
      this.spawnGeometryFunction = undefined
      this.spawnOffsets = undefined
    }

    if (data.textureFrame.x > MAX_FRAME || data.textureFrame.y > MAX_FRAME || data.textureFrame.x < 0 || data.textureFrame.y < 0) {
      aframeHelper.error(this, `textureFrame (${data.textureFrame.x},${data.textureFrame.y}) is expected in the range (0,${MAX_FRAME}) x (0,${MAX_FRAME})`)
    }

    if (data.textureFrame.x !== ~~data.textureFrame.x || data.textureFrame.y !== ~~data.textureFrame.y) {
      aframeHelper.error(this, `textureFrame must be an integer value`)
    }

    const particleSystem = this.particleSystem
    if (particleSystem) {
      this.maxLifeTime = attribute.getMaximum(this.lifeTime)

      if (this.startIndex) {
        particleSystem.releaseParticles(this.startIndex)
        this.startIndex = undefined
        this.endIndex = undefined
      }

      this.startIndex = particleSystem.allocateParticles(data.count)
      if (this.startIndex !== undefined) {
        this.endIndex = this.startIndex + data.count
      }

      this.enabled = this.data.enabled

      this.createParticles(0)

    } else {
      this.enabled = false
    }
  },

  createParticles(t) {
    const data = this.data
    const loopTime = Math.max( attribute.randomize(this.loopTime), attribute.getMaximum(this.lifeTime) )
    const spawnDelta = loopTime/data.count

    this.el.object3D.updateMatrixWorld()
    
    for (let i = this.startIndex; i < this.endIndex; i++) {
      this.spawn(i, t + i*spawnDelta, loopTime)
    }

    this.particleSystem.needsUpdate()
  },

  spawn: (function () {
    const offset = new THREE.Vector3()

    return function spawn(i, t, loopTime) {
      const data = this.data

      const scales = attribute.randomizeArray(this.scales)
      const rotations = attribute.randomizeArray(this.rotations)
      const colors = attribute.randomizeArray(this.colors)
      const opacities = attribute.randomizeArray(this.opacities)
      const frames = attribute.randomizeArray(this.frames)
      const lifeTime = attribute.randomize(this.lifeTime)
      const velocity = attribute.randomize(this.velocity)
      const acceleration = attribute.randomize(this.acceleration)
      const radialVelocity = attribute.randomize(this.radialVelocity)
      const radialAcceleration = attribute.randomize(this.radialAcceleration)
      const angularVelocity = attribute.randomize(this.angularVelocity)
      const angularAcceleration = attribute.randomize(this.angularAcceleration)
      const orbitalVelocity = attribute.randomize(this.orbitalVelocity)
      const orbitalAcceleration = attribute.randomize(this.orbitalAcceleration)

      if (this.spawnGeometryFunction && this.spawnOffsets) {
        this.spawnGeometryFunction(this.spawnOffsets, offset)
      } else {
        offset.copy(VEC3_ZERO)
      }
  
      const particleSystem = this.particleSystem
      particleSystem.setMatrixAt(i, this.el.object3D.matrixWorld)
      particleSystem.setPositionAt(i, offset.x, offset.y, offset.z)
      particleSystem.setScalesAt(i, scales)
      particleSystem.setColorsAt(i, colors)
      particleSystem.setRotationsAt(i, rotations)
      particleSystem.setOpacitiesAt(i, opacities)

      const startFrame = frames.length > 0 ? frames[0] : 0
      const endFrame = frames.length > 1 ? frames[1] : startFrame
      particleSystem.setFrameAt(i, this.frameStyle, startFrame, endFrame, data.textureFrame.x, data.textureFrame.y)

      particleSystem.setTimingsAt(i, t, lifeTime, loopTime)
      particleSystem.setVelocityAt(i, velocity.x, velocity.y, velocity.z, radialVelocity)
      particleSystem.setAccelerationAt(i, acceleration.x, acceleration.y, acceleration.z, radialAcceleration)
      particleSystem.setAngularVelocityAt(i, angularVelocity.x, angularVelocity.y, angularVelocity.z, orbitalVelocity)
      particleSystem.setAngularAccelerationAt(i, angularAcceleration.x, angularAcceleration.y, angularAcceleration.z, orbitalAcceleration)
    }
  })(),

  calcSpawnOffsetsFromGeometry(geometry) {
    if (!geometry || !geometry.object3D) {
      return undefined
    }

    let worldPositions = []
    const pos = new THREE.Vector3()
    const inverseObjectMatrix = new THREE.Matrix4()
    const mat4 = new THREE.Matrix4()

    geometry.object3D.updateMatrixWorld()
    inverseObjectMatrix.getInverse(geometry.object3D.matrixWorld)

    geometry.object3D.traverse(node => {
      if (!node.geometry || !node.geometry.getAttribute) {
        return
      }

      const position = node.geometry.getAttribute("position")
      if (!position || position.itemSize !== 3) {
        return
      }

      for (let i = 0; i < position.count; i++) {
        mat4.copy(node.matrixWorld).multiply(inverseObjectMatrix)
        pos.fromBufferAttribute(position, i).applyMatrix4(mat4)
        worldPositions.push(pos.x, pos.y, pos.z)
      }
    })

    return Float32Array.from(worldPositions)
  },

})

function interpolateObjectKeyframes(out, a, r) {
  const n = a.length

  if (r === 0 || n === 1) {
    return Object.assign(out, a[0])
  } else if (r >= 1) {
    return Object.assign(out, a[n - 1])
  }

  r *= n - 1
  const index = Math.floor( r )
  const ratio = r - Math.floor(index)

  for (let k in a[index]) {
    out[k] = interpolation.lerp(a[index][k], a[index + 1][k], ratio)
  }

  return out
}

function inerpolateArrayKeyframes(out, a, r) {
  const n = a.length

  if (r === 0 || n === 1) {
    return arrayCopy(out, a[0])
  } else if (r >= 1) {
    return arrayCopy(out, a[n - 1])
  }

  r *= n - 1
  const index = Math.floor( r )
  const ratio = r - Math.floor(index)

  const m = a[index].length
  out.length = m

  for (let i = 0; i < m; i++) {
    out[i] = interpolation.lerp(a[index][i], a[index + 1][i], ratio)
  }

  return out
}

function arrayCopy(out, a) {
  const n = a.length
  out.length = n
  for (let i = 0; i < n; i++) {
    out[i] = a[i]
  }
  return out
}

function interpolateNumberKeyframes(a, r) {
  const n = a.length

  if (r === 0 || n === 1) {
    return a[0]
  } else if (r >= 1) {
    return a[n - 1]
  }

  r *= n - 1
  const index = Math.floor( r )
  const ratio = r - Math.floor(index)

  return interpolation.lerp(a[index], a[index + 1], ratio)
}
