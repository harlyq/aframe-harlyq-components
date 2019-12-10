import { aframeHelper, chessHelper, instanced, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const CAPTURED_SIZE = 10
const URL_REGEX = /url\((.*)\)/
const toLowerCase = (str) => str.toLowerCase()

// /** @type {(componentName: string) => {
//  *  isEntityNetworked: (el: Element) => boolean,
//  *  registerNetworkedComponent: (component: any) => void,
//  *  unregisterNetworkedComponent: (component: any) => void,
//  *  sendNetworkData: (component: any, name: string, data: any, targetId?: number) => void,
//  *  isOwner: (component: any) => boolean, 
//  *  takeOwnership: (component: any) => void,
//  *  setupNetwork: () => void,
//  *  shutdownNetwork: () => void,
//  *  onInstantiated: (event: Event) => void,
//  * }} */
function simpleNetworkSystem(componentName) {

  return {
    isEntityNetworked(el) {
      /** @type {any} */
      let curEntity = el
    
      if (typeof NAF === "object") {
        while (curEntity && curEntity.components && !curEntity.components.networked) {
          curEntity = curEntity.parentNode
        }
      
        if (curEntity && curEntity.components && curEntity.components.networked) {
          return true
        }
      }
    
      return false
    },
      
    registerNetworkedComponent(component) {
      if (typeof component.receiveNetworkData !== "function") {
        throw Error(`missing receiveNetworkData(name, packet, senderId)`)
      }   

      if (typeof NAF === "object" && this.isEntityNetworked(component.el)) {
        component.el.addEventListener("instantiated", this.onInstantiated) // from "networked" component, once it is setup
      }
    },
  
    unregisterNetworkedComponent(component) {
      component.el.removeEventListener("instantiated", this.onInstantiated) // does nothing if it was never added
  
      for (let key in this.networkComponents) {
        if (this.networkComponents[key] === component) {
          delete this.networkComponents[key]
          break
        }
      }
    },

    ownerSendNetworkData(component, name, data, targetId = undefined) {
      if (this.isOwner(component)) {
        this.sendNetworkData(component, name, data, targetId)
      }
    },
  
    sendNetworkData(component, name, data, targetId = undefined) {
      if (this.isEntityNetworked(component.el)) {
        const packet = {
          name,
          networkId: NAF.utils.getNetworkId(component.el),
          data
        }
        
        if (targetId) {
          NAF.connection.sendDataGuaranteed(targetId, componentName, packet)
        } else {
          NAF.connection.broadcastData(componentName, packet)
        }
      }
    },
  
    isOwner(component) {
      return this.isEntityNetworked(component.el) ? NAF.utils.isMine(component.el) : true
    },

    takeOwnership(component) {
      if (!this.isOwner(component)) {
        NAF.utils.takeOwnership(component.el)
      }
    },
  
    setupNetwork() {
      this.networkComponents = new Map() // map by networkId
      this.onInstantiated = this.onInstantiated.bind(this)
  
      if (typeof NAF !== "object") {
        return
      }
  
      NAF.connection.subscribeToDataChannel(componentName, (senderId, type, packet, targetId) => {
        const component = this.networkComponents[packet.networkId]
        if (component) {
          component.receiveNetworkData(packet.name, packet.data, senderId)
        }
      })
    },
  
    shutdownNetwork() {
      if (typeof NAF !== "object") {
        return
      }
  
      NAF.connection.unsubscribeToDataChannel(componentName)
    },
  
    onInstantiated(event) {
      const el = event.detail.el
      const networkId = NAF.utils.getNetworkId(el)
      const component = el.components[componentName]
      this.networkComponents[networkId] = component
  
      if (!NAF.utils.isMine(el)) {
        this.sendNetworkData(component, "newclient", undefined)
      }
    },
  }
}

AFRAME.registerSystem("chess", {

  ...simpleNetworkSystem("chess"),

  init() {
    // @ts-ignore
    this.setupNetwork()
  },

  remove() {
    // @ts-ignore
    this.shutdownNetwork()
  },
})


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
    mode: { oneOf: ["freestyle", "replay", "static", "game", "network"], default: "freestyle", parse: toLowerCase },
    aiDuration: { default: 1 },
    whitePlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
    blackPlayer: { oneOf: ["human", "ai"], default: "ai", parse: toLowerCase },
    maxCountPerPiece: { default: 8 },
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
      actions: [],
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
    this.pendingMode = ""

    this.system.registerNetworkedComponent(this)
  },

  remove() {
    this.system.unregisterNetworkedComponent(this)

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

    this.playerType["white"] = data.whitePlayer !== "human" ? "ai" : "human"
    this.playerType["black"] = data.blackPlayer !== "human" ? "ai" : "human"

    if (data.mode !== oldData.mode) {
      this.setupMode(data.mode)
    }
  },

  tick(time, deltaTime) {
    const dt = Math.min(0.1, deltaTime/1000)
    const data = this.data
    const state = this.state

    switch (this.state.currentMode) {
      case "freestyle":
        this.freestyleTick()
        break
      case "replay":
        this.actionsTick(dt, data.boardMoveSpeed)
        this.replayTick()
        break
      case "game":
        this.actionsTick(dt, data.boardMoveSpeed)
        if (this.playerType[this.state.currentPlayer] === "ai") {
          this.aiTick()
        } else {
          this.humanTick()
        }
        break
      case "network":
        this.actionsTick(dt, state.actions.length < 4 ? data.boardMoveSpeed : data.boardMoveSpeed*4)
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
      return this.pgnAST
    }
  },

  setupMode(mode) {
    if (!this.chess3D) {
      this.pendingMode = mode
      return
    }

    const state = this.state
    let fenStr = this.pgnAST && this.pgnAST["FEN"] ? this.pgnAST["FEN"] : this.data.fen
    fenStr = fenStr || chessHelper.FEN_DEFAULT

    state.actions.length = 0
    state.grabMap.clear()
    state.movers.length = 0
    state.nextAIMove = ""
    state.nextHumanMove = ""
    state.delay = 0
    state.replayIndex = 0
    state.currentMode = mode

    switch (mode) {
      case "replay":
        state.fenAST = this.parseFEN( fenStr )
        break

      case "game":
        state.fenAST = this.parseFEN( fenStr )
        this.setupGameWorker()
        this.garbochess.postMessage("position " + chessHelper.fenToString(state.fenAST))
        break

      case "freestyle":
        state.fenAST = this.parseFEN( fenStr )
        break

      case "network":
        break
    }

    this.releaseAllInstances()
    this.setupBoard(state.fenAST)

    // picking must be after the setupBoard()
    if (mode === "freestyle") {
      this.setupPicking("all")
    } else if (mode === "game") {
      this.setCurrentPlayer(state.fenAST.player)
    }
  },

  createChessSet(chess3D) { //}, fenAST) {
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

  setupPicking(side) {
    if (side === this.pickingSide) {
      return
    }

    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el
    const state = this.state
    const layout = state.fenAST.layout

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.instancedMesh, score: "closestforward", instanceIndex: piece.index})
    const shutdownPiecePicking = piece => grabSystem.unregisterTarget(el, {obj3D: piece.instancedMesh, instanceIndex: piece.index})

    if (this.pickingSide !== "none") {
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

    this.pickingSide = side
  },

  setupBoard(fenAST) {
    if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshInfos[code].instancedMesh) ) {
      return
    }

    const state = this.state
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
      const moveStr = chessHelper.fileRankToCoord(move.fromFile, move.fromRank) + chessHelper.fileRankToCoord(move.toFile, move.toRank) + move.promote

      this.system.ownerSendNetworkData(this, "move", moveStr)

      state.replayIndex++
    }
  },

  aiTick() {
    const state = this.state
    const data = this.data

    if (state.movers.length === 0 && state.actions.length === 0 && this.garbochess && this.nextAIMove) {
      const move = chessHelper.decodeCoordMove(state.fenAST, this.nextAIMove)
      if (data.debug) {
        console.log("AI", move.code === move.code.toLowerCase() ? "black" : "white", this.nextAIMove, chessHelper.sanToString(move))
      }

      this.state.actions = chessHelper.applyMove(state.fenAST, move)  
      this.nextAIMove = ""
      this.nextTurn()

      this.system.ownerSendNetworkData(this, "move", move)
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
      const state = this.state
      const move = chessHelper.decodeCoordMove(state.fenAST, this.nextHumanMove)
      if (data.debug) {
        console.log("HU", move.code === move.code.toLowerCase() ? "black" : "white", this.nextHumanMove, chessHelper.sanToString(move))
      }

      // this.state.actions = chessHelper.applyMove(state.fenAST, move)
      chessHelper.applyMove(state.fenAST, move)
      this.setupBoard(state.fenAST) // snap pieces
      this.nextHumanMove = ""
      this.nextTurn()

      this.system.ownerSendNetworkData(this, "move", move)
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
      this.garbochess = new Worker("garbochess.js")
      this.garbochess.onmessage = (event) => {
        if (this.data.debug) {
          console.log(event.data)
        }
  
        if (event.data.startsWith("pv")) {
        } else if (event.data.startsWith("message")) {

        } else if (event.data.startsWith("invalid")) {
          this.setupBoard(this.state.fenAST) // reset invalidly moved pieces
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

  receiveNetworkData(name, packet, senderId) {
    const state = this.state

    switch (name) {
      case "newclient":
        this.system.ownerSendNetworkData(this, "setup", {
          fen: chessHelper.fenToString( state.fenAST ),
          captureStr: state.fenAST.capturedPieces.map(piece => piece.code).join("")
        }, senderId)
        break

      case "setup":
        state.fenAST = this.parseFEN( packet.fen )
        state.fenAST.capturedPieces = packet.captureStr.split("").map( code => ({code, file: -1, rank: -1}) )
        this.setupMode("network")
        break

      case "move":
        const newActions = chessHelper.applyMove( state.fenAST, chessHelper.decodeCoordMove(state.fenAST, packet) )
        state.actions.push(...newActions)
        break
    }
  },

  onObject3dSet(event) {
    const data = this.data
    this.chess3D = event.detail.object
    this.createChessSet(this.chess3D) //, this.state.fenAST)
    this.setupMode(this.pendingMode)
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
    if (this.system.isOwner()) {
      this.setupMode(this.data.mode)
    }
  }
})

