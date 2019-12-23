import { aframeHelper, nafHelper, threeHelper } from "harlyq-helpers"

const NUM_FACES = 6
const UNEXPOSED_FRAME = 7
const TEXTURE_COLS = 4
const TEXTURE_ROWS = 2
const EMPTY_ARRAY = []
const INNER_SIDE = 6
const NO_SIDE = -1
const PI_2 = Math.PI*.5
const PI = Math.PI
const FLOATS_PER_POSITION = 3
const FLOATS_PER_QUATERNION = 4
const FLOATS_PER_PACKED_FRAME = 1
const MAX_BITS_PER_FRAME = 3
const PACKED_FRAME_DIVISOR = 2 ** (NUM_FACES*MAX_BITS_PER_FRAME)

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
}

function toUpperCase(str) { return str.trim().toUpperCase() }

function packFrames(frames) {
  let packed = 0
  for (let i = 0; i < frames.length; i++) {
    packed += frames[i] * Math.pow(2, (frames.length - i - 1)*MAX_BITS_PER_FRAME)
  }
  return packed / PACKED_FRAME_DIVISOR // in the range (0,1]
}

function slerpolator(quaternions, duration, postStepFn) {
  const startQuaternions = quaternions.slice()
  const endQuaternions = quaternions.slice()
  const outQuaternions = quaternions // populate directly
  let elapsed = 0

  function step(dt) {
    elapsed += dt
    const r = THREE.Math.clamp(elapsed/duration, 0, 1)

    for (let i = 0, n = startQuaternions.length; i < n; i += 4) {
      THREE.Quaternion.slerpFlat(outQuaternions, i, startQuaternions, i, endQuaternions, i, r)
    }

    postStepFn()
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
  let packed = Array(quaternions.length)

  for (let i = 0; i < quaternions.length; i++) {
    const v = Math.trunc(quaternions[i]*10)
    let y
    switch (v) {
      case 0: y = 0; break
      case 5: y = 1; break
      case 7: y = 2; break
      case 10: y = 3; break
      case -5: y = 4; break
      case -7: y = 5; break
      case -10: y = 6; break
      default: console.assert(false, `unknown value ${v} from ${quaternions[i]}`)
    }
    packed[i] = y
  }
  return packed.join("")
}

function unpackQuaternions(quaternions, packedQuats) {
  console.assert(quaternions.length === packedQuats.length)
  const cos45 = Math.cos(Math.PI/4)

  for (let i = 0; i < packedQuats.length; i++) {
    let y = 0
    switch (packedQuats[i]) {
      case "0": y = 0; break
      case "1": y = 0.5; break
      case "2": y = cos45; break
      case "3": y = 1; break
      case "4": y = -0.5; break
      case "5": y = -cos45; break
      case "6": y = -1; break
    }
    quaternions[i] = y
  }
}

// window.addEventListener("load", () => {
//   document.body.addEventListener("connected", () => {
//     let tagEl = document.querySelector("#clientId")
//     if (!tagEl) {
//       tagEl = document.createElement("div")
//       tagEl.id = "clientId"
//       tagEl.setAttribute("style", "position: absolute; left: 0; top: 0")
//       document.body.appendChild(tagEl)
//     }
//     tagEl.innerHTML = NAF.clientId.toString()
//   })
// })


AFRAME.registerSystem("cube-puzzle", {
  ...nafHelper.networkSystem("cube-puzzle"),

  init() {
    this.setupNetwork()
  },

  remove() {
    this.shutdownNetwork()
  },
})


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
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.onBeforeCompile = this.onBeforeCompile.bind(this)

    this.actionTick = {
      "idle": this.tickIdle.bind(this),
      "hold": this.tickHold.bind(this),
      "turn": this.tickTurn.bind(this),
      "turning": this.tickTurning.bind(this),
    }

    this.highlightColor = new THREE.Color()
    this.prevHighlighted = []

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
    }

    this.cube = this.createCube()
    this.el.setObject3D("mesh", this.cube)

    this.state.snappedQuaternions = this.quaternions.slice()

    this.system.registerNetworking(this, {
      requestSync: this.requestSync.bind(this),
      receiveNetworkData: this.receiveNetworkData.bind(this),
      onClientDisconnected: this.onClientDisconnected.bind(this),
      onOwnershipGained: this.onOwnershipGained.bind(this),
    })
  },

  remove() {
    this.system.unregisterNetworking(this)
  },

  update(oldData) {
    const data = this.data
    for (let hand of data.hands) {
      hand.addEventListener(data.grabStart, this.onGrabStart)
      hand.addEventListener(data.grabEnd, this.onGrabEnd)
    }

    this.highlightColor.set(data.highlightColor)
    this.snapAngle = THREE.Math.degToRad( Math.abs(data.snapAngle) )

    if (data.moves !== oldData.moves) {
      this.resetCube()
      data.moves.split(" ").forEach(move => {
        if (move && !this.rotateCube(move)) {
          aframeHelper.error(this, `unknown move "${move}"`)
        }
      })
    }
  },

  tick(time, deltaTime) {
    const dt = Math.min(100, deltaTime)/1000
    const state = this.state

    this.tickSlerpolator(dt)

    if (!state.holderId || state.holderId === nafHelper.getClientId()) {
      this.actionTick[this.state.name]()
    }
  },

  dispatch(action) {
    if (this.data.debug) {
      console.log("action", action.name, action)
    }

    const state = this.state
    const oldStateName = state.name

    switch (action.name) {      
      case "grab":
        state.activeHands.push(action.hand)

        if (state.name === "idle") {
          state.name = "hold"
          state.hold.side = NO_SIDE
          state.holderId = nafHelper.getClientId()
          threeHelper.calcOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)

          nafHelper.takeOwnership(this)

        } else if (state.name === "hold") {
          const holdSide = state.hold.side

          if (state.snapped && holdSide !== NO_SIDE) {
            const pieces = this.getSidePieces(holdSide)

            state.name = "turn"
            state.turn.side = holdSide
            state.turn.pieces = pieces
            state.turn.quaternions = this.quaternions.slice()
            state.turn.handStart.copy( action.hand.object3D.matrixWorld )
            state.turn.startAngle = 0

          } else if (!state.snapped && holdSide === state.turn.side) {
            state.name = "turning"
            state.turn.handStart.copy( action.hand.object3D.matrixWorld )

          }
        }
        break

      case "release":
        if (state.name === "hold") {

          const i = state.activeHands.indexOf(action.hand)
          state.activeHands.splice(i, 1)
          if (state.activeHands.length > 0) {
            threeHelper.calcOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)
          } else {
            state.name = "idle"
            this.broadcastState()
          }
  
        } else if (state.name === "turn" || state.name === "turning") {

          if (state.name === "turning") {
            const turnHand = state.activeHands[1]
            state.turn.startAngle += this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)
          }

          const i = state.activeHands.indexOf(action.hand)
          state.activeHands.splice(i, 1)
          if (state.activeHands.length > 0) {
            threeHelper.calcOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)
          }
  
          state.name = "hold"
        }
        break

      case "unsnap":
        if (state.name === "turn") {
          state.name = "turning"
          state.snapped = false
        } else if (state.name === "turning") {
          state.snapped = false
        }
        break

      case "snap":
        state.snappedQuaternions.set(this.quaternions)
        this.broadcastState({slerp: true})
        state.snapped = true
        break

      case "hover":
        if (state.name === "hold") {
          state.hold.side = action.side
        }
    }

    if (this.data.debug && state.name !== oldStateName) {
      console.log("newState", state.name)
    }
  },

  tickSlerpolator(dt) {
    const state = this.state
    if (state.slerpolator) {
      if (state.slerpolator.isFinished()) {
        state.snapped = true
        state.slerpolator = undefined
      } else {
        state.slerpolator.step(dt)
      }
    }
  },

  tickIdle() {
    if (!this.el.sceneEl.is('vr-mode')) {
      return
    }

    let hand = this.data.hands.find(hand => this.isNear(hand))
    if (hand) {
      this.highlightPieces(this.allPieces)
    } else {
      this.highlightPieces(EMPTY_ARRAY)
    }
  },

  tickHold() {
    const state = this.state
    threeHelper.applyOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)

    const hand = this.data.hands.find(hand => !state.activeHands.includes(hand) && this.isNear(hand))
    let pieces = EMPTY_ARRAY

    if (hand) {
      let bestSide = state.turn.side

      if (state.snapped) {
        bestSide = this.calcBestSide(hand, state.hold.side)
        if (bestSide >= 0) {
          pieces = this.getSidePieces(bestSide)
        }
      } else {
        pieces = state.turn.pieces
      }

      if (state.hold.side !== bestSide) {
        this.dispatch( { name: "hover", side: bestSide } )
      }
    }
      
    this.highlightPieces(pieces)
  },

  tickTurn() {
    const state = this.state
    threeHelper.applyOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)
    this.highlightPieces(state.turn.pieces)

    const turnHand = state.activeHands[1]
    const angle = this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)

    if (Math.abs(angle) > this.snapAngle) {
      this.dispatch( { name: "unsnap" } )
    }
  },

  tickTurning: (function () {
    const newQuat = new THREE.Quaternion()
    const rotationQuat = new THREE.Quaternion()
    const RIGHT = new THREE.Vector3(1,0,0)
    const UP = new THREE.Vector3(0,1,0)
    const FORWARD = new THREE.Vector3(0,0,1)

    return function tickTurning() {
      const state = this.state
      threeHelper.applyOffsetMatrix(state.activeHands[0].object3D, this.el.object3D, state.hold.matrix)
      this.highlightPieces(state.turn.pieces)
  
      const turnHand = state.activeHands[1]
      const angle = state.turn.startAngle + this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)
  
      const rightAngle = Math.round(angle/PI_2)*PI_2
      const inSnapAngle = Math.abs(angle - rightAngle) < this.snapAngle
      const revisedAngle = inSnapAngle ? rightAngle : angle
  
      switch (state.turn.side % INNER_SIDE) {
        case 0: rotationQuat.setFromAxisAngle(RIGHT, revisedAngle); break
        case 1: rotationQuat.setFromAxisAngle(RIGHT, -revisedAngle); break
        case 2: rotationQuat.setFromAxisAngle(UP, revisedAngle); break
        case 3: rotationQuat.setFromAxisAngle(UP, -revisedAngle); break
        case 4: rotationQuat.setFromAxisAngle(FORWARD, revisedAngle); break
        case 5: rotationQuat.setFromAxisAngle(FORWARD, -revisedAngle); break
      }
  
      for (let i = 0; i < state.turn.pieces.length; i++) {
        const piece = state.turn.pieces[i]
        newQuat.fromArray(state.turn.quaternions, piece*FLOATS_PER_QUATERNION)
        newQuat.premultiply(rotationQuat)
        newQuat.toArray(this.quaternions, piece*FLOATS_PER_QUATERNION)
      }
  
      this.instanceQuaternion.needsUpdate = true
  
      if (inSnapAngle && !state.snapped) {
        this.dispatch( { name: "snap" } )
      } else if (state.snapped && !inSnapAngle) {
        this.dispatch( { name: "unsnap" } )
      }
    }
  })(),

  calcAngleBetween: (function() {
    const startForward = new THREE.Vector3()
    const endForward = new THREE.Vector3()
    const startRight = new THREE.Vector3()

    return function calcAngleBetween(startMatrix, endMatrix) {
      startRight.setFromMatrixColumn(startMatrix, 0)
      startForward.setFromMatrixColumn(startMatrix, 1)
      endForward.setFromMatrixColumn(endMatrix, 1)

      const angleSign = endForward.dot(startRight) <= 0 ? 1 : -1

      return startForward.angleTo(endForward) * angleSign
    }
  })(),

  highlightPieces(pieces) {
    if ( this.prevHighlighted !== pieces && ( 
      this.prevHighlighted.length !== pieces.length ||
      this.prevHighlighted.some(piece => !pieces.includes(piece)) 
    ) ) {

        this.highlights.fill(0)
        for (let piece of pieces) {
          this.highlights[piece] = 1
        }

        this.instanceHighlight.needsUpdate = true
        this.prevHighlighted = pieces
    }
  },

  createCube() {
    const size = 1/3
    const cubeMaterial = this.createCubeMaterial()
    const numInstances = 3*3*3 - 1

    const pieceGeo = new THREE.BoxBufferGeometry(size, size, size)
    const instanceGeo = new THREE.InstancedBufferGeometry().copy(pieceGeo)

    this.positions = new Float32Array(numInstances*FLOATS_PER_POSITION)
    this.quaternions = new Float32Array(numInstances*FLOATS_PER_QUATERNION)
    this.packedFrames = new Float32Array(numInstances*FLOATS_PER_PACKED_FRAME)
    this.highlights = new Float32Array(numInstances)
    this.allPieces = new Uint8Array(numInstances)

    let k = 0
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) {
            continue
          }

          let i = k*FLOATS_PER_POSITION
          this.positions[i] = x*size
          this.positions[i+1] = y*size
          this.positions[i+2] = z*size

          i = k*FLOATS_PER_QUATERNION
          this.quaternions[i+3] = 1

          let frames = []
          for (let face = 0; face < NUM_FACES; face++) {
            let isExposed = false
            switch (face) {
              case 0: isExposed = x === 1; break
              case 1: isExposed = x === -1; break
              case 2: isExposed = y === 1; break
              case 3: isExposed = y === -1; break
              case 4: isExposed = z === 1; break
              case 5: isExposed = z === -1; break
            }
            frames.push(isExposed ? face : UNEXPOSED_FRAME)
          }

          this.packedFrames[k] = packFrames(frames)
          this.highlights[k] = 0
          this.allPieces[k] = k

          k++
        }
      }
    }

    this.instancePosition = new THREE.InstancedBufferAttribute(this.positions, FLOATS_PER_POSITION)
    this.instanceQuaternion = new THREE.InstancedBufferAttribute(this.quaternions, FLOATS_PER_QUATERNION)
    this.instancePackedFrame = new THREE.InstancedBufferAttribute(this.packedFrames, FLOATS_PER_PACKED_FRAME)
    this.instanceHighlight = new THREE.InstancedBufferAttribute(this.highlights, 1)

    instanceGeo.setAttribute("instancePosition", this.instancePosition)
    instanceGeo.setAttribute("instanceQuaternion", this.instanceQuaternion)
    instanceGeo.setAttribute("instancePackedFrame", this.instancePackedFrame)
    instanceGeo.setAttribute("instanceHighlight", this.instanceHighlight)
    instanceGeo.maxInstanceCount = numInstances

    const mesh = new THREE.Mesh(instanceGeo, cubeMaterial)

    return mesh
  },

  createCubeMaterial() {
    const w = 128
    const h = 64
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    const mw = 2
    const mh = 2
    const dw = w/TEXTURE_COLS - mw*2
    const dh = h/TEXTURE_ROWS - mh*2
    const topHalf = mh + h/TEXTURE_ROWS

    // colored squares in a 2x4 grid with a black border
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = "red"
    ctx.fillRect(mw, topHalf, dw, dh)
    ctx.fillStyle = "orange"
    ctx.fillRect(mw + w/TEXTURE_COLS, topHalf, dw, dh)
    ctx.fillStyle = "white"
    ctx.fillRect(mw + 2*w/TEXTURE_COLS, topHalf, dw, dh)
    ctx.fillStyle = "yellow"
    ctx.fillRect(mw + 3*w/TEXTURE_COLS, topHalf, dw, dh)
    ctx.fillStyle = "green"
    ctx.fillRect(mw, mh, dw, dh)
    ctx.fillStyle = "blue"
    ctx.fillRect(mw + w/TEXTURE_COLS, mh, dw, dh)
    ctx.fillStyle = "grey" // grey for don't care
    ctx.fillRect(mw + 2*w/TEXTURE_COLS, mh, dw, dh)
    // frame 7 is black

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.MeshStandardMaterial( { map: texture } )
    material.onBeforeCompile = this.onBeforeCompile

    return material
  },

  resetCube() {
    const identity = new THREE.Matrix4()
    for (let child of this.cube.children) {
      child.position.set(0,0,0)
      child.quaternion.set(0,0,0,1)
      child.matrix.copy(identity)
    }
  },

  shuffleCube(turns = 30) {
    const state = this.state
    const moves = Object.keys(VALID_MOVES)

    this.quaternions.set(state.snappedQuaternions)

    for (let i = 0; i < turns; i++) {
      const moveIndex = ~~( Math.random()*moves.length )
      this.rotateCube( moves[moveIndex] )
    }

    state.snappedQuaternions.set(this.quaternions)
    this.broadcastState()
    state.snapped = true
  },

  rotateCube: (function () {
    const newQuaternion = new THREE.Quaternion()

    return function rotateCube(move) {
      const isValid = VALID_MOVES[move]

      if (isValid) {
        const moveInfo = VALID_MOVES[move]
        const side = moveInfo.side
        const pieces = this.getSidePieces(side)

        for (let piece of pieces) {
          newQuaternion.fromArray(this.quaternions, piece*FLOATS_PER_QUATERNION)
          newQuaternion.premultiply(moveInfo.quaternion)
          newQuaternion.toArray(this.quaternions, piece*FLOATS_PER_QUATERNION)
        }
      }

      this.instanceQuaternion.needsUpdate = true

      return isValid
    }
  })(),

  calcBestSide: (function() {
    const matrixLocal = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const sideNormals = [{x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:-1,z:0}, {x:0,y:0,z:1}, {x:0,y:0,z:-1}]

    return function calcBestSide(hand, prevSide) {
      // in cube space, the cube is (-.5,-.5,-.5) to (.5,.5,.5)
      matrixLocal.getInverse(this.el.object3D.matrixWorld).multiply(hand.object3D.matrixWorld)
      pos.setFromMatrixPosition(matrixLocal)
  
      let bestSide = -1
      let longestNormal = 0

      for (let side = 0; side < sideNormals.length; side++) {
        const normal = sideNormals[side]
        const alongNormal = pos.dot(normal)
        if (alongNormal > longestNormal) {
          bestSide = side
          longestNormal = alongNormal
        }
      }

      return longestNormal > .6 ? bestSide : (prevSide % INNER_SIDE + INNER_SIDE)
    }
  })(),

  isNear: (function() {
    const aPos = new THREE.Vector3()
    const bPos = new THREE.Vector3()
    const scale = new THREE.Vector3()

    return function isNear(hand) {
      const self3D = this.el.object3D
      scale.setFromMatrixScale(self3D.matrixWorld)
      aPos.setFromMatrixPosition(hand.object3D.matrixWorld)
      bPos.setFromMatrixPosition(self3D.matrixWorld)
      return aPos.distanceTo(bPos) < scale.length()
    }
  })(),

  getSidePieces: (function() {
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
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
    ]

    return function getSidePieces(side) {
      if (side < 0 || side >= sideTests.length) {
        return []
      }

      const test = sideTests[side]

      let children = []

      for (let piece of this.allPieces) {
        pos.fromArray(this.positions, piece*FLOATS_PER_POSITION)
        quat.fromArray(this.quaternions, piece*FLOATS_PER_QUATERNION)
        pos.applyQuaternion(quat)

        if (test(pos)) {
          children.push(piece)
        }
      }

      return children
    }

  })(),

  onBeforeCompile(shader) {
    let vertexShader = shader.vertexShader
    let fragmentShader = shader.fragmentShader

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

    void main()`)

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
    }`)

    vertexShader = vertexShader.replace('#include <begin_vertex>', `
    vec3 transformed = applyQuaternion( position + instancePosition, instanceQuaternion );`) // position before quaternion for cube-puzzle

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
    #endif`)

    fragmentShader = fragmentShader.replace('#include <color_pars_fragment>', `
    #include <color_pars_fragment>
    varying vec3 vHighlightColor;`)

    fragmentShader = fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', `
    vec3 totalEmissiveRadiance = emissive;
    totalEmissiveRadiance += vHighlightColor;`)

    shader.vertexShader = vertexShader
    shader.fragmentShader = fragmentShader
  },

  onGrabStart(event) {
    if (!this.el.sceneEl.is('vr-mode')) {
      return
    }

    const hand = event.target
    if (this.state.activeHands.indexOf(hand) === -1 && this.isNear(hand)) {
      this.dispatch( { name: "grab", hand: hand } )
    }
  },

  onGrabEnd(event) {
    if (!this.el.sceneEl.is('vr-mode')) {
      return
    }

    const hand = event.target
    if (this.state.activeHands.indexOf(hand) !== -1 && this.isNear(hand)) {
      this.dispatch( { name: "release", hand: hand } )
    }
  },

  // Networking
  broadcastState(options = {}) {
    this.sendStateToClient(options)
  },

  sendStateToClient(options, targetId) {
    const state = this.state
    if (nafHelper.isMine(this)) {
      
      const data = {
        holderId: state.holderId,
        slerp: false,
        packedQuats: packQuaternions(state.snappedQuaternions),
        ...options,
      }

      this.system.sendNetworkData(this, data, targetId)
    }
  },

  receiveNetworkData(data, senderId) {
    const state = this.state

    if (this.data.debug) {
      console.log("received packet from:", senderId, "owner:", NAF.utils.getNetworkOwner(this.el))
    }

    if (senderId === NAF.utils.getNetworkOwner(this.el)) {
      state.holderId = data.holderId

      const newSlerpolator = slerpolator( this.quaternions, data.slerp ? 0.3 : 0, () => { this.instanceQuaternion.needsUpdate = true } )
      unpackQuaternions(newSlerpolator.endQuaternions, data.packedQuats)
  
      state.snappedQuaternions.set(newSlerpolator.endQuaternions)
      state.slerpolator = newSlerpolator
    }
  },

  requestSync(clientId) {
    this.sendStateToClient({}, clientId)
  },

  onClientDisconnected(event) {
    const clientId = event.detail.clientId
    if (this.state.holderId === clientId) {
      this.state.holderId = undefined
    }
  },

  onOwnershipGained() {
    if (this.data.debug) {
      console.log("ownership-gained")
    }
    this.broadcastState()
  },

})