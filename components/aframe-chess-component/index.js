import { aframeHelper, chessHelper, instanced, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const CAPTURED_SIZE = 10
const URL_REGEX = /url\((.*)\)/
const EXTRA_PIECES_FOR_PROMOTION = 4
const toLowerCase = (str) => str.toLowerCase()


AFRAME.registerComponent("chess", {
  schema: {
    src: { default: "" },
    meshes: { default: "" },
    boardMesh: { default: "" },
    blackColor: { type: "color", default: "" },
    whiteColor: { type: "color", default: "" },
    fen: { default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    pgn: { default: "" },
    debug: { default: false },
    boardMoveSpeed: { default: 4 },
    replayTurnDuration: { default: .5 },
    mode: { oneOf: ["freestyle", "replay", "static", "game"], default: "freestyle", parse: toLowerCase },
    aiDuration: { default: 1 },
    whitePlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
    blackPlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
  },

  init() {
    this.onObject3dSet = this.onObject3dSet.bind(this)
    this.onHoverStart = this.onHoverStart.bind(this)
    this.onHoverEnd = this.onHoverEnd.bind(this)
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.onReset = this.onReset.bind(this)

    this.el.addEventListener("object3dset", this.onObject3dSet)
    this.el.addEventListener("hoverstart", this.onHoverStart)
    this.el.addEventListener("hoverend", this.onHoverEnd)
    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
    this.el.addEventListener("reset", this.onReset)

    this.playerType = {}
    this.chessMaterial = new THREE.MeshStandardMaterial()
    this.blackColor = new THREE.Color(.2,.2,.2)
    this.whiteColor = new THREE.Color(.8,.8,.8)
    this.gameBounds = new THREE.Box3()
    this.pgnAST = undefined
    this.rotate180Quaternion = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3(0,1,0), Math.PI)
    this.board = {
      name: "",
      board3D: undefined,
      bounds: new THREE.Box3(),
    }
    this.garbochess = undefined

    this.state = {
      actions: undefined,
      currentPlayer: "white",
      fenAST: { layout: [], capturedPieces: [] },
      grabMap: new Map(),
      movers: [],
      nextAIMove: "",
      nextHumanMove: "",
      pickingSide: "none",
      delay: 0,
      replayIndex: 0,
      currentMode: "setup",
    }

    const data = this.data
    this.el.setAttribute("gltf-model", data.src)
    this.meshInfos = this.parseMeshes(data.meshes)
    this.board.name = data.boardMesh.trim()
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3dSet)
    this.el.removeEventListener("hoverstart", this.onHoverStart)
    this.el.removeEventListener("hoverend", this.onHoverEnd)
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
    this.el.removeEventListener("reset", this.onReset)
  },

  update(oldData) {
    const data = this.data

    if (data.fen !== oldData.fen) {
      this.fenAST = this.parseFEN(data.fen)
    }

    if (data.pgn !== oldData.pgn) {
      this.pgnAST = this.parsePGN(data.pgn)
    }

    if (data.blackColor) this.blackColor.set(data.blackColor)
    if (data.whiteColor) this.whiteColor.set(data.whiteColor)

    this.playerType["white"] = data.whitePlayer !== "human" ? "ai" : "human"
    this.playerType["black"] = data.blackPlayer !== "human" ? "ai" : "human"

    if (data.mode !== oldData.mode) {
      this.setupMode(data.mode)
    }
  },

  tick(time, deltaTime) {
    const dt = Math.min(0.1, deltaTime/1000)

    switch (this.state.currentMode) {
      case "freestyle":
        this.freestyleTick()
        break
      case "replay":
        this.boardTick(dt)
        this.replayTick()
        break
      case "game":
        this.boardTick(dt)
        if (this.playerType[this.state.currentPlayer] === "ai") {
          this.aiTick()
        } else {
          this.humanTick()
        }
        break
    }
  },

  setCurrentPlayer(player) {
    const state = this.state
    const data = this.data
    state.currentPlayer = player

    if (this.playerType[player] === "ai") {
      this.setupPicking("none")
      state.nextAIMove = ""
      this.garbochess.postMessage("search " + data.aiDuration*1000)
    } else {
      state.nextHumanMove = ""
      this.garbochess.postMessage("possible")
      this.setupPicking(player)
    }
  },

  nextTurn() {
    this.setCurrentPlayer(this.state.currentPlayer === "white" ? "black" : "white")
  },

  parseMeshes(meshes) {
    const meshesList = meshes.split(",")

    if (meshesList.length !== MESHES_ORDER.length) {
      aframeHelper.error(this, `missing meshes, found ${meshesList.length}, expecting ${MESHES_ORDER.length}`)
      return []

    } else {
      return Object.fromEntries( meshesList.map((x,i) => {
        x = x.trim()
        const rotate180 = x[x.length - 1] === "'"
        return [MESHES_ORDER[i], { name: (rotate180 ? x.slice(0,-1) : x), rotate180, instancedMesh: undefined, nextIndex: 0 }] 
      }) )
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

      if (this.data.mode === "replay") {
        this.setupMode("replay")
      }

      return this.pgnAST
    }
  },

  setupMode(mode) {
    if (!this.chess3D) {
      return
    }

    const state = this.state
    const fenStr = this.pgnAST && this.pgnAST["FEN"] ? this.pgnAST["FEN"] : this.data.fen

    state.actions = undefined
    state.fenAST = this.parseFEN( fenStr || chessHelper.FEN_DEFAULT )
    state.grabMap.clear()
    state.movers.length = 0
    state.nextAIMove = ""
    state.nextHumanMove = ""
    state.delay = 0
    state.replayIndex = 0
    state.currentMode = mode

    this.setupBoard()

    switch (mode) {
      case "replay":
        break

      case "game":
        this.setupGameWorker()
        this.garbochess.postMessage("position " + chessHelper.fenToString(this.fenAST))
        this.setCurrentPlayer(state.fenAST.player)
        break

      case "freestyle":
        this.setupPicking("all")
        break
    }
  },

  createChessSet(chess3D, fenAST) {
    const self = this

    threeHelper.setOBBFromObject3D(this.gameBounds, chess3D)

    const board3D = chess3D.getObjectByName(this.board.name)
    if (!board3D) {
      aframeHelper.error(this, `unable to find board mesh '${this.board.name}'`)
    } else {
      this.board.board3D = board3D

      // get bounds in board3D space
      const invParentMatrix = new THREE.Matrix4().getInverse(board3D.parent.matrixWorld)
      this.board.bounds.setFromObject(board3D)
      this.board.bounds.applyMatrix4(invParentMatrix)
    }

    let codeCounts = Object.fromEntries( MESHES_ORDER.map(code => [code, 0]) )
    let meshCounts = Object.fromEntries( MESHES_ORDER.map(code => [this.meshInfos[code].name, 0]) )

    for (let piece of fenAST.layout) {
      const code = piece.code
      const meshName = this.meshInfos[code].name
      meshCounts[meshName]++
      codeCounts[code]++
    }

    // add extra counts for promotion pieces
    for (let code of "rnbqRNBQ".split("")) {
      const meshName = this.meshInfos[code].name
      meshCounts[meshName] += EXTRA_PIECES_FOR_PROMOTION
      codeCounts[code] += EXTRA_PIECES_FOR_PROMOTION
    }

    // multiple meshInfos can use the same meshName e.g. white rook and black rook
    let cacheInstances = {}
    const meshMatrix = new THREE.Matrix4()

    for (let code in this.meshInfos) {
      const meshInfo = this.meshInfos[code]
      const meshName = meshInfo.name
      const cache = cacheInstances[meshName]

      if (cache) {
        meshInfo.instancedMesh = cache.instancedMesh
        meshInfo.nextIndex = cache.nextIndex
        cache.nextIndex += codeCounts[code]

      } else {
        const mesh3D = chess3D.getObjectByName(meshName)

        if (!mesh3D) {
          aframeHelper.error(self, `unable to find mesh '${meshName}'`)
        } else {
          mesh3D.visible = false
          mesh3D.material = this.chessMaterial
          meshInfo.instancedMesh = instanced.createMesh( mesh3D, meshCounts[meshName] )

          // scale and rotate to match the original mesh
          meshMatrix.compose(meshInfo.instancedMesh.position, mesh3D.quaternion, mesh3D.scale)
          meshInfo.instancedMesh.geometry.applyMatrix(meshMatrix)

          meshInfo.nextIndex = 0
          chess3D.add(meshInfo.instancedMesh)

          cacheInstances[meshName] = { instancedMesh: meshInfo.instancedMesh, nextIndex: codeCounts[code] }
        }
      }
    }

    for (let piece of fenAST.layout) {
      this.setupInstanceForPiece(piece)
    }
  },

  setupInstanceForPiece(piece) {
    const mesh = this.meshInfos[piece.code]
    const instancedMesh = mesh ? mesh.instancedMesh : undefined

    if (instancedMesh) {
      const index = mesh.nextIndex++

      if (mesh.rotate180) {
        const quaternion = new THREE.Quaternion()
        instanced.getQuaternionAt( instancedMesh, index, quaternion )
        instanced.setQuaternionAt( instancedMesh, index, quaternion.multiply(this.rotate180Quaternion) )
      }

      instanced.setScaleAt(instancedMesh, index, 1, 1, 1)

      const isBlack = piece.code === piece.code.toLowerCase()
      if (isBlack) {
        instanced.setColorAt(instancedMesh, index, this.blackColor)
      } else {
        instanced.setColorAt(instancedMesh, index, this.whiteColor)
      }

      piece.index = index
      piece.instancedMesh = instancedMesh
    }
  },

  setupPicking(side) {
    if (side === this.pickingSide) {
      return
    }

    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el
    const layout = this.fenAST.layout

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.instancedMesh, score: "closestforward", instanceIndex: piece.index})
    const shutdownPiecePicking = piece => grabSystem.unregisterTarget(el, {obj3D: piece.instancedMesh, instanceIndex: piece.index})

    if (this.pickingSide !== "none") {
      // Note, ok to shutdown, even if we were never setup
      this.fenAST.capturedPieces.forEach(shutdownPiecePicking)
      layout.forEach(shutdownPiecePicking)
    }

    if (side !== "none") {
      layout.forEach(piece => {
        const isBlack = piece.code === piece.code.toLowerCase()
        if (side === "all" || (isBlack && side === "black") || (!isBlack && side === "white")) {
          setupPiecePicking(piece)
        }
      })
    }

    this.pickingSide = side
  },

  setupBoard() {
    if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshInfos[code].instancedMesh) ) {
      return
    }

    const groundY = this.board.bounds.max.y

    for (let piece of this.fenAST.layout) {
      const xz = this.xzFromFileRank(this.board.bounds, piece.file, piece.rank)
      instanced.setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z)
    }

    if (this.fenAST.capturedPieces) {
      for (let i = 0; i < this.fenAST.capturedPieces.length; i++) {
        const piece = this.fenAST.capturedPieces[i]
        const offBoard = this.fileRankFromCaptured(i)
        const xz = this.xzFromFileRank(this.board.bounds, offBoard.file, offBoard.rank)
        instanced.setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z)
      }
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
    return file >= 1 && file <= NUM_FILES && rank >= 1 && rank <= NUM_RANKS ? {file,rank} : undefined
  },

  fileRankFromCaptured(capturedIndex) {
    const offBoardFile = Math.floor(capturedIndex/CAPTURED_SIZE) + 10
    const offBoardRank = (capturedIndex % CAPTURED_SIZE)/CAPTURED_SIZE*NUM_RANKS + 1
    return {file: offBoardFile, rank: offBoardRank}
  },

  snapToBoard(piece, piecePosition) {
    const destination = this.fileRankFromXZ(this.board.bounds, piecePosition.x, piecePosition.z)
    if (destination) {
      const pos = this.xzFromFileRank(this.board.bounds, destination.file, destination.rank)
      const groundY = this.board.bounds.max.y
      instanced.setPositionAt(piece.instancedMesh, piece.index, pos.x, groundY, pos.z)
    }
    return destination
  },

  boardTick(dt) {
    const data = this.data
    const state = this.state

    state.delay -= dt

    if (state.movers.length > 0) {

      if (state.movers.length > 0) {
        state.movers.forEach(mover => mover.tick(dt))
        
        if (state.movers.every(mover => mover.isComplete())) {
          state.movers.length = 0
          state.actions.splice(0,1) // move to the next action
        }
      }

    } else if (state.actions && state.actions.length > 0) {
      const action = state.actions[0]
      const bounds = this.board.bounds

      switch (action.type) {
        case "move": {
          const piece = action.piece
          const moveMover = this.createMover(bounds, piece, action.fromFile, action.fromRank, action.toFile, action.toRank, data.boardMoveSpeed)
          state.movers.push( moveMover )
          break
        } 
        case "capture": {
          const capturedPiece = action.capturedPiece
          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const captureMover = this.createMover(bounds, capturedPiece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, data.boardMoveSpeed)
          state.movers.push(captureMover)
          break
        }
        case "promote": {
          const newPiece = action.newPiece

          this.setupInstanceForPiece(newPiece)

          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const promoteMover = this.createMover(bounds, newPiece, newPiece.file, newPiece.rank, newPiece.file, newPiece.rank, data.boardMoveSpeed)
          const pawnMover = this.createMover(bounds, action.piece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, data.boardMoveSpeed)
          state.movers.push(promoteMover, pawnMover)
          break
        }
        case "castle": {
          const king = action.king
          const rook = action.rook
          const kingMover = this.createMover(bounds, king, 5, king.rank, action.kingside ? 7 : 3, king.rank, data.boardMoveSpeed)
          const rookMover = this.createMover(bounds, rook, action.kingside ? 8 : 1, rook.rank, action.kingside ? 6 : 4, rook.rank, data.boardMoveSpeed)
          state.movers.push(kingMover, rookMover)
          break
        }

        default:
          throw Error(`unknown action of type "${action.type}"`)
      }
    }
  },

  replayTick() {
    const state = this.state
    const replay = this.replay

    if (state.delay <= 0 && state.movers.length === 0 && (!state.actions || state.actions.length === 0) && this.pgnAST && this.pgnAST.moves[state.replayIndex]) {
      state.actions = chessHelper.applyMove(this.fenAST, this.pgnAST.moves[state.replayIndex++]) 
      state.delay = state.actions ? this.data.replayTurnDuration : 0
    }
  },

  aiTick() {
    const state = this.state
    const data = this.data

    if (state.movers.length === 0 && (!state.actions || state.actions.length === 0) && this.garbochess && this.nextAIMove) {
      const move = chessHelper.decodeCoordMove(this.fenAST, this.nextAIMove)
      if (data.debug) {
        console.log("AI", move.code === move.code.toLowerCase() ? "black" : "white", this.nextAIMove, chessHelper.sanToString(move))
      }

      this.state.actions = chessHelper.applyMove(this.fenAST, move)  
      this.nextAIMove = ""
      this.nextTurn()
    }
  },

  freestyleTick() {
    this.state.grabMap.forEach((grabInfo, piece) => {
      instanced.applyOffsetMatrix(grabInfo.hand.object3D, piece.instancedMesh, piece.index, grabInfo.offsetMatrix)
    })
  },

  humanTick() {
    const data = this.data

    this.state.grabMap.forEach((grabInfo, piece) => {
      instanced.applyOffsetMatrix(grabInfo.hand.object3D, piece.instancedMesh, piece.index, grabInfo.offsetMatrix)
    })

    if (this.nextHumanMove) {
      const move = chessHelper.decodeCoordMove(this.fenAST, this.nextHumanMove)
      if (data.debug) {
        console.log("HU", move.code === move.code.toLowerCase() ? "black" : "white", this.nextHumanMove, chessHelper.sanToString(move))
      }

      // this.state.actions = chessHelper.applyMove(this.fenAST, move)
      chessHelper.applyMove(this.fenAST, move)
      this.setupBoard() // snap pieces
      this.nextHumanMove = ""
      this.nextTurn()
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

      instanced.setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z)
    }

    function isComplete() {
      return elapsed > totalTime
    }

    return {
      tick,
      isComplete,
    }
  },

  setupGameWorker() {
    if (!this.garbochess) {
      this.garbochess = new Worker("garbochess.js")
      this.garbochess.onmessage = (event) => {
        if (this.data.debug) {
          console.log(event.data)
        }
  
        if (event.data.startsWith("pv")) {
        } else if (event.data.startsWith("message")) {
        } else if (event.data.startsWith("invalid")) {
          this.setupBoard() // reset invalidly moved pieces
        } else if (event.data.startsWith("valid")) {
          const commands = event.data.split(" ")
          this.nextHumanMove = commands[1]
        } else if (event.data.startsWith("options")) {
        } else {
          this.nextAIMove = event.data
        }
      }  
    }
  },

  onObject3dSet(event) {
    const data = this.data
    this.chess3D = event.detail.object
    this.createChessSet(this.chess3D, this.fenAST)
    this.setupMode(this.data.mode)
  },

  onHoverStart(event) {
    const instancedMesh = event.detail.obj3D

    if (Object.keys(this.meshInfos).find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const index = event.detail.instanceIndex
      instanced.setColorAt(instancedMesh, index, 1, 1, 0)
    }
  },

  onHoverEnd(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const index = event.detail.instanceIndex

      // the piece were were hovering over may have been captured, so check the captured list as well
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index) || 
        this.fenAST.capturedPieces.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)

      // Note, if a second controller is hovering over the same piece, we will lose the highlight
      const isBlack = piece.code === piece.code.toLowerCase()
      instanced.setColorAt(instancedMesh, index, isBlack ? this.blackColor : this.whiteColor)
    }
  },

  onGrabStart(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const state = this.state
      const hand = event.detail.hand
      const index = event.detail.instanceIndex
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const grabInfo = state.grabMap.get(piece)

      if (grabInfo) {
        // we grab this from another hand, so keep the original quaternion
        grabInfo.offsetMatrix = instanced.calcOffsetMatrix(hand.object3D, instancedMesh, piece.index, grabInfo.offsetMatrix)
        grabInfo.hand = hand
      } else {
        state.grabMap.set(piece, { 
          hand, 
          offsetMatrix: instanced.calcOffsetMatrix(hand.object3D, instancedMesh, piece.index), 
          startQuaternion: instanced.getQuaternionAt(instancedMesh, piece.index) 
        })
      }
    }
  },

  onGrabEnd(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const state = this.state
      const hand = event.detail.hand
      const index = event.detail.instanceIndex
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const grabInfo = state.grabMap.get(piece)

      // TODO freestyle can be placed anywhere, but game must be on the board, or be reset to it's original position
      if (grabInfo && grabInfo.hand === hand) {
        const piecePosition = instanced.getPositionAt(instancedMesh, index)
        if (piecePosition.y < this.gameBounds.max.y) {
          const destination = this.snapToBoard(piece, piecePosition)

          // TODO handle promotion
          if (state.currentMode === "game") {
            const humanMove = chessHelper.fileRankToCoord(piece.file, piece.rank) + chessHelper.fileRankToCoord(destination.file, destination.rank)
            this.garbochess.postMessage(humanMove)
          }
        }

        instanced.setQuaternionAt( instancedMesh, index, grabInfo.startQuaternion )
        state.grabMap.delete(piece)
      }
    }
  },

  onReset() {
    this.setupMode(this.data.mode)
  }
})

