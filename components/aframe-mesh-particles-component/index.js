import { pseudorandom, attribute, interpolation } from "harlyq-helpers"

const toLowerCase = x => x.toLowerCase()
const warn = msg => console.warn("mesh-particles", msg)

const OVER_TIME_PROPERTIES = ["position", "velocity", "acceleration", "radialPosition", "radialVelocity", "radialAcceleration", "angularVelocity", "angularAcceleration", "orbitalVelocity", "orbitalAcceleration", "scale", "color", "rotation", "opacity", "drag"]
const TWO_PI = 2*Math.PI
const PI_2 = .5*Math.PI

const getMaxRangeOptions = rule => rule.options ? Math.max(...rule.options) : Math.max(...rule.range)

AFRAME.registerComponent("mesh-particles", {
  schema: {
    // TODO validate the input types
    duration: { default: -1 },
    instances: { default: "" },
    spawnRate: { default: "10" },
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
    color: { default: "", parse: toLowerCase },
    rotation: { default: "" },
    opacity: { default: "" },
    drag: { default: "" },
    source: { type: "selector" },
    destination: { type: "selector" },
    destinationOffset: { default: "0 0 0" },
    destinationWeight: { default: "0" },
    seed: { type: "int", default: -1 }
  },

  multiple: true,

  init() {
    this.spawnID = 0
    this.spawnCount = 0
    this.instanceIndices = []
    this.instanceIndices = []
    this.overTimes = []
    this.particles = []
    this.lcg = pseudorandom.lcg()
  },

  remove() {

  },

  update(oldData) {
    const data = this.data
    this.lcg.setSeed(data.seed)

    for (let prop in data) {
      if (OVER_TIME_PROPERTIES.includes(prop)) {
        if (!(prop in this.overTimes) || data[prop] !== oldData[prop]) {
          // @ts-ignore
          this.overTimes[prop] = data[prop] ? attribute.nestedSplit(data[prop]).map(str => attribute.parse(str)).flat() : undefined
        }
      }
    }

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

    const overTimes = this.overTimes

    const newParticle = {}
    newParticle.age = 0
    newParticle.vel = new THREE.Vector3(0,0,0)
    newParticle.acc = new THREE.Vector3(0,0,0)
    newParticle.lifeTime = attribute.randomize(this.lifeTimeRule, random)
    newParticle.positions = overTimes["position"] ? overTimes["position"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPositions = overTimes["radialPosition"] ? overTimes["radialPosition"].map(part => attribute.randomize(part, random)) : undefined
    // @ts-ignore
    newParticle.rotations = overTimes["rotation"] ? overTimes["rotation"].map(part => attribute.randomize(part, random).map(deg => degToRad(deg))) : undefined
    newParticle.scales = overTimes["scale"] ? overTimes["scale"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.colors = overTimes["color"] ? overTimes["color"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialPhi = (data.radialType !== "circlexz") ? random()*TWO_PI : PI_2
    newParticle.radialTheta = data.radialType === "circleyz" ? 0 : (data.radialType === "circle" || data.radialType === "circlexy") ? PI_2 : random()*TWO_PI
    newParticle.velocities = overTimes["velocity"] ? overTimes["velocity"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.accelerations = overTimes["acceleration"] ? overTimes["acceleration"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialVelocities = overTimes["radialVelocity"] ? overTimes["radialVelocity"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.radialAccelerations = overTimes["radialAcceleration"] ? overTimes["radialAcceleration"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.angularVelocities = overTimes["angularVelocity"] ? overTimes["angularVelocity"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.angularAccelerations = overTimes["angularAcceleration"] ? overTimes["angularAcceleration"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.orbitalVelocities = overTimes["orbitalVelocity"] ? overTimes["orbitalVelocity"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.orbitalAccelerations = overTimes["orbitalAcceleration"] ? overTimes["orbitalAcceleration"].map(part => attribute.randomize(part, random)) : undefined
    newParticle.orbitalAxis = new THREE.Vector3(random(), random(), random()).normalize()

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
    const tempVelocity = new THREE.Vector3(0,0,0)
    const tempAcceleration = new THREE.Vector3(0,0,0)

    return function move(dt) {

      for (let id = Math.max(0, this.spawnID - this.maxParticles); id < this.spawnID; id++) {
        const [instance, i, particleID] = this.instanceFromID(id)
        const particle = this.particles[particleID]
        const t = particle.age/particle.lifeTime
  
        if (t > 1) {
          instance.setScaleAt(i, {x:0,y:0,z:0})
          continue // particle has expired
        }
  
        particle.age += dt
  
        if (t === 0) {
          tempPosition.copy( this.source.position )
        } else {
          instance.getPositionAt(i, tempPosition)
        }
  
        if (particle.positions && (t === 0 || particle.positions.length > 1)) {
          tempPosition.copy( this.source.position )
          tempPosition.add( tempVec3.fromArray( this.lerpNumbers(particle.positions, t) ) )
        }
  
        if (particle.radialPositions && (t === 0 || particle.radialPositions.length > 1)) {
          tempPosition.copy( this.source.position )
          tempPosition.add( tempVec3.setFromSphericalCoords( this.lerpNumbers(particle.radialPositions, t)[0], particle.radialPhi, particle.radialTheta ) )
        }
  
        if (particle.accelerations && (t === 0 || particle.accelerations.length > 1)) {
          particle.acc.fromArray( this.lerpNumbers(particle.accelerations) )
        }
  
        if (particle.radialAccelerations && (t === 0 || particle.radialAccelerations.length > 1)) {
          particle.acc.add( tempVec3.setFromSphericalCoords( this.lerpNumbers(particle.radialAccelerations, t)[0], particle.radialPhi, particle.radialTheta ) )
        }
  
        if (particle.velocities && (t === 0 || particle.velocities.length > 1)) {
          particle.vel.fromArray( this.lerpNumbers(particle.velocities) )
        }
  
        if (particle.radialVelocities && (t === 0 || particle.radialVelocities.length > 1)) {
          particle.vel.add( tempVec3.setFromSphericalCoords( this.lerpNumbers(particle.radialVelocities, t)[0], particle.radialPhi, particle.radialTheta ) )
        }
  
        particle.vel.add( tempAcceleration.copy(particle.acc).multiplyScalar(dt) )
        tempPosition.add( tempVelocity.copy(particle.vel).multiplyScalar(dt) )
        instance.setPositionAt(i, tempPosition.x, tempPosition.y, tempPosition.z)
  
        if (particle.colors && (t === 0 || particle.colors.length > 1)) {
          // colour is independent of the entity color
          tempColor.copy( this.lerpColors(particle.colors, t) )
          instance.setColorAt(i, tempColor.r, tempColor.g, tempColor.b)
        }
  
        if (particle.rotations && (t === 0 || particle.rotations.length > 1)) {
          tempEuler.fromArray( this.lerpNumbers(particle.rotations, t) )
          tempQuaternion.setFromEuler(tempEuler)
          tempQuaternion.premultiply(this.source.quaternion)
          instance.setQuaternionAt(i, tempQuaternion.x, tempQuaternion.y, tempQuaternion.z, tempQuaternion.w)
        }
  
        if (particle.scales && (t === 0 || particle.scales.length > 1)) {
          tempScale.copy(this.source.scale)
          const newScale = this.lerpNumbers(particle.scales, t)
          if (newScale.length < 3) {
            tempScale.multiplyScalar( newScale[0] )
          } else {
            tempScale.multiple( tempVec3.fromArray( newScale ) )
          }
          instance.setScaleAt(i, tempScale.x, tempScale.y, tempScale.z)
        }
  
      }
    }
  })(),

  lerpNumbers(numbers, t) {
    const [i,r] = interpolation.lerpKeys(numbers, t)
    return interpolation.lerpArray(numbers[i], numbers[i+1], r)
  },

  lerpColors(colors, t) {
    const [i,r] = interpolation.lerpKeys(colors, t)
    return interpolation.lerpObject(colors[i], colors[i+1], r)
  },
})

