import { pseudorandom, attribute, interpolation } from "harlyq-helpers"

const toLowerCase = x => x.toLowerCase()
const warn = msg => console.warn("mesh-particles", msg)

const TWO_PI = 2*Math.PI
const PI_2 = .5*Math.PI
const VECTOR3_UP = new THREE.Vector3(0,1,0)
const degToRad = THREE.Math.degToRad

function vec3DegToRad(vec3) {
  return { x: degToRad(vec3.x), y: degToRad(vec3.y), z: degToRad(vec3.z) }
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

  // @ts-ignore
  const result = attribute.nestedSplit(str).map( str => attribute.parse(str) ).flat()
  if (!result.every(part => validateRangeOption(part, validateVec3))) {
    console.warn(`unrecognized array of vec3 range options '${str}'`)
    return undefined
  }
  return result
}

function parseFloatRangeOptionArray(str) {
  if (!str) return undefined

  // @ts-ignore
  const result = attribute.nestedSplit(str).map( str => attribute.parse(str) ).flat()
  if (!result.every(part => validateRangeOption(part, validateFloat))) {
    console.warn(`unrecognized array of float range options '${str}'`)
    return undefined
  }
  return result
}

function vec3OrFloatToVec3(vec3) {
  return typeof vec3 === "number" ? {x:vec3, y:vec3, z:vec3} : vec3
}

function parseScaleArray(str) {
  if (!str) return undefined

  // @ts-ignore
  const result = attribute.nestedSplit(str).map( str => attribute.parse(str) ).flat()
  if (!result.every(part => validateRangeOption(part, validateVec3) || validateRangeOption(part, validateFloat))) {
    console.warn(`unrecognized array of float or vec3 range options '${str}'`)
    return undefined
  }
  
  return result.map(rangeOption => {
    if (rangeOption.range) return { range: rangeOption.range.map(vec3OrFloatToVec3) }
    if (rangeOption.options) return { options: rangeOption.options.map(vec3OrFloatToVec3) }
  })
}

function parseColorRangeOptionArray(str) {
  if (!str) return undefined

  // @ts-ignore
  const result = attribute.nestedSplit(str.toLowerCase()).map( str => attribute.parse(str) ).flat()
  if (!result.every(part => validateRangeOption(part, validateColor))) {
    console.warn(`unrecognized array of color range options '${str}'`)
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
}


AFRAME.registerComponent("mesh-particles", {
  schema: {
    // TODO validate the input types
    duration: { default: -1 },
    instances: { default: "" },
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
    drag: { default: "" },
    source: { type: "selector" },
    destination: { type: "selector" },
    destinationOffset: { type: "vec3" },
    destinationWeight: { type: "number" },
    seed: { type: "int", default: -1 }
  },

  multiple: true,

  init() {
    this.spawnID = 0
    this.spawnCount = 0
    this.instances = []
    this.instanceIndices = []
    this.particles = []
    this.customData = {}
    this.lcg = pseudorandom.lcg()
  },

  remove() {
    this.releaseInstances()
  },

  update(oldData) {
    const data = this.data
    this.lcg.setSeed(data.seed)

    this.duration = data.duration

    for (let prop in data) {
      if (oldData[prop] !== data[prop] && prop in CUSTOM_PARSER) {
        this.customData[prop] = CUSTOM_PARSER[prop](data[prop])
      }
    }

    if (data.lifeTime !== oldData.lifeTime) {
      this.lifeTimeRule = attribute.parse(data.lifeTime)
      this.maxLifeTime = getMaxRangeOptions(this.lifeTimeRule)
      this.particles = []
    }

    if (data.delay !== oldData.delay) {
      this.startTime = data.delay // this will not work if we restart the spawner
    }

    if (data.source !== oldData.source) {
      this.source = this.el.object3D
      if (data.source) {
        const sourceEl = document.querySelector(data.source)
        if (sourceEl && sourceEl.object3D) { 
          this.source = sourceEl.object3D
        } else {
          warn(`unable to find object3D on source '${data.source}'`) 
        }
      }
    }

    if (data.target !== oldData.target) {
      this.target = undefined
      if (data.target) {
        const targetEl = document.querySelector(data.target)
        if (targetEl && targetEl.object3D) { 
          this.target = targetEl.object3D
        } else {
          warn(`unable to find object3D on target '${data.target}'`) 
        }
      }
    }

    if (data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime) {
      this.spawnRateRule = attribute.parse(data.spawnRate)
      this.maxParticles = getMaxRangeOptions(this.spawnRateRule)*this.maxLifeTime
      this.spawnRate = attribute.randomize(this.spawnRateRule, this.lcg.random) // How do we keep this in-sync?
    }

    if (data.instances !== oldData.instances || data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime) {
      this.spawnID = 0
      this.releaseInstances()

      this.instances = data.instances ? 
        [].slice.call(document.querySelectorAll(data.instances)).map(el => el.components ? el.components["instance"] : undefined).filter(x => x) :
        this.el.components["instance"] ? [this.el.components["instance"]] : []

      if (this.instances.length === 0) {
        if (data.instances) {
          warn(`no instances specified with: '${data.instances}'`)
        } else {
          warn(`no 'instance' component on this element`)
        }
      } else {
        // this.instanceBlocks = this.instances.map(inst => inst.requestBlock(this.maxParticles))
        // this.instanceBlocks.forEach((block,i) => { if (!block) warn(`unable to reserve blocks for instance '${this.instances[i].el.id}'`) })
        this.instanceIndices = this.instances.map( instance => instance.reserveBlock(Math.floor( this.maxParticles / this.instances.length)) )
        this.instanceIndices.forEach((index,i) => { if (index === undefined) warn(`unable to reserve blocks for instance '${this.instances[i].el.id}'`) })
      }
    }

  },

  tick(time, deltaTime) {
    const dt = Math.min(0.1, deltaTime*0.001) // cap the dt to help when we are debugging

    if ((this.duration < 0 || time - this.startTime < this.duration) && this.instances.length > 0) {
      this.spawnCount += this.spawnRate*dt

      if (this.spawnCount > 1) {
        this.spawnRate = attribute.randomize(this.spawnRateRule, this.lcg.random) // How do we keep this in-sync?
      }

      while (this.spawnCount > 1) {
        this.spawn()
        this.spawnCount--
      }
    }
    this.move(dt)
  },

  releaseInstances() {
    this.instances.forEach((instance, i) => instance.releaseBlock(this.instanceIndices[i]))
    this.instanceIndices.length = 0
    this.spawnID = 0
  },

  configureRandomizer(id) {
    // TODO this may not be random enough, try a second type of randomizer
    if (this.data.seed > 0) {
      this.lcg.setSeed(id + 1)
      this.lcg.setSeed(this.data.seed + this.lcg.random()*12783891)
    }
  },

  instanceFromID(spawnID) {
    const particleID = (spawnID % this.maxParticles)
    const instanceIndex = spawnID % this.instances.length
    const instance = this.instances[instanceIndex]
    if (this.instanceIndices[instanceIndex] === undefined) {
      return [undefined, undefined, undefined]
    }

    const instanceID = this.instanceIndices[instanceIndex] + particleID/this.instances.length
    return [instance, instanceID, particleID]
  },

  spawn() {
    const data = this.data
    const cData = this.customData

    const random = this.lcg.random

    this.configureRandomizer(this.spawnID)

    const newParticle = {}
    newParticle.age = 0
    newParticle.col = new THREE.Color()
    newParticle.col.a = 1 // for opacity
    newParticle.pos = new THREE.Vector3(0,0,0)
    newParticle.vel = new THREE.Vector3(0,0,0)
    newParticle.acc = new THREE.Vector3(0,0,0)    
    newParticle.angularVel = new THREE.Vector3(0,0,0)
    newParticle.angularAcc = new THREE.Vector3(0,0,0)
    newParticle.orbitalVel = 0
    newParticle.orbitalAcc = 0

    newParticle.sourcePosition = new THREE.Vector3().copy(this.source.position)
    newParticle.sourceQuaternion = new THREE.Quaternion().copy(this.source.quaternion)
    newParticle.sourceScale = new THREE.Vector3().copy(this.source.scale)

    newParticle.lifeTime = attribute.randomize(this.lifeTimeRule, random)
    newParticle.positions = cData.position ? cData.position.map(part => attribute.randomize(part, random)) : undefined
    newParticle.rotations = cData.rotation ? cData.rotation.map(part => vec3DegToRad( attribute.randomize(part, random) )) : undefined
    newParticle.scales = cData.scale ? cData.scale.map(part => attribute.randomize(part, random)) : undefined
    newParticle.colors = cData.color ? cData.color.map(part => attribute.randomize(part, random)) : undefined
    newParticle.opacities = cData.opacity ? cData.opacity.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPhi = (data.radialType !== "circlexz") ? random()*TWO_PI : PI_2
    newParticle.radialTheta = data.radialType === "circleyz" ? 0 : (data.radialType === "circle" || data.radialType === "circlexy") ? PI_2 : random()*TWO_PI
    newParticle.velocities = cData.velocity ? cData.velocity.map(part => attribute.randomize(part, random)) : undefined
    newParticle.accelerations = cData.acceleration ? cData.acceleration.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPositions = cData.radialPosition ? cData.radialPosition.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialVelocities = cData.radialVelocity ? cData.radialVelocity.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialAccelerations = cData.radialAcceleration ? cData.radialAcceleration.map(part => attribute.randomize(part, random)) : undefined
    newParticle.angularVelocities = cData.angularVelocity ? cData.angularVelocity.map(part => vec3DegToRad( attribute.randomize(part, random) )) : undefined
    newParticle.angularAccelerations = cData.angularAcceleration ? cData.angularAcceleration.map(part => vec3DegToRad( attribute.randomize(part, random) )) : undefined
    newParticle.orbitalVelocities = cData.orbitalVelocity ? cData.orbitalVelocity.map(part => degToRad( attribute.randomize(part, random) )) : undefined
    newParticle.orbitalAccelerations = cData.orbitalAcceleration ? cData.orbitalAcceleration.map(part => degToRad( attribute.randomize(part, random) )) : undefined

    newParticle.orbitalAxis = new THREE.Vector3()

    const particleID = (this.spawnID % this.maxParticles)
    this.particles[particleID] = newParticle
    this.spawnID++
  },

  move: (function() {
    const tempPosition = new THREE.Vector3(0,0,0)
    const tempEuler = new THREE.Euler(0,0,0,"YXZ")
    const tempQuaternion = new THREE.Quaternion(0,0,0,1)
    const tempScale = new THREE.Vector3(1,1,1)
    const tempColor = new THREE.Color(0,0,0)
    const tempVec3 = new THREE.Vector3(0,0,0)

    return function move(dt) {

      for (let id = Math.max(0, this.spawnID - this.maxParticles); id < this.spawnID; id++) {
        const [instance, i, particleID] = this.instanceFromID(id)
        if (instance === undefined) {
          continue // no instance available
        }

        const particle = this.particles[particleID]
        const t = particle.age/particle.lifeTime
        const isFirstFrame = t === 0
        let hasMovement = false
        let hasColor = false


        if (t > 1) {
          instance.setScaleAt(i, {x:0,y:0,z:0})
          continue // particle has expired
        }
  
        const age = particle.age  
        particle.age += dt

        if (particle.positions && (isFirstFrame || particle.positions.length > 1)) {
          particle.pos.copy( this.lerpVector(particle.positions, t) )
        }
  
        if (particle.radialPositions && (isFirstFrame || particle.radialPositions.length > 1)) {
          particle.pos.setFromSphericalCoords( this.lerpFloat(particle.radialPositions, t), particle.radialPhi, particle.radialTheta )
        }
  
        if (particle.accelerations && (isFirstFrame || particle.accelerations.length > 1)) {
          particle.acc.copy( this.lerpVector(particle.accelerations, t) )
        }
  
        if (particle.radialAccelerations && (isFirstFrame || particle.radialAccelerations.length > 1)) {
          particle.acc.setFromSphericalCoords( this.lerpFloat(particle.radialAccelerations, t), particle.radialPhi, particle.radialTheta )
        }
  
        if (particle.velocities && (isFirstFrame || particle.velocities.length > 1)) {
          particle.vel.copy( this.lerpVector(particle.velocities, t) )
        }
  
        if (particle.radialVelocities && (isFirstFrame || particle.radialVelocities.length > 1)) {
          particle.vel.setFromSphericalCoords( this.lerpFloat(particle.radialVelocities, t), particle.radialPhi, particle.radialTheta )
        }
  
        if (particle.accelerations || particle.radialAccelerations || particle.velocities || particle.radialVelocities) {
          tempPosition.copy( particle.acc ).multiplyScalar( 0.5*age ).add( particle.vel ).multiplyScalar( age ).add( particle.pos )
          hasMovement = true
        } else if (particle.positions|| particle.radialPositions) {
          tempPosition.copy( particle.pos )
        } else {
          tempPosition.set(0,0,0)
        }

        if (particle.orbitalAccelerations && (isFirstFrame || particle.orbitalAccelerations.length > 1)) {
          particle.orbitalAcc = this.lerpFloat(particle.orbitalAccelerations, t)
        }

        if (particle.orbitalVelocities && (isFirstFrame || particle.orbitalVelocities.length > 1)) {
          particle.orbitalVel = this.lerpFloat(particle.orbitalVelocities, t)
        }

        if (particle.orbitalAccelerations || particle.orbitalVelocities) {
          if (isFirstFrame) {
            particle.orbitalAxis.copy( tempVec3.copy(particle.pos).normalize().cross(VECTOR3_UP).normalize() )
          }
          const orbitalAngle = ( particle.orbitalVel + 0.5*age*particle.orbitalAcc )*age
          tempQuaternion.setFromAxisAngle( particle.orbitalAxis, orbitalAngle )
          tempPosition.applyQuaternion( tempQuaternion )
          hasMovement = true
        }

        if (particle.angularAccelerations && (isFirstFrame || particle.angularAccelerations.length > 1)) {
          particle.angularAcc.copy( this.lerpVector(particle.angularAccelerations, t) )
        }

        if (particle.angularVelocities && (isFirstFrame || particle.angularVelocities.length > 1)) {
          particle.angularVel.copy( this.lerpVector(particle.angularVelocities, t) )
        }

        if (particle.angularAccelerations || particle.angularVelocities) {
          tempVec3.copy( particle.angularAcc ).multiplyScalar( 0.5*age ).add( particle.angularVel ).multiplyScalar( age )
          tempEuler.set( tempVec3.x, tempVec3.y, tempVec3.z, "YXZ" )
          tempQuaternion.setFromEuler( tempEuler )
          tempPosition.applyQuaternion( tempQuaternion )
          hasMovement = true
        }

        if (isFirstFrame || hasMovement) {
          tempPosition.add( particle.sourcePosition )
          instance.setPositionAt(i, tempPosition.x, tempPosition.y, tempPosition.z)
        }

        if (particle.opacities && (isFirstFrame || particle.opacities.length > 1)) {
          particle.col.a = this.lerpFloat(particle.opacities, t)
          hasColor = true
        }

        if (particle.colors && (isFirstFrame || particle.colors.length > 1)) {
          // colour is independent of the entity color
          tempColor.copy( this.lerpVector(particle.colors, t) )
          particle.col.setRGB(tempColor.r, tempColor.g, tempColor.b)
          hasColor = true
        }

        if (isFirstFrame || hasColor) {
          instance.setColorAt(i, particle.col.r, particle.col.g, particle.col.b, particle.col.a)
        }

        if (particle.rotations && (isFirstFrame || particle.rotations.length > 1)) {
          if (particle.rotations.length > 0) {
            tempEuler.setFromVector3( this.lerpVector(particle.rotations, t) )
            tempQuaternion.setFromEuler(tempEuler)
            tempQuaternion.premultiply(particle.sourceQuaternion)
          } else {
            tempQuaternion.copy(particle.sourceQuaternion)
          }
          instance.setQuaternionAt(i, tempQuaternion.x, tempQuaternion.y, tempQuaternion.z, tempQuaternion.w)
        }
  
        if (particle.scales && (isFirstFrame || particle.scales.length > 1)) {
          tempScale.copy(particle.sourceScale)
          if (particle.scales.length > 0) {
            tempScale.multiply( tempVec3.copy( this.lerpVector(particle.scales, t) ) )
          }
          instance.setScaleAt(i, tempScale.x, tempScale.y, tempScale.z)
        }
  
      }
    }
  })(),

  lerpFloat(floats, t) {
    const [i,r] = interpolation.lerpKeys(floats, t)
    return interpolation.lerp(floats[i], floats[i+1], r)
  },

  lerpVector(numbers, t) {
    const [i,r] = interpolation.lerpKeys(numbers, t)
    return interpolation.lerpObject(numbers[i], numbers[i+1], r)
  },
})

