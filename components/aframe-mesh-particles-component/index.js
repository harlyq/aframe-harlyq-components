import { pseudorandom, attribute } from "harlyq-helpers"

const toLowerCase = x => x.toLowerCase()
const warn = msg => console.warn("mesh-particles", msg)

const OVER_TIME_PROPERTIES = ["position", "velocity", "acceleration", "radialPosition", "radialVelocity", "radialAcceleration", "angularVelocity", "angularAcceleration", "orbitalVelocity", "orbitalAcceleration", "scale", "color", "rotation", "opacity", "drag"]

AFRAME.registerComponent("mesh-particles", {
  schema: {
    duration: { default: -1 },
    instances: { default: "" },
    spawnRate: { default: "10" },
    lifeTime: { default: "1" },
    position: { default: "0 0 0" },
    velocity: { default: "0 0 0" },
    acceleration: { default: "0 0 0" },
    radialType: { default: "circle", oneOf: ["circle", "sphere", "circlexy", "circleyz", "circlexz"], parse: toLowerCase },
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
    drag: { default: "0" },
    source: { type: "selector" },
    destination: { type: "selector" },
    destinationOffset: { default: "0 0 0" },
    destinationWeight: { default: "0" },
    seed: { type: "int", default: 1287151 }
  },

  multiple: true,

  init() {
    this.particleIndices = []
    this.overTimes = []
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
          this.overTimes[prop] = attribute.nestedSplit(data[prop]).map(str => attribute.parse(str)).flat()
        }
      }
    }

    this.duration = data.duration
    this.spawnRate = Number(data.spawnRate)

    // if (data.position !== oldData.position) {
    //   this.position = attribute.parse(data.position)
    // }

    if (data.radialPosition !== oldData.radialPosition) {
      this.radialPosition = attribute.parse(data.radialPosition)
    }

    if (data.lifeTime !== oldData.lifeTime) {
      this.lifeTime = attribute.parse(data.lifeTime)
      this.maxLifeTime = this.lifeTime.options ? Math.max(...this.lifeTime.options) : Math.max(...this.lifeTime.range)
    }

    if (data.delay !== oldData.delay) {
      this.startTime = data.delay // this will not work if we restart the spawner
    }

    this.maxParticles = this.spawnRate*this.maxLifeTime

    if (data.instances !== oldData.instances) {
      this.particleIndices = []
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
        this.particleIndices = new Int32Array(this.instances.length)
      }
    }

  },

  tick(time, deltaTime) {
    if ((this.duration < 0 || time - this.startTime < this.duration) && this.instances.length > 0) {
      this.spawn(deltaTime*0.001)
    }
    this.move(deltaTime*0.001)
  },

  spawn(dt) {
    const data = this.data
    const random = this.lcg.random
    const degToRad = THREE.Math.degToRad
    const instanceIndex = pseudorandom.index(this.instances.length, random)
    const particleInstance = this.instances[instanceIndex]
    const particlePosition = new THREE.Vector3(0,0,0)
    const particleEuler = new THREE.Euler(0,0,0,"YXZ")
    const particleQuaternion = new THREE.Quaternion(0,0,0,1)
    const particleScale = new THREE.Vector3(1,1,1)
    const particleColor = new THREE.Color()

    particlePosition.fromArray( attribute.randomize(this.overTimes["position"][0], random) )

    const theta = data.radialType !== "circlexz" ? random()*2*Math.PI : 0
    const phi = data.radialType === "circleyz" ? 0.5*Math.PI : (data.radialType !== "circle" && data.radialType !== "circlexy") ? random()*2*Math.PI : 0
    const cTheta = Math.cos(theta), sTheta = Math.sin(theta)
    const cPhi = Math.cos(phi), sPhi = Math.sin(phi)
    const r = /** @type {number} */(attribute.randomize(this.overTimes["radialPosition"][0], random)[0]) // HACK
    const rc = r*cTheta

    particlePosition.add(new THREE.Vector3(rc*cPhi, r*sTheta, rc*sPhi))

    particleEuler.fromArray( /** @type {number[]} */ (attribute.randomize(this.overTimes["rotation"][0], random)).map(deg => degToRad(deg)) )
    particleScale.fromArray( attribute.randomize(this.overTimes["scale"][0], random) )
    
    const col = /** @type {{r: number,g: number,b: number}} */(attribute.randomize(this.overTimes["color"][0], random))
    particleColor.setRGB(col.r, col.b, col.g)

    particleQuaternion.setFromEuler(particleEuler)

    const i = (this.particleIndices[instanceIndex] + 1) % Math.ceil(this.maxParticles/this.instances.length)
    particleInstance.setColorAt(i, particleColor.r, particleColor.g, particleColor.b)
    particleInstance.setScaleAt(i, particleScale.x, particleScale.y, particleScale.z)
    particleInstance.setPositionAt(i, particlePosition.x, particlePosition.y, particlePosition.z)
    particleInstance.setQuaternionAt(i, particleQuaternion.x, particleQuaternion.y, particleQuaternion.z, particleQuaternion.w)
    this.particleIndices[instanceIndex] = i
  },

  move(dt) {
  },
})