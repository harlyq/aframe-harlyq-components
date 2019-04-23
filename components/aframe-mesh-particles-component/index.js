import { pseudorandom, attribute, interpolation, rgbcolor } from "harlyq-helpers"

const toLowerCase = x => x.toLowerCase()
const warn = msg => console.warn("mesh-particles", msg)

const OVER_TIME_PROPERTIES = [/*"position", "velocity", "acceleration", "radialPosition", "radialVelocity", "radialAcceleration", "angularVelocity", "angularAcceleration", "orbitalVelocity", "orbitalAcceleration", "scale", "color", "rotation",*/ "opacity", "drag"]
const TWO_PI = 2*Math.PI
const PI_2 = .5*Math.PI
const VECTOR3_UP = new THREE.Vector3(0,1,0)

function getMaxRangeOptions(rule) {
  return rule.options ? Math.max(...rule.options) : Math.max(...rule.range)
} 

function validateFloat(number) {
  return Array.isArray(number) && typeof number[0] === "number"
}

function validateVec3(vec3) {
  return Array.isArray(vec3) && typeof vec3[0] === "number" && typeof vec3[1] === "number" && typeof vec3[2] === "number"
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

function vec3OrFloatToVec3(numbers) {
  return numbers.length === 1 ? [numbers[0], numbers[0], numbers[0]] : numbers
}

function parseScaleArray(str) {
  if (!str) return undefined

  // @ts-ignore
  const result = attribute.nestedSplit(str).map( str => attribute.parse(str) ).flat()
  if (!result.every(part => validateRangeOption(part, validateVec3) || validateRangeOption(part, validateFloat))) {
    console.warn(`unrecognized array of vec3 range options '${str}'`)
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


AFRAME.registerComponent("mesh-particles", {
  schema: {
    // TODO validate the input types
    duration: { default: -1 },
    instances: { default: "" },
    spawnRate: { default: "10" },
    lifeTime: { default: "1" },
    position: { default: "", parse: parseVec3RangeOptionArray },
    velocity: { default: "", parse: parseVec3RangeOptionArray },
    acceleration: { default: "", parse: parseVec3RangeOptionArray },
    radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circleyz", "circlexz"], parse: toLowerCase },
    radialPosition: { default: "", parse: parseFloatRangeOptionArray },
    radialVelocity: { default: "", parse: parseFloatRangeOptionArray },
    radialAcceleration: { default: "", parse: parseFloatRangeOptionArray },
    angularVelocity: { default: "", parse: parseVec3RangeOptionArray },
    angularAcceleration: { default: "", parse: parseVec3RangeOptionArray },
    orbitalVelocity: { default: "", parse: parseFloatRangeOptionArray },
    orbitalAcceleration: { default: "", parse: parseFloatRangeOptionArray },
    scale: { default: "", parse: parseScaleArray },
    color: { default: "", parse: parseColorRangeOptionArray },
    rotation: { default: "", parse: parseVec3RangeOptionArray },
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
    this.instanceIndices = []
    this.instanceIndices = []
    this.particles = []
    this.lcg = pseudorandom.lcg()
  },

  remove() {

  },

  update(oldData) {
    const data = this.data
    this.lcg.setSeed(data.seed)

    this.duration = data.duration

    if (data.lifeTime !== oldData.lifeTime) {
      this.lifeTimeRule = attribute.parse(data.lifeTime)
      this.maxLifeTime = getMaxRangeOptions(this.lifeTimeRule)
      this.particles = []
    }

    if (data.delay !== oldData.delay) {
      this.startTime = data.delay // this will not work if we restart the spawner
    }

    if (data.spawnRate !== oldData.spawnRate || data.lifeTime !== oldData.lifeTime) {
      this.spawnRateRule = attribute.parse(data.spawnRate)
      this.maxParticles = getMaxRangeOptions(this.spawnRateRule)*this.maxLifeTime
      this.spawnRate = attribute.randomize(this.spawnRateRule, this.lcg.random) // How do we keep this in-sync?
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

    if (data.instances !== oldData.instances) {
      this.instanceIndices = []
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
        this.instanceIndices.forEach((index,i) => { if (index === -1) warn(`unable to reserve blocks for instance '${this.instances[i].el.id}'`) })
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
    const instanceID = this.instanceIndices[instanceIndex] + particleID/this.instances.length
    return [instance, instanceID, particleID]
  },

  spawn() {
    const data = this.data

    const random = this.lcg.random
    const degToRad = THREE.Math.degToRad

    this.configureRandomizer(this.spawnID)

    const newParticle = {}
    newParticle.age = 0
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
    newParticle.lifeTime = attribute.randomize(this.lifeTimeRule, random)[0]
    newParticle.positions = data.position ? data.position.map(part => attribute.randomize(part, random)) : undefined
    // @ts-ignore
    newParticle.rotations = data.rotation ? data.rotation.map(part => attribute.randomize(part, random).map(deg => degToRad(deg))) : undefined
    newParticle.scales = data.scale ? data.scale.map(part => attribute.randomize(part, random)) : undefined
    newParticle.colors = data.color ? data.color.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPhi = (data.radialType !== "circlexz") ? random()*TWO_PI : PI_2
    newParticle.radialTheta = data.radialType === "circleyz" ? 0 : (data.radialType === "circle" || data.radialType === "circlexy") ? PI_2 : random()*TWO_PI
    newParticle.velocities = data.velocity ? data.velocity.map(part => attribute.randomize(part, random)) : undefined
    newParticle.accelerations = data.acceleration ? data.acceleration.map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPositions = data.radialPosition ? data.radialPosition.map(part => attribute.randomize(part, random)[0]) : undefined
    newParticle.radialVelocities = data.radialVelocity ? data.radialVelocity.map(part => attribute.randomize(part, random)[0]) : undefined
    newParticle.radialAccelerations = data.radialAcceleration ? data.radialAcceleration.map(part => attribute.randomize(part, random)[0]) : undefined
    // @ts-ignore
    newParticle.angularVelocities = data.angularVelocity ? data.angularVelocity.map(part => attribute.randomize(part, random).map(deg => degToRad(deg))) : undefined
    // @ts-ignore
    newParticle.angularAccelerations = data.angularAcceleration ? data.angularAcceleration.map(part => attribute.randomize(part, random).map(deg => degToRad(deg))) : undefined
    newParticle.orbitalVelocities = data.orbitalVelocity ? data.orbitalVelocity.map(part => degToRad( attribute.randomize(part, random)[0] )) : undefined
    newParticle.orbitalAccelerations = data.orbitalAcceleration ? data.orbitalAcceleration.map(part => degToRad( attribute.randomize(part, random)[0] )) : undefined

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
        const particle = this.particles[particleID]
        const t = particle.age/particle.lifeTime
        const isFirstFrame = t === 0
        let hasMovement = false


        if (t > 1) {
          instance.setScaleAt(i, {x:0,y:0,z:0})
          continue // particle has expired
        }
  
        const age = particle.age  
        particle.age += dt

        if (particle.positions && (isFirstFrame || particle.positions.length > 1)) {
          particle.pos.fromArray( this.lerpNumbers(particle.positions, t) )
        }
  
        if (particle.radialPositions && (isFirstFrame || particle.radialPositions.length > 1)) {
          particle.pos.setFromSphericalCoords( this.lerpFloat(particle.radialPositions, t), particle.radialPhi, particle.radialTheta )
        }
  
        if (particle.accelerations && (isFirstFrame || particle.accelerations.length > 1)) {
          particle.acc.fromArray( this.lerpNumbers(particle.accelerations, t) )
        }
  
        if (particle.radialAccelerations && (isFirstFrame || particle.radialAccelerations.length > 1)) {
          particle.acc.setFromSphericalCoords( this.lerpFloat(particle.radialAccelerations, t), particle.radialPhi, particle.radialTheta )
        }
  
        if (particle.velocities && (isFirstFrame || particle.velocities.length > 1)) {
          particle.vel.fromArray( this.lerpNumbers(particle.velocities, t) )
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
          particle.angularAcc.fromArray( this.lerpNumbers(particle.angularAccelerations, t) )
        }

        if (particle.angularVelocities && (isFirstFrame || particle.angularVelocities.length > 1)) {
          particle.angularVel.fromArray( this.lerpNumbers(particle.angularVelocities, t) )
        }

        if (particle.angularAccelerations || particle.angularVelocities) {
          tempVec3.copy( particle.angularAcc ).multiplyScalar( 0.5*age ).add( particle.angularVel ).multiplyScalar( age )
          tempEuler.set( tempVec3.x, tempVec3.y, tempVec3.z )
          tempQuaternion.setFromEuler( tempEuler )
          tempPosition.applyQuaternion( tempQuaternion )
          hasMovement = true
        }

        if (isFirstFrame || hasMovement) {
          tempPosition.add( particle.sourcePosition )
          instance.setPositionAt(i, tempPosition.x, tempPosition.y, tempPosition.z)
        }
  
        if (particle.colors && (isFirstFrame || particle.colors.length > 1)) {
          // colour is independent of the entity color
          tempColor.copy( this.lerpColors(particle.colors, t) )
          instance.setColorAt(i, tempColor.r, tempColor.g, tempColor.b)
        }
  
        if (particle.rotations && (isFirstFrame || particle.rotations.length > 1)) {
          tempEuler.fromArray( this.lerpNumbers(particle.rotations, t) )
          tempQuaternion.setFromEuler(tempEuler)
          tempQuaternion.premultiply(particle.sourceQuaternion)
          instance.setQuaternionAt(i, tempQuaternion.x, tempQuaternion.y, tempQuaternion.z, tempQuaternion.w)
        }
  
        if (particle.scales && (isFirstFrame || particle.scales.length > 1)) {
          tempScale.copy(particle.sourceScale)
          tempScale.multiply( tempVec3.fromArray( this.lerpNumbers(particle.scales, t) ) )
          instance.setScaleAt(i, tempScale.x, tempScale.y, tempScale.z)
        }
  
      }
    }
  })(),

  lerpFloat(floats, t) {
    const [i,r] = interpolation.lerpKeys(floats, t)
    return interpolation.lerp(floats[i], floats[i+1], r)
  },

  lerpNumbers(numbers, t) {
    const [i,r] = interpolation.lerpKeys(numbers, t)
    return interpolation.lerpArray(numbers[i], numbers[i+1], r)
  },

  lerpColors(colors, t) {
    const [i,r] = interpolation.lerpKeys(colors, t)
    return interpolation.lerpObject(colors[i], colors[i+1], r)
  },
})

