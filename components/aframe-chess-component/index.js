import { aframeHelper, chessHelper, instanced, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const CAPTURED_SIZE = 10
const URL_REGEX = /url\((.*)\)/
const EXTRA_PIECES_FOR_PROMOTION = 4

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
    mode: { oneOf: ["physical", "replay", "static", "ai"], default: "physical" },
    aiDuration: { default: 1 }
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

    this.chessMaterial = new THREE.MeshStandardMaterial()
    this.blackColor = new THREE.Color(1,0,0)
    this.whiteColor = new THREE.Color(1,1,1)
    this.grabMap = new Map() // grabInfo indexed by piece3D
    this.gameBounds = new THREE.Box3()
    this.fenAST = { layout: [] }
    this.pgnAST = undefined
    this.rotate180Quaternion = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3(0,1,0), Math.PI)
    this.board = {
      name: "",
      board3D: undefined,
      bounds: new THREE.Box3(),
      actions: undefined,
      movers: [],
      delay: 0
    }
    this.replay = {
      moveIndex: 0
    }
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

    this.meshInfos = this.parseMeshes(data.meshes)
    this.board.name = data.boardMesh.trim()
    this.fenAST = this.parseFEN(data.fen)
    this.pgnAST = this.parsePGN(data.pgn)

    if (data.blackColor) this.blackColor.set(data.blackColor)
    if (data.whiteColor) this.whiteColor.set(data.whiteColor)
  },

  tick(time, deltaTime) {
    const data = this.data
    const dt = Math.min(0.1, deltaTime/1000)

    if (data.mode === "physical") {
      this.grabMap.forEach((grabInfo, piece) => {
        instanced.applyOffsetMatrix(grabInfo.hand.object3D, piece.instancedMesh, piece.index, grabInfo.offsetMatrix)
      })

    } else if (data.mode === "replay") {
      this.boardTick(dt)
      this.replayTick()
    } else if (data.mode === "ai") {
      this.boardTick(dt)
      this.aiTick()
    }
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
      this.startReplay()
      return this.pgnAST
    }
  },

  startReplay() {
    const replay = this.replay
    replay.moveIndex = 0
    replay.actions = undefined
    replay.movers = []
    replay.delay = 0
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
      const {instancedMesh, index} = this.getInstanceForPiece(piece)
      piece.instancedMesh = instancedMesh
      piece.index = index
    }
  },

  getInstanceForPiece(piece) {
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

      return {index, instancedMesh}
    }
  },

  setupPicking() {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.instancedMesh, score: "closestforward", instanceIndex: piece.index})

    this.fenAST.layout.forEach(setupPiecePicking)
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
    const fileRank = this.fileRankFromXZ(this.board.bounds, piecePosition.x, piecePosition.z)
    if (fileRank) {
      const pos = this.xzFromFileRank(this.board.bounds, fileRank.file, fileRank.rank)
      const groundY = this.board.bounds.max.y
      instanced.setPositionAt(piece.instancedMesh, piece.index, pos.x, groundY, pos.z)
    }
  },

  boardTick(dt) {
    const data = this.data
    const board = this.board

    board.delay -= dt

    if (board.movers.length > 0) {

      if (board.movers.length > 0) {
        board.movers.forEach(mover => mover.tick(dt))
        
        if (board.movers.every(mover => mover.isComplete())) {
          board.movers.length = 0
          board.actions.splice(0,1) // move to the next action
        }
      }

    } else if (board.actions && board.actions.length > 0) {
      const action = board.actions[0]
      const bounds = this.board.bounds

      switch (action.type) {
        case "move": {
          const piece = action.piece
          const moveMover = this.createMover(bounds, piece, action.fromFile, action.fromRank, action.toFile, action.toRank, data.boardMoveSpeed)
          board.movers.push( moveMover )
          break
        } 
        case "capture": {
          const capturedPiece = action.capturedPiece
          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const captureMover = this.createMover(bounds, capturedPiece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, data.boardMoveSpeed)
          board.movers.push(captureMover)
          break
        }
        case "promote": {
          const newPiece = action.newPiece

          const {instancedMesh, index} = this.getInstanceForPiece(newPiece)
          newPiece.instancedMesh = instancedMesh
          newPiece.index = index

          const offBoard = this.fileRankFromCaptured(action.capturedIndex)
          const promoteMover = this.createMover(bounds, newPiece, newPiece.file, newPiece.rank, newPiece.file, newPiece.rank, data.boardMoveSpeed)
          const pawnMover = this.createMover(bounds, action.piece, offBoard.file, offBoard.rank, offBoard.file, offBoard.rank, data.boardMoveSpeed)
          board.movers.push(promoteMover, pawnMover)
          break
        }
        case "castle": {
          const king = action.king
          const rook = action.rook
          const kingMover = this.createMover(bounds, king, 5, king.rank, action.kingside ? 7 : 3, king.rank, data.boardMoveSpeed)
          const rookMover = this.createMover(bounds, rook, action.kingside ? 8 : 1, rook.rank, action.kingside ? 6 : 4, rook.rank, data.boardMoveSpeed)
          board.movers.push(kingMover, rookMover)
          break
        }

        default:
          throw Error(`unknown action of type "${action.type}"`)
      }
    }
  },

  replayTick() {
    const board = this.board
    const replay = this.replay

    if (board.delay <= 0 && board.movers.length === 0 && (!board.actions || board.actions.length === 0) && this.pgnAST && this.pgnAST.moves[replay.moveIndex]) {
      board.actions = chessHelper.applyMove(this.fenAST, this.pgnAST.moves[replay.moveIndex++]) 
      board.delay = board.actions ? this.data.replayTurnDuration : 0
    }
  },

  aiTick() {
    const board = this.board
    const data = this.data

    if (board.delay <= 0 && board.movers.length === 0 && (!board.actions || board.actions.length === 0) && this.garbochess && this.nextAIMove) {
      const move = chessHelper.decodeCoordMove(this.fenAST.layout, this.nextAIMove)
      if (data.debug) {
        console.log(move.code === move.code.toLowerCase() ? "black" : "white", this.nextAIMove, chessHelper.sanToString(move))
      }

      this.board.actions = chessHelper.applyMove(this.fenAST, move)  
      this.nextAIMove = ""
      this.garbochess.postMessage("search " + data.aiDuration)
      board.delay = data.aiDuration
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

  setupAI() {
    const garbochess = new Worker("garbochess.js")
    garbochess.onmessage = (event) => {
      if (event.data.startsWith("pv")) {
        //console.log(event.data)
      } else if (event.data.startsWith("message")) {
        console.log(event.data)
      } else {
        this.nextAIMove = event.data
      }
    }

    this.isBlackTurn = false
    garbochess.postMessage("position " + chessHelper.fenToString(this.fenAST))
    garbochess.postMessage("search " + this.data.aiDuration*1000)
    this.garbochess = garbochess
  },

  onObject3dSet(event) {
    const data = this.data
    this.chess3D = event.detail.object
    this.createChessSet(this.chess3D, this.fenAST)

    if (data.mode === "physical") {
      this.setupPicking()
    }

    this.setupBoard()

    if (data.mode === "ai") {
      this.setupAI()
    }

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
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const isBlack = piece.code === piece.code.toLowerCase()
      instanced.setColorAt(instancedMesh, index, isBlack ? this.blackColor : this.whiteColor)
    }
  },

  onGrabStart(event) {
    const instancedMesh = event.detail.obj3D

    if (MESHES_ORDER.find(code => this.meshInfos[code].instancedMesh === instancedMesh)) {
      const hand = event.detail.hand
      const index = event.detail.instanceIndex
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const grabInfo = this.grabMap.get(piece)

      if (grabInfo) {
        // we grab this from another hand, so keep the original quaternion
        grabInfo.offsetMatrix = instanced.calcOffsetMatrix(hand.object3D, instancedMesh, piece.index, grabInfo.offsetMatrix)
        grabInfo.hand = hand
      } else {
        this.grabMap.set(piece, { 
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
      const hand = event.detail.hand
      const index = event.detail.instanceIndex
      const piece = this.fenAST.layout.find(piece => piece.instancedMesh === instancedMesh && piece.index === index)
      const grabInfo = this.grabMap.get(piece)

      if (grabInfo && grabInfo.hand === hand) {
        const piecePosition = instanced.getPositionAt(instancedMesh, index)
        if (piecePosition.y < this.gameBounds.max.y) {
          this.snapToBoard(piece, piecePosition)
        }

        instanced.setQuaternionAt( instancedMesh, index, grabInfo.startQuaternion )
        this.grabMap.delete(piece)
      }
    }
  },
})

