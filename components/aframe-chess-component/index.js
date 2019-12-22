import { aframeHelper, chessHelper, instanced, nafHelper, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const CAPTURED_SIZE = 10
const URL_REGEX = /url\((.*)\)/
const toLowerCase = (str) => str.toLowerCase()

// Network the chess component.  The owner manages the AI, and replay, but any client can provide human moves 
// (although move validation is always handled by the owner).
AFRAME.registerSystem("chess", {

  ...nafHelper.networkSystem("chess"),

  init() {
    this.setupNetwork()
  },

  remove() {
    this.shutdownNetwork()
  },

})


AFRAME.registerComponent("chess", {
  schema: {
    model: { default: "https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/assets/chess_set/chess_set.glb" },
    meshes: { default: "rook,knight',bishop',queen,king,pawn,rook,knight,bishop,queen,king,pawn" },
    boardMesh: { default: "board" },
    blackColor: { type: "color", default: "#444" },
    whiteColor: { type: "color", default: "#eee" },
    highlightColor: { type: "color", default: "#ff0" },
    fen: { default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    pgn: { default: "" },
    debug: { default: false },
    boardMoveSpeed: { default: 4 },
    replayTurnDuration: { default: .5 },
    mode: { oneOf: ["freestyle", "replay", "static", "game"], default: "freestyle", parse: toLowerCase },
    aiDuration: { default: 1 },
    whitePlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
    blackPlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
    maxCountPerPiece: { default: 8 },
    aiWorker: { default: "https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/garbochess.js" }
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

    this.chessMaterial = new THREE.MeshStandardMaterial()
    this.blackColor = new THREE.Color(.2,.2,.2)
    this.whiteColor = new THREE.Color(.8,.8,.8)
    this.highlightColor = new THREE.Color(1,1,0)
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
      // global state
      fenAST: { layout: [], capturedPieces: [], player: "white" },
      replayIndex: 0,
      currentPlayer: "white",
      globalMode: "",
      playerInfo: {},

      // local state
      actions: [],
      grabMap: new Map(),
      movers: [],
      nextAIMove: "",
      nextHumanMove: "",
      pickingSide: "none",
      delay: 0,
      localMode: "setup",
      pendingLocalMove: "",
      waitingForSetup: false,
    }

    const data = this.data
    this.el.setAttribute("gltf-model", data.model)
    this.meshInfos = this.parseMeshes(data.meshes)
    this.board.name = data.boardMesh.trim()
    this.pendingMode = ""

    this.system.registerNetworking(this, { 
      onClientDisconnected: this.onClientDisconnected.bind(this),
      onOwnershipGained: this.onOwnershipGained.bind(this),
      onOwnershipLost: this.onOwnershipLost.bind(this),
      receiveNetworkData: this.receiveNetworkData.bind(this),
      requestSync: this.requestSync.bind(this),
    })
  },

  remove() {
    this.system.unregisterNetworking(this)

    this.el.removeEventListener("object3dset", this.onObject3dSet)
    this.el.removeEventListener("hoverstart", this.onHoverStart)
    this.el.removeEventListener("hoverend", this.onHoverEnd)
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
    this.el.removeEventListener("reset", this.onReset)
  },

  update(oldData) {
    const data = this.data

    if (data.pgn !== oldData.pgn) {
      this.pgnAST = this.parsePGN(data.pgn)
    }

    if (data.blackColor) this.blackColor.set(data.blackColor)
    if (data.whiteColor) this.whiteColor.set(data.whiteColor)
    this.highlightColor.set(data.highlightColor)

    if (nafHelper.isMine(this)) {
      const state = this.state
      let gameChanged = false

      if (data.mode !== oldData.mode) {
        state.globalMode = data.mode
        gameChanged = true
      }
  
      if (data.whitePlayer !== oldData.whitePlayer || data.blackPlayer !== oldData.blackPlayer) {
        state.playerInfo["white"] = { playerType: data.whitePlayer !== "human" ? "ai" : "human", networkClientId: undefined }
        state.playerInfo["black"] = { playerType: data.blackPlayer !== "human" ? "ai" : "human", networkClientId: undefined }
        gameChanged = true
      }
    
      if (gameChanged) {
        this.resetGame(state.globalMode)
      }
    }
  },

  tick(time, deltaTime) {
    const dt = Math.min(0.1, deltaTime/1000)
    const data = this.data
    const state = this.state

    switch (state.localMode) {
      case "freestyle":
        this.grabTick()
        break
      case "replay":
        this.actionsTick(dt, data.boardMoveSpeed)
        this.replayTick()
        break
      case "game":
        this.actionsTick(dt, data.boardMoveSpeed)
        if (state.playerInfo[state.currentPlayer].playerType === "ai") {
          this.aiTick()
        } else {
          this.grabTick()
          this.humanTick()
        }
        break
      case "network":
        this.actionsTick(dt, state.actions.length < 4 ? data.boardMoveSpeed : data.boardMoveSpeed*4)
        if (state.actions.length === 0) {
          this.grabTick() // in case they can grab things
        }
    }
  },

  setCurrentPlayer(player) {
    const state = this.state
    const data = this.data
    const playerInfo = state.playerInfo[player]

    state.currentPlayer = player
    state.fenAST.player = player

    if (playerInfo.playerType === "ai") {
      this.setupPicking("none")
      state.nextAIMove = ""

      if (nafHelper.isMine(this)) {
        this.garbochess.postMessage("search " + data.aiDuration*1000)
      }
    } else {
      state.nextHumanMove = ""
      //this.garbochess.postMessage("possible")
      this.setupHumanPicking(player)
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
      return this.pgnAST
    }
  },

  resetGame(mode) {
    console.assert(mode !== "network")
    const state = this.state

    let fenStr = this.pgnAST && this.pgnAST["FEN"] ? this.pgnAST["FEN"] : this.data.fen
    fenStr = fenStr || chessHelper.FEN_DEFAULT

    state.fenAST = this.parseFEN( fenStr )
    state.replayIndex = 0

    if (mode === "game") {
      this.setupGameWorker()
    }

    this.releaseAllInstances()
    this.setupMode(mode)
  },

  setupMode(mode) {
    if (!this.chess3D || (mode === "game" && !this.garbochess)) {
      this.pendingMode = mode
      return
    }

    if (this.data.debug) {
      console.log("mode", mode)
    }

    const state = this.state

    state.actions.length = 0
    state.grabMap.clear()
    state.movers.length = 0
    state.nextAIMove = ""
    state.nextHumanMove = ""
    state.delay = 0
    state.localMode = mode

    switch (mode) {
      case "replay":
        break

      case "game":
        this.garbochess.postMessage("position " + chessHelper.fenToString(state.fenAST))
        break

      case "freestyle":
        break

      case "network":
        break
    }

    this.setupBoard(state.fenAST)

    // picking must be after setupBoard()
    switch (mode) {
      case "freestyle":
        this.setupPicking("all")
        break

      case "game":
      case "network":
        this.setCurrentPlayer(state.fenAST.player)
        break
    }
  },

  createChessSet(chess3D) {
    const self = this
    const data = this.data

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

    let meshCounts = Object.fromEntries( MESHES_ORDER.map(code => [this.meshInfos[code].name, 0]) )

    // multiple meshInfos can use the same meshName e.g. white rook and black rook
    for (let code of MESHES_ORDER) {
      const meshName = this.meshInfos[code].name
      meshCounts[meshName] += data.maxCountPerPiece
    }

    let cacheInstances = {}
    const meshMatrix = new THREE.Matrix4()

    for (let code in this.meshInfos) {
      const meshInfo = this.meshInfos[code]
      const meshName = meshInfo.name
      const cache = cacheInstances[meshName]

      if (cache) {
        meshInfo.instancedMesh = cache.instancedMesh
        meshInfo.startIndex = meshInfo.nextIndex = cache.nextIndex
        cache.nextIndex += data.maxCountPerPiece

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

          meshInfo.nextIndex = meshInfo.startIndex = 0
          chess3D.add(meshInfo.instancedMesh)

          cacheInstances[meshName] = { instancedMesh: meshInfo.instancedMesh, nextIndex: data.maxCountPerPiece }
        }
      }
    }
  },

  setupInstanceForPiece(piece) {
    const meshInfo = this.meshInfos[piece.code]
    const instancedMesh = meshInfo ? meshInfo.instancedMesh : undefined

    if (instancedMesh) {
      const index = meshInfo.nextIndex++

      if (meshInfo.rotate180) {
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

  releaseAllInstances() {
    for (let code of MESHES_ORDER) {
      const meshInfo = this.meshInfos[code]
      for (let i = meshInfo.startIndex; i < meshInfo.nextIndex; i++) {
        instanced.setScaleAt(meshInfo.instancedMesh, i, 0, 0, 0)
      }
      meshInfo.nextIndex = meshInfo.startIndex
    }
  },

  setupHumanPicking(side) {
    const playerInfo = this.state.playerInfo[side]
    if (!playerInfo.networkClientId || playerInfo.networkClientId === nafHelper.getClientId()) {
      this.setupPicking(side)
    } else {
      this.setupPicking("none")
    }
  },

  setupPicking(side) {
    const state = this.state

    if (side === state.pickingSide) {
      return
    }

    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el
    const layout = state.fenAST.layout

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.instancedMesh, score: "closestforward", instanceIndex: piece.index})
    const shutdownPiecePicking = piece => grabSystem.unregisterTarget(el, {obj3D: piece.instancedMesh, instanceIndex: piece.index})

    if (state.pickingSide !== "none") {
      // Note, ok to shutdown, even if we were never setup
      state.fenAST.capturedPieces.forEach(shutdownPiecePicking)
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

    state.pickingSide = side
  },

  setupBoard(fenAST) {
    if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshInfos[code].instancedMesh) ) {
      return
    }

    const groundY = this.board.bounds.max.y

    for (let piece of fenAST.layout) {
      const xz = this.xzFromFileRank(this.board.bounds, piece.file, piece.rank)

      if (!piece.instancedMesh) {
        this.setupInstanceForPiece(piece)
      }

      instanced.setPositionAt(piece.instancedMesh, piece.index, xz.x, groundY, xz.z)
    }

    if (fenAST.capturedPieces) {
      for (let i = 0; i < fenAST.capturedPieces.length; i++) {
        const piece = fenAST.capturedPieces[i]
        const offBoard = this.fileRankFromCaptured(i)
        const xz = this.xzFromFileRank(this.board.bounds, offBoard.file, offBoard.rank)

        if (!piece.instancedMesh) {
          this.setupInstanceForPiece(piece)
        }

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

  actionsTick(dt, speed) {
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

    } else if (state.actions.length > 0) {
      const action = state.actions[0]
      const bounds = this.board.bounds

      switch (action.type) {
        case "move": {
          const piece = action.piece
          const moveMover = this.createMover(bounds, piece, action.fromFile, action.fromRank, action.toFile, action.toRank, speed)
          state.movers.push( moveMover )
          break
        } 
        case "capture": {
          const capturedPiece = action.capturedPiece
          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const captureMover = this.createMover(bounds, capturedPiece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, speed)
          state.movers.push(captureMover)
          break
        }
        case "promote": {
          const newPiece = action.newPiece

          this.setupInstanceForPiece(newPiece)

          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const promoteMover = this.createMover(bounds, newPiece, newPiece.file, newPiece.rank, newPiece.file, newPiece.rank, speed)
          const pawnMover = this.createMover(bounds, action.piece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, speed)
          state.movers.push(promoteMover, pawnMover)
          break
        }
        case "castle": {
          const king = action.king
          const rook = action.rook
          const kingMover = this.createMover(bounds, king, 5, king.rank, action.kingside ? 7 : 3, king.rank, speed)
          const rookMover = this.createMover(bounds, rook, action.kingside ? 8 : 1, rook.rank, action.kingside ? 6 : 4, rook.rank, speed)
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

    if (state.delay <= 0 && state.movers.length === 0 && state.actions.length === 0 && this.pgnAST && this.pgnAST.moves[state.replayIndex]) {
      state.actions = chessHelper.applyMove(state.fenAST, this.pgnAST.moves[state.replayIndex]) 
      state.delay = state.actions ? this.data.replayTurnDuration : 0

      const move = this.pgnAST.moves[state.replayIndex]
      const firstAction = state.actions[0]
      if (firstAction.type === "move") { 
        move.fromFile = firstAction.fromFile
        move.fromRank = firstAction.fromRank
      } else if (firstAction.type === "castle") {
        move.fromFile = 5
        move.fromRank = firstAction.king.rank
      }
      state.replayIndex++

      this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: chessHelper.coordToString(move), nextReplayIndex: state.replayIndex })
    }
  },

  aiTick() {
    const state = this.state
    const data = this.data

    if (state.movers.length === 0 && state.actions.length === 0 && this.garbochess && state.nextAIMove) {
      const move = chessHelper.decodeCoordMove(state.fenAST, state.nextAIMove)
      if (data.debug) {
        console.log("AI", move.code === move.code.toLowerCase() ? "black" : "white", state.nextAIMove, chessHelper.sanToString(move))
      }

      state.actions = chessHelper.applyMove(state.fenAST, move)  
      state.nextAIMove = ""
      this.nextTurn()

      this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: chessHelper.coordToString(move), nextReplayIndex: 0 })
    }
  },

  grabTick() {
    this.state.grabMap.forEach((grabInfo, piece) => {
      instanced.applyOffsetMatrix(grabInfo.hand.object3D, piece.instancedMesh, piece.index, grabInfo.offsetMatrix)
    })
  },

  humanTick() {
    const data = this.data
    const state = this.state

    if (state.nextHumanMove) {
      const move = chessHelper.decodeCoordMove(state.fenAST, state.nextHumanMove)
      if (data.debug) {
        console.log("HU", move.code === move.code.toLowerCase() ? "black" : "white", state.nextHumanMove, chessHelper.sanToString(move))
      }

      // state.actions = chessHelper.applyMove(state.fenAST, move)
      chessHelper.applyMove(state.fenAST, move)
      this.setupBoard(state.fenAST) // snap pieces
      state.nextHumanMove = ""
      this.nextTurn()

      this.system.broadcastNetworkData(this, { command: "move", nextPlayer: state.currentPlayer, moveStr: chessHelper.coordToString(move), nextReplayIndex: 0 })

    }
  },

  // speed is in tiles per second
  // tick() returns true when the mover is complete
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
      const state = this.state

      // perform this fetch and blob creation to work around same-origin policy
      // this.garbochess = new Worker(this.data.aiWorker)
      fetch(this.data.aiWorker).then(response => {
        if (!response.ok) {
          throw Error(`problem with file "${this.data.aiWorker}"`)
        }
        return response.text()
      }).then(text => {
        const workerSrc = new Blob([text], {type: 'text/javascript'})
        const workerUrl = window.URL.createObjectURL(workerSrc)
        this.garbochess = new Worker(workerUrl)

        this.garbochess.onerror = (event) => {
          throw Error(`problem with worker "${this.data.aiWorker} - ${event.message}"`)
        }
  
        this.garbochess.onmessage = (event) => {
          if (this.data.debug) {
            console.log(event.data)
          }
    
          if (event.data.startsWith("pv")) {
          } else if (event.data.startsWith("message")) {
  
          } else if (event.data.startsWith("invalid")) {
            if (state.playerInfo[state.currentPlayer].networkClientId) {
              this.system.sendNetworkData(this, { command: "invalidMove" }, state.playerInfo[state.currentPlayer].networkClientId)
            }
            this.setupBoard(this.state.fenAST) // reset invalidly moved pieces
  
          } else if (event.data.startsWith("valid")) {
            const commands = event.data.split(" ")
            state.nextHumanMove = commands[1]
          } else if (event.data.startsWith("options")) {
  
          } else {
            state.nextAIMove = event.data
          }
        }

        this.setupMode(this.pendingMode)
      })
    }
  },

  onObject3dSet(event) {
    const data = this.data
    this.chess3D = event.detail.object
    this.createChessSet(this.chess3D)
    this.setupMode(this.pendingMode)
  },

  onHoverStart(event) {
    const instancedMesh = event.detail.obj3D

    if (Object.keys(this.meshInfos).find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const index = event.detail.instanceIndex
      instanced.setColorAt(instancedMesh, index, this.highlightColor)
    }
  },

  onHoverEnd(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const state = this.state
      const index = event.detail.instanceIndex

      // the piece were were hovering over may have been captured, so check the captured list as well
      const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index) || 
        state.fenAST.capturedPieces.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)

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
      const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
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

      this.system.broadcastNetworkData(this, { command: "setHuman", player: state.currentPlayer, networkClientId: nafHelper.getClientId() })
    }
  },

  onGrabEnd(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const state = this.state
      const hand = event.detail.hand
      const index = event.detail.instanceIndex
      const piece = state.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const grabInfo = state.grabMap.get(piece)

      // TODO freestyle can be placed anywhere, but game must be on the board, or be reset to it's original position
      if (grabInfo && grabInfo.hand === hand) {
        const piecePosition = instanced.getPositionAt(instancedMesh, index)
        if (piecePosition.y < this.gameBounds.max.y) {
          const destination = this.snapToBoard(piece, piecePosition)

          // TODO handle promotion
          if (state.localMode === "game" || state.localMode === "network") {
            const humanMove = chessHelper.fileRankToCoord(piece.file, piece.rank) + chessHelper.fileRankToCoord(destination.file, destination.rank)

            // Note, this move may be invalid
            if (nafHelper.isMine(this)) {
              this.garbochess.postMessage(humanMove)
            } else {
              state.pendingLocalMove = humanMove
              this.system.broadcastNetworkData(this, { command: "possibleMove", player: state.currentPlayer, moveStr: humanMove })
            }
          }
        }

        instanced.setQuaternionAt( instancedMesh, index, grabInfo.startQuaternion )
        state.grabMap.delete(piece)
      }
    }
  },

  onReset() {
    if (nafHelper.isMine(this)) {
      this.resetGame(this.state.globalMode)
    }
  },

  // Networking
  getSetupPacket() {
    const state = this.state
    return {
      command: "setup",
      fen: chessHelper.fenToString( state.fenAST ),
      captureStr: state.fenAST.capturedPieces.map(piece => piece.code).join(""),
      playerInfo: state.playerInfo,
      globalMode: state.globalMode,
      replayIndex: state.replayIndex,
    }
  },

  requestSync(senderId) {
    this.system.sendNetworkData(this, this.getSetupPacket(), senderId)
  },

  receiveNetworkData(packet, senderId) {
    const state = this.state
    const owner = NAF.utils.getNetworkOwner(this.el)
    const fromOwner = senderId === owner

    if (this.state.waitingForSetup && packet.command !== "setup") {
      return // ignore all non-setup packets until we are setup
    }

    switch (packet.command) {
      case "setup":
        if (fromOwner) {
          state.waitingForSetup = false

          state.fenAST = this.parseFEN( packet.fen )
          state.fenAST.capturedPieces = packet.captureStr.split("").map( code => ({code, file: -1, rank: -1}) )
          state.playerInfo = packet.playerInfo
          state.globalMode = packet.globalMode
          state.replayIndex = packet.replayIndex

          this.releaseAllInstances()
          this.setupMode("network")
        }
        break

      case "move":
        if (fromOwner) {
          const newActions = chessHelper.applyMove( state.fenAST, chessHelper.decodeCoordMove(state.fenAST, packet.moveStr) )

          if (state.pendingLocalMove === packet.moveStr) {
            this.setupBoard(this.state.fenAST) // matches the local move we made, so just snap the board
          } else {
            state.actions.push(...newActions) // a move from someone else so use actions to change the board
          }
          state.pendingLocalMove = ""
          state.replayIndex = packet.nextReplayIndex
          this.setCurrentPlayer( packet.nextPlayer )
        }
        break

      case "possibleMove":
        if (nafHelper.isMine(this)) {
          this.garbochess.postMessage(packet.moveStr)
        }
        break

      case "invalidMove":
        if (fromOwner) {
          this.setupBoard(this.state.fenAST)
        }
        break

      case "setHuman":
        const playerInfo = this.state.playerInfo[packet.player]
        playerInfo.networkClientId = packet.networkClientId

        // if another client has started picking, then we should lose our
        // ability to pick
        // OR if the picking client has left, then we could start picking
        if (state.currentPlayer === packet.player) {
          this.setupHumanPicking(packet.player)
        }
        break
    }
  },

  onClientDisconnected(event) {
    const clientId = event.detail.clientId
    const owner = NAF.utils.getNetworkOwner(this.el)

    
    if (this.data.debug) {
      console.log("onClientDisconnected client:", clientId, "me:", NAF.clientId, "owner:", NAF.utils.getNetworkOwner(this.el))
    }

    if (owner === NAF.clientId || owner == clientId) {
      const state = this.state

      for (let player in state.playerInfo) {
        const networkClientId = state.playerInfo[player].networkClientId

        if (networkClientId == clientId) {
          state.playerInfo[player].networkClientId = ""
          if (state.currentPlayer === player) {
            this.setupHumanPicking(player)
          }
            
          this.system.broadcastNetworkData(this, { command: "setHuman", player: player, networkClientId: "" })
        }
      }
    }
  },

  onOwnershipGained() {
    if (this.data.debug) {
      console.log("ownership-gained")
    }
    const state = this.state
    this.system.broadcastNetworkData(this, this.getSetupPacket())
    this.setupMode(state.globalMode)
    state.waitingForSetup = false
  },

  onOwnershipLost() {
    if (this.data.debug) {
      console.log("ownership-lost")
    }
    this.setupMode("network")
    this.state.waitingForSetup = true
  },
})

