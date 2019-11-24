const NUM_FACES = 6
const NUM_SIDES = 6
const UNEXPOSED_FRAME = 7
const TEXTURE_COLS = 4
const TEXTURE_ROWS = 2
const EMPTY_ARRAY = []

AFRAME.registerComponent("cube-puzzle", {
  schema: {
    hands: { type: "selectorAll", default: "[hand-controls], [oculus-touch-controls], [vive-controls], [windows-motion-controls]" },
    grabStart: { default: "triggerdown" },
    grabEnd: { default: "triggerup" },
    highlightColor: { type: "color", default: "#555" },
    snapAngle: { default: 15 },
    debug: { default: false },
  },

  init() {
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.actionTick = {
      "idle": this.tickIdle.bind(this),
      "hold": this.tickHold.bind(this),
      "turn": this.tickTurn.bind(this),
      "turning": this.tickTurning.bind(this),
    }

    this.highlightColor = new THREE.Color()

    this.state = {
      name: "idle",
      turn: {
        side: -1,
        pieces: [],
        matrices: [],
        handStart: new THREE.Matrix4(),
        startAngle: 0,
      },
      snapped: true,
      activeHands: [],
      holdMatrix: new THREE.Matrix4(),
    }

    this.cube = this.createCube()
    this.el.setObject3D("mesh", this.cube)

    // this.rotateCube("U")
    // this.rotateCube("R'")
    // this.rotateCube("B'")
    // this.rotateCube("L")
    // this.rotateCube("L")
    // this.rotateCube("B")
    // this.rotateCube("U'")
    // this.rotateCube("U'")
    // this.rotateCube("R")
    // this.rotateCube("B'")
    // this.rotateCube("R")
    // this.rotateCube("R")

    this.shuffleCube()

    // this.rotateCube("R")
    // this.rotateCube("R")
    // this.rotateCube("B")
    // this.rotateCube("R'")
    // this.rotateCube("U")
    // this.rotateCube("U")
    // this.rotateCube("B'")
    // this.rotateCube("L")
    // this.rotateCube("L")
    // this.rotateCube("B")
    // this.rotateCube("R")
    // this.rotateCube("U'")

  },

  update() {
    const data = this.data
    for (let hand of data.hands) {
      hand.addEventListener(data.grabStart, this.onGrabStart)
      hand.addEventListener(data.grabEnd, this.onGrabEnd)
    }

    this.highlightColor.set(data.highlightColor)
    this.snapAngle = THREE.Math.degToRad( Math.abs(data.snapAngle) )
  },

  tick() {
    this.actionTick[this.state.name]()
  },

  dispatch(action) {
    if (this.data.debug) {
      console.log("action", action.name, action)
    }

    const state = this.state
    const oldStateName = state.name

    switch (action.name) {      
      case "grab":
        if (state.name === "idle") {
          state.name = "hold"
          state.activeHands.push(action.hand)
          this.updateHoldMatrix(state.holdMatrix, state.activeHands[0])

        } else if (state.name === "hold") {
          const side = this.calcBestSide(action.hand)
          if (side !== -1) {
            if (state.snapped) {
              const pieces = this.getSidePieces(side)

              state.name = "turn"
              state.turn.side = side
              state.turn.pieces = pieces
              state.turn.matrices = pieces.map( piece => piece.matrix.clone() )
              state.turn.handStart.copy( action.hand.object3D.matrixWorld )
              state.turn.startAngle = 0
            } else {
              state.name = "turning"
              state.turn.handStart.copy( action.hand.object3D.matrixWorld )
            }

            state.activeHands.push(action.hand)
          }

        }
        break

      case "release":
        if (state.name === "hold") {
          state.name = "idle"
          state.activeHands.length = 0

        } else if (state.name === "turn" || state.name === "turning") {

          if (state.name === "turning") {
            const turnHand = state.activeHands[1]
            state.turn.startAngle += this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)
          }

          state.name = "hold"
          const i = state.activeHands.indexOf(action.hand)
          state.activeHands.splice(i, 1)
          this.updateHoldMatrix(state.holdMatrix, state.activeHands[0])
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
        if (state.name === "turning") {
          state.snapped = true
        }
        break
    }

    if (state.name !== oldStateName) {
      console.log("newState", state.name)
    }
  },

  updateHoldMatrix(holdMatrix, hand) {
    holdMatrix.getInverse(hand.object3D.matrixWorld).multiply(this.el.object3D.matrixWorld)
  },

  tickIdle() {
    let hand = this.data.hands.find(hand => this.isNear(hand))
    if (hand) {
      this.highlightPieces(this.cube.children)
    } else {
      this.highlightPieces(EMPTY_ARRAY)
    }
  },

  tickHold() {
    const state = this.state
    this.stickToHand(state.activeHands[0])
    const hand = this.data.hands.find(hand => state.activeHands[0] !== hand && this.isNear(hand))
    let pieces = EMPTY_ARRAY

    if (hand) {
      const bestSide = this.calcBestSide(hand)
      if (bestSide >= 0) {
        if (state.snapped) {
          pieces = this.getSidePieces(bestSide)
        } else if (state.turn.side === bestSide) {
          pieces = state.turn.pieces
        }
      }
    }
      
    this.highlightPieces(pieces)
  },

  tickTurn() {
    const state = this.state
    this.stickToHand(state.activeHands[0])
    this.highlightPieces(state.turn.pieces)

    const turnHand = state.activeHands[1]
    const angle = this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)

    if (Math.abs(angle) > this.snapAngle) {
      this.dispatch( { name: "unsnap" } )
    }
  },

  tickTurning() {
    const state = this.state
    const PI_2 = Math.PI*.5
    this.stickToHand(state.activeHands[0])
    this.highlightPieces(state.turn.pieces)

    const turnHand = state.activeHands[1]
    const angle = state.turn.startAngle + this.calcAngleBetween(state.turn.handStart, turnHand.object3D.matrixWorld)
    const newMatrix = new THREE.Matrix4()
    const rotationMatrix = new THREE.Matrix4()

    const rightAngle = Math.round(angle/PI_2)*PI_2
    const inSnapAngle = Math.abs(angle - rightAngle) < this.snapAngle
    const revisedAngle = inSnapAngle ? rightAngle : angle

    switch (state.turn.side) {
      case 0: rotationMatrix.makeRotationX(revisedAngle); break
      case 1: rotationMatrix.makeRotationX(-revisedAngle); break
      case 2: rotationMatrix.makeRotationY(revisedAngle); break
      case 3: rotationMatrix.makeRotationY(-revisedAngle); break
      case 4: rotationMatrix.makeRotationZ(revisedAngle); break
      case 5: rotationMatrix.makeRotationZ(-revisedAngle); break
    }

    for (let i = 0; i < state.turn.pieces.length; i++) {
      const piece = state.turn.pieces[i]
      const startMatrix = state.turn.matrices[i]
      newMatrix.copy(startMatrix).premultiply(rotationMatrix)
      newMatrix.decompose(piece.position, piece.quaternion, piece.scale)
      piece.matrix.copy(newMatrix)
    }

    if (inSnapAngle && !state.snapped) {
      this.dispatch( { name: "snap" } )
    } else if (state.snapped && !inSnapAngle) {
      this.dispatch( { name: "unsnap" } )
    }
  },

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

  stickToHand: (function() {
    const invParentMatrix = new THREE.Matrix4()
    const newMatrix = new THREE.Matrix4()

    return function stickToHand(hand) {
      const self3D = this.el.object3D
      invParentMatrix.getInverse(this.el.object3D.parent.matrixWorld)  
      newMatrix.multiplyMatrices(hand.object3D.matrixWorld, this.state.holdMatrix) // determine new hover3D world matrix
      newMatrix.premultiply(invParentMatrix) // convert to a local matrix
      newMatrix.decompose(self3D.position, self3D.quaternion, self3D.scale)
    }
  })(),

  highlightPieces: (function () {
    let highlighted = []

    return function highlightPieces(pieces) {
      if ( highlighted !== pieces && ( 
        highlighted.length !== pieces.length ||
        highlighted.some(piece => !pieces.includes(piece)) 
      ) ) {

          const highlightHex = this.highlightColor.getHex()

          for (let piece of this.cube.children) {
            if (pieces.includes(piece)) {
              piece.material.emissive.setHex(highlightHex)
            } else {
              piece.material.emissive.setHex(0)
            }
          }

          highlighted = pieces.slice()
      }
    }
  })(),

  createCube() {
    const size = 1/3
    const cubeTexture = this.createCubeTexture()
    const cubeGroup = new THREE.Group()
    const posMatrix = new THREE.Matrix4()
    const pos = new THREE.Vector3()

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) {
            continue
          }
          
          const geo = this.createPieceGeo(size)
          pos.set(x*size, y*size, z*size)
          posMatrix.setPosition(pos)
          geo.applyMatrix(posMatrix)

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
            this.setUVs(geo, face, isExposed ? face : UNEXPOSED_FRAME)
          }

          const cubeMaterial = new THREE.MeshStandardMaterial({map: cubeTexture})
          const mesh = new THREE.Mesh(geo, cubeMaterial)
          mesh.pieceOrigin = new THREE.Vector3(x*size, y*size, z*size)
          cubeGroup.add(mesh)
        }
      }
    }

    return cubeGroup
  },

  setUVs(geo, face, frame) {
    const uvs = geo.getAttribute("uv")
    const u0 = 0.25*(frame % TEXTURE_COLS), u1 = u0 + .25
    const v0 = 0.5*Math.floor(frame/TEXTURE_COLS), v1 = v0 + .5

    let i = face*6
    uvs.setXY(i++, u0, v1)
    uvs.setXY(i++, u0, v0)
    uvs.setXY(i++, u1, v1)
    uvs.setXY(i++, u0, v0)
    uvs.setXY(i++, u1, v0)
    uvs.setXY(i++, u1, v1)
  },

  createCubeTexture() {
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
    // 7th frame is black

    return new THREE.CanvasTexture(canvas)
  },

  createPieceGeo(size) {
    const geo = new THREE.BufferGeometry()
    const A = [ .5, .5, .5]
    const B = [ .5, .5,-.5]
    const C = [ .5,-.5, .5]
    const D = [ .5,-.5,-.5]
    const E = [-.5, .5,-.5]
    const F = [-.5, .5, .5]
    const G = [-.5,-.5,-.5]
    const H = [-.5,-.5, .5]
    const faceNormals = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]]
    const verts = [A,C,B,C,D,B,E,G,F,G,H,F,E,F,B,F,A,B,H,G,C,G,D,C,F,H,A,H,C,A,B,D,E,D,G,E]
    const positions = new Float32Array(verts.length*3)
    const normals = new Float32Array(verts.length*3)
    const uvs = new Float32Array(verts.length*2)

    for (let i = 0; i < verts.length; i++) {
      const j = i*3
      const face = Math.floor(i/NUM_FACES)
      const faceNormal = faceNormals[face]
      positions[j] = verts[i][0]*size
      positions[j+1] = verts[i][1]*size
      positions[j+2] = verts[i][2]*size
      normals[j] = faceNormal[0]
      normals[j+1] = faceNormal[1]
      normals[j+2] = faceNormal[2]
    }

    for (let i = 0; i < verts.length; i+=6) {
      let k = i*2
      uvs[k++] = 0; uvs[k++] = 1
      uvs[k++] = 0; uvs[k++] = 0
      uvs[k++] = 1; uvs[k++] = 1
      uvs[k++] = 0; uvs[k++] = 0
      uvs[k++] = 1; uvs[k++] = 0
      uvs[k++] = 1; uvs[k++] = 1
    }

    geo.addAttribute("position", new THREE.BufferAttribute(positions, 3) )
    geo.addAttribute("normal", new THREE.BufferAttribute(normals, 3) )
    geo.addAttribute("uv", new THREE.BufferAttribute(uvs, 2) )

    return geo
  },

  shuffleCube() {
    const moves = ["F","R","U","L","D","B","F'","R'","U'","L'","D'","B'"]
    for (let i = 0; i < 50; i++) {
      const index = ~~(Math.random()*moves.length)
      this.rotateCube(moves[index])
    }
  },

  rotateCube: (function () {
    const rotationMatrix = new THREE.Matrix4()
    const newMatrix = new THREE.Matrix4()

    return function rotateCube(move, angle = 90) {
      let side = 0
      const deg = THREE.Math.degToRad(angle)
      
      switch(move) {
        case "F":
          side = 4
          rotationMatrix.makeRotationZ(-deg)
          break
        case "R":
          side = 0
          rotationMatrix.makeRotationX(-deg)
          break
        case "U":
          side = 2
          rotationMatrix.makeRotationY(-deg)
          break
        case "L":
          side = 1
          rotationMatrix.makeRotationX(deg)
          break
        case "D":
          side = 3
          rotationMatrix.makeRotationY(deg)
          break
        case "B":
          side = 5
          rotationMatrix.makeRotationZ(deg)
          break
        case "F'":
          side = 4
          rotationMatrix.makeRotationZ(deg)
          break
        case "R'":
          side = 0
          rotationMatrix.makeRotationX(deg)
          break
        case "U'":
          side = 2
          rotationMatrix.makeRotationY(deg)
          break
        case "L'":
          side = 1
          rotationMatrix.makeRotationX(-deg)
          break
        case "D'":
          side = 3
          rotationMatrix.makeRotationY(-deg)
          break
        case "B'":
          side = 5
          rotationMatrix.makeRotationZ(-deg)
          break
      }
  
      const pieces = this.getSidePieces(side)

      for (let piece of pieces) {
        newMatrix.copy(piece.matrix).premultiply(rotationMatrix)
        newMatrix.decompose(piece.position, piece.quaternion, piece.scale)
        piece.matrix.copy(newMatrix)
      }
    }
  })(),

  calcBestSide: (function() {
    const matrixLocal = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const sideNormals = [{x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:-1,z:0}, {x:0,y:0,z:1}, {x:0,y:0,z:-1}]

    return function calcBestSide(hand) {
      matrixLocal.getInverse(this.el.object3D.matrixWorld).multiply(hand.object3D.matrixWorld)
      pos.setFromMatrixPosition(matrixLocal)
      pos.normalize()
  
      for (let side = 0; side < NUM_SIDES; side++) {
        const normal = sideNormals[side]
        if (pos.dot(normal) > 0.7) {
          return side
        }
      }
  
      return -1
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
    const sideTests = [
      (pos) => pos.x > .3,
      (pos) => pos.x < -.3,
      (pos) => pos.y > .3,
      (pos) => pos.y < -.3,
      (pos) => pos.z > .3,
      (pos) => pos.z < -.3,
    ]

    return function getSidePieces(side) {
      if (side < 0 || side >= sideTests.length) {
        return []
      }

      const test = sideTests[side]

      return this.cube.children.filter(mesh => {
        pos.copy(mesh.pieceOrigin).applyMatrix4(mesh.matrix)
        return test(pos)
      })
    }

  })(),

  onGrabStart(event) {
    const hand = event.target
    if (this.state.activeHands.indexOf(hand) === -1 && this.isNear(hand)) {
      this.dispatch( { name: "grab", hand: hand } )
    }
  },

  onGrabEnd(event) {
    const hand = event.target
    if (this.state.activeHands.indexOf(hand) !== -1 && this.isNear(hand)) {
      this.dispatch( { name: "release", hand: hand } )
    }
  },

})