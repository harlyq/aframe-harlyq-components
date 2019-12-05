import { aframeHelper, chessHelper, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const CAPTURED_SIZE = 10
const URL_REGEX = /url\((.*)\)/

function getMaterial(obj3D) {
  const mesh = obj3D.getObjectByProperty("isMesh", true)
  if (mesh) {
    return mesh.material
  }
}

function setMaterial(obj3D, material) {
  const mesh = obj3D.getObjectByProperty("isMesh", true)
  if (mesh) {
    return mesh.material = material
  }
}

AFRAME.registerComponent("chess", {
  schema: {
    src: { default: "" },
    meshes: { default: "" },
    boardMesh: { default: "" },
    blackColor: { type: "color", default: "" },
    whiteColor: { type: "color", default: "" },
    fen: { default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    pgn: { default: "" },
    debug: { default: true },
    replayMoveSpeed: { default: 4 },
    replayTurnDuration: { default: 1 },
    mode: { oneOf: ["physical", "replay", "static", "game"], default: "replay" },
  },

  init() {
    this.onObject3dSet = this.onObject3dSet.bind(this)
    this.onHoverStart = this.onHoverStart.bind(this)
    this.onHoverEnd = this.onHoverEnd.bind(this)
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)

    this.el.addEventListener("object3dset", this.onObject3dSet)
    this.el.addEventListener("hoverstart", this.onHoverStart)
    this.el.addEventListener("hoverend", this.onHoverEnd)
    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)

    this.oldMaterialMap = new Map()
    this.hoverMaterial = new THREE.MeshStandardMaterial ( { color: 0xffff00 } )
    this.whiteMaterial = undefined
    this.blackMaterial = undefined
    this.grabMap = new Map() // grabInfo indexed by piece3D
    this.gameBounds = new THREE.Box3()
    this.fenAST = { layout: [] }
    this.pgnAST = undefined
    this.board = { name: "", board3D: undefined, bounds: new THREE.Box3(), up: new THREE.Vector3(0,1,0) }
    this.rotation180Quaternion = new THREE.Quaternion().setFromAxisAngle(this.board.up, Math.PI)
    this.replay = { moveIndex: 0, actions: undefined, movers: [], delay: 0 }
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3dSet)
    this.el.removeEventListener("hoverstart", this.onHoverStart)
    this.el.removeEventListener("hoverend", this.onHoverEnd)
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
  },

  update() {
    const data = this.data
    this.el.setAttribute("gltf-model", data.src)

    const meshes = data.meshes.split(",")
    if (meshes.length !== MESHES_ORDER.length) {
      aframeHelper.error(this, `missing meshes, found ${meshes.length}, expecting ${MESHES_ORDER.length}`)
      this.meshes = []
    } else {
      this.meshes = Object.fromEntries( meshes.map((x,i) => {
        x = x.trim()
        const rotate180 = x[x.length - 1] === "'"
        return [MESHES_ORDER[i], { name: rotate180 ? x.slice(0,-1) : x, rotate180, mesh3D: undefined }] 
      }) )
    }

    this.board.name = data.boardMesh.trim()
    this.fenAST = this.parseFEN(data.fen)
    this.parsePGN(data.pgn)

    this.blackMaterial = data.blackColor ? new THREE.MeshStandardMaterial({color: data.blackColor}) : undefined
    this.whiteMaterial = data.whiteColor ? new THREE.MeshStandardMaterial({color: data.whiteColor}) : undefined
  },

  tick(time, deltaTime) {
    const data = this.data

    if (data.mode === "physical") {
      this.grabMap.forEach((grabInfo, piece3D) => {
        threeHelper.applyOffsetMatrix(grabInfo.hand.object3D, piece3D, grabInfo.offsetMatrix)
      })

    } else if (data.mode === "replay") {
      this.replayTick(deltaTime/1000)
    }
  },

  parseFEN(fen) {
    return chessHelper.parseFEN(fen)
  },

  parsePGN(pgn) {
    if (!pgn) {
      return
    }

    const url = pgn.match(URL_REGEX)
    if (url) {
      fetch(url[1])
        .then(response => {
          if (!response.ok) aframeHelper.error(this, `file: "${url[1]}" ${response.statusText}`)
          return response.text()
        })
        .then(text => this.parsePGN(text))
    } else {
      this.pgnAST = chessHelper.parsePGN(pgn)
      this.startReplay()
    }
  },

  startReplay() {
    const replay = this.replay
    replay.moveIndex = 0
    replay.actions = undefined
    replay.movers = []
    replay.delay = 0
  },

  createChessSet(chess3D) {
    const self = this

    threeHelper.setOBBFromObject3D(this.gameBounds, chess3D)

    const board3D = chess3D.getObjectByName(this.board.name)
    if (!board3D) {
      aframeHelper.error(this, `unable to find board mesh '${this.board.name}'`)
    } else {
      this.board.board3D = board3D
      threeHelper.setOBBFromObject3D(this.board.bounds, board3D)
    }

    for (let code in this.meshes) {
      const mesh = this.meshes[code]
      const mesh3D = chess3D.getObjectByName(mesh.name)

      if (!mesh3D) {
        aframeHelper.error(self, `unable to find mesh '${mesh.name}'`)
      } else {
        mesh3D.visible = false
        mesh.mesh3D = mesh3D
      }
    }

    for (let piece of this.fenAST.layout) {
      this.createMeshForPiece(chess3D, piece)
    }
  },

  createMeshForPiece(chess3D, piece) {
    const mesh = this.meshes[piece.code]
    const mesh3D = mesh ? mesh.mesh3D : undefined

    if (mesh3D) {
      const piece3D = mesh3D.clone()
      const isBlack = piece.code === piece.code.toLowerCase()
      
      piece3D.visible = true
      if (this.blackMaterial && isBlack) {
        piece3D.material = this.blackMaterial
      } else if (this.whiteMaterial && !isBlack) {
        piece3D.material = this.whiteMaterial
      }

      if (mesh.rotate180) {
        piece3D.quaternion.premultiply(this.rotation180Quaternion)
      }

      chess3D.add(piece3D)
      piece.piece3D = piece3D

      return piece3D
    }
  },

  setupPicking() {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.piece3D, score: "closestforward"})

    this.fenAST.layout.forEach(setupPiecePicking)
  },

  setupBoard(chess3D) {
    if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshes[code].mesh3D) ) {
      return
    }

    const groundY = this.board.bounds.max.y

    for (let piece of this.fenAST.layout) {
      const xz = this.xzFromFileRank(this.board.bounds, piece.file, piece.rank)
      piece.piece3D.position.set(xz.x, groundY, xz.z)
    }
  },

  // 1,1 => bottom left, supports fractional file and rank
  xzFromFileRank(bounds, file, rank) {
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    return { x: bounds.min.x + (file - .5)*w/NUM_RANKS, z: bounds.max.z - (rank - .5)*h/NUM_FILES }
  },

  fileRankFromXZ(bounds, x, z) {
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    const file = Math.floor( NUM_FILES*( x - bounds.min.x ) / w ) + 1
    const rank = Math.floor( NUM_RANKS*( bounds.max.z - z ) / h ) + 1
    return file >= 1 && file <= NUM_FILES && rank >= 1 && rank <= NUM_RANKS ? [file,rank] : undefined
  },

  snapToBoard(piece3D) {
    const fileRank = this.fileRankFromXZ(this.board.bounds, piece3D.position.x, piece3D.position.z)
    if (fileRank) {
      const pos = this.xzFromFileRank(this.board.bounds, fileRank[0], fileRank[1])
      const groundY = this.board.bounds.max.y
      piece3D.position.set(pos.x, groundY, pos.z)
    }
  },

  replayTick(dt) {
    const data = this.data
    const replay = this.replay

    if (replay.delay > 0 || replay.movers.length > 0) {
      replay.delay -= dt

      if (replay.movers.length > 0) {
        replay.movers.forEach(mover => mover.tick(dt))
        
        if (replay.movers.every(mover => mover.isComplete())) {
          replay.movers.length = 0
          replay.actions.splice(0,1) // move to the next action
        }
      }

    } else if (replay.actions && replay.actions.length > 0) {
      const action = replay.actions[0]

      switch (action.type) {
        case "move": {
          const piece = action.piece
          const moveMover = this.createMover(this.board.bounds, piece, action.fromFile, action.fromRank, action.toFile, action.toRank, data.replayMoveSpeed)
          replay.movers.push( moveMover )
          break
        } 
        case "capture": {
          const capturedPiece = action.capturedPiece
          const offBoardFile = Math.floor(action.capturedIndex/CAPTURED_SIZE) + 10
          const offBoardRank = (action.capturedIndex % CAPTURED_SIZE)/CAPTURED_SIZE*NUM_RANKS + 1
          const captureMover = this.createMover(this.board.bounds, capturedPiece, offBoardFile, offBoardRank, offBoardFile, offBoardRank, data.replayMoveSpeed)
          replay.movers.push(captureMover)
          break
        }
        case "promote": {
          const newPiece = action.newPiece
          action.piece.piece3D.visible = false
          newPiece.piece3D = this.createMeshForPiece(this.chess3D, newPiece)
          newPiece.piece3D.visible = true
          const promoteMover = this.createMover(this.board.bounds, newPiece, newPiece.file, newPiece.rank, newPiece.file, newPiece.rank, data.replayMoveSpeed)
          replay.movers.push(promoteMover)
        }
        case "castle": {
          const king = action.king
          const rook = action.rook
          const kingMover = this.createMover(this.board.bounds, king, 5, king.rank, action.kingside ? 7 : 3, king.rank, data.replayMoveSpeed)
          const rookMover = this.createMover(this.board.bounds, rook, action.kingside ? 8 : 1, rook.rank, action.kingside ? 6 : 4, rook.rank, data.replayMoveSpeed)
          replay.movers.push(kingMover, rookMover)
        }
      }
    } else if (this.pgnAST && this.pgnAST.moves[replay.moveIndex]) {
      replay.actions = chessHelper.applyMove(this.fenAST, this.pgnAST.moves[replay.moveIndex++]) 
      replay.delay = replay.actions ? data.replayTurnDuration : 0
    }

  },

  // speed is in tiles per second
  // tick() returns true when teh mover is complete
  createMover(bounds, piece, startFile, startRank, endFile, endRank, speed) {
    let elapsed = 0
    const totalTime = Math.hypot(endFile - startFile, endRank - startRank)/speed
    const self = this

    function tick(dt) {
      elapsed += dt

      const ratio = THREE.Math.clamp(elapsed/totalTime, 0, 1)
      const partialFile = (endFile - startFile)*ratio + startFile
      const partialRank = (endRank - startRank)*ratio + startRank
      const xz = self.xzFromFileRank(bounds, partialFile, partialRank)
      const groundY = bounds.max.y

      piece.piece3D.position.set(xz.x, groundY, xz.z)
    }

    function isComplete() {
      return elapsed > totalTime
    }

    return {
      tick,
      isComplete,
    }
  },

  onObject3dSet(event) {
    this.chess3D = event.detail.object
    this.createChessSet(this.chess3D)
    this.setupPicking()
    this.setupBoard(this.chess3D)
  },

  onHoverStart(event) {
    const piece3D = event.detail.obj3D
    if (piece3D) {
      if (!this.oldMaterialMap.has(piece3D)) {
        this.oldMaterialMap.set(piece3D, getMaterial(piece3D))
        setMaterial(piece3D, this.hoverMaterial)
      }
    }
  },

  onHoverEnd(event) {
    const piece3D = event.detail.obj3D
    if (piece3D) {
      if (this.oldMaterialMap.has(piece3D)) {
        setMaterial( piece3D, this.oldMaterialMap.get(piece3D) )
        this.oldMaterialMap.delete(piece3D)
      }
    }
  },

  onGrabStart(event) {
    const hand = event.detail.hand
    const piece3D = event.detail.obj3D
    const grabInfo = this.grabMap.get(piece3D)

    if (grabInfo) {
      // we grab this from another hand, so keep the original quaternion
      grabInfo.offsetMatrix = threeHelper.calcOffsetMatrix(hand.object3D, piece3D, grabInfo.offsetMatrix)
      grabInfo.hand = hand
    } else {
      this.grabMap.set(piece3D, { hand, offsetMatrix: threeHelper.calcOffsetMatrix(hand.object3D, piece3D), startQuaternion: piece3D.quaternion.clone() })
    }
  },

  onGrabEnd(event) {
    const hand = event.detail.hand
    const piece3D = event.detail.obj3D
    const grabInfo = this.grabMap.get(piece3D)

    if (grabInfo && grabInfo.hand === hand) { // this may be false if another hand took the piece
      if (piece3D.position.y < this.gameBounds.max.y) {
        this.snapToBoard(piece3D)
      }
  
      piece3D.quaternion.copy( this.grabMap.get(piece3D).startQuaternion )
  
      this.grabMap.delete(piece3D)
    }
  },
})

