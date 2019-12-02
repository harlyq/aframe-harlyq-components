import { aframeHelper, chessHelper, threeHelper } from "harlyq-helpers"

const MESHES_ORDER = "rnbqkpRNBQKP".split("")
const NUM_RANKS = 8
const NUM_FILES = 8
const MOVE_REGEX_STR = "([0-9]+\\.|[0-9]+\\.\\.\\.)\\s*([a-hRNBKQO][a-hRNBKQO\\-\\+\\#1-8x]+)\\s*([a-hRNBKQO][a-hRNBKQO\\-\\+\\#1-8x]+)?\\s*(1\\-0|0\\-1|1\\/2\\-1\\/2|\\*)?"
const MOVE_REGEX = new RegExp(MOVE_REGEX_STR)
const PGN_REGEX = new RegExp(MOVE_REGEX_STR, 'g')
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

    this.board = { name: data.boardMesh.trim(), board3D: undefined, bounds: new THREE.Box3(), up: new THREE.Vector3(0,1,0), layout: [] }
    this.board.layout = this.parseFEN(data.fen, this.meshes)
    this.parsePGN(data.pgn)

    this.blackMaterial = data.blackColor ? new THREE.MeshStandardMaterial({color: data.blackColor}) : undefined
    this.whiteMaterial = data.whiteColor ? new THREE.MeshStandardMaterial({color: data.whiteColor}) : undefined
  },

  tick() {
    this.grabMap.forEach((grabInfo, piece3D) => {
      threeHelper.applyOffsetMatrix(grabInfo.hand.object3D, piece3D, grabInfo.offsetMatrix)
    })
  },

  parseFEN(fen) {
    const layout = []
    const chunks = fen.split(" ")
    const rankChunks = chunks[0].split("/")
    const self = this

    if (rankChunks.length !== NUM_RANKS) {
      aframeHelper.error(this, `malformed fen, expected ${NUM_RANKS} '/' separated ranks, but only found ${rankChunks.length}`)
      return layout
    }

    function appendRank(layout, rank, rankChunk) {
      let file = 1
      for (let i = 0; i < rankChunk.length; i++) {
        const c = rankChunk[i]
        if (MESHES_ORDER.includes(c)) {
          layout.push( { code: c, san: c.toUpperCase(), isBlack: c === c.toLowerCase(), file, rank, piece3D: undefined } )
          // layout.push( { code: c, coord: "a1", piece3D: undefined } )
          file++
        } else if (Number(c) == c) {
          file += Number(c)
        } else {
          aframeHelper.error(self, `unknown letter "${c}" in fen rank "${rankChunk}"`)
        }
      }

      if (file - 1 !== NUM_FILES) {
        aframeHelper.error(self, `missing fileumn values in fen rank "${rankChunk}", found ${file}, expecting ${NUM_FILES}`)
      }
    }

    for (let i = 0; i < rankChunks.length; i++) {
      const rankChunk = rankChunks[i]
      appendRank(layout, 8 - i, rankChunk) // chunks start with the 8th rank
    }

    return layout
  },

  parsePGN(pgn) {
    if (!pgn) {
      return
    }

    const url = pgn.match(URL_REGEX)
    if (url) {
      fetch(url[1])
        .then(response => response.ok ? response.text() : aframeHelper.error(this, `file: "${url[1]}" ${response.statusText}`))
        .then(text => this.parsePGN(text))
    } else {
      this.replay = pgn.match(PGN_REGEX)
      this.startReplay()
    }
  },

  startReplay() {
    this.replayIndex = 0
    this.replayPlayer = this.replay && this.replay[0] && this.replay[0].includes("...") ? "black" : "white"
    this.capturedBlack = []
    this.capturedWhite = []
  },

  replayMove() {
    if (!this.replay || this.replayIndex >= this.replay.length) {
      return
    }
    
    const moveStr = this.replay[this.replayIndex]
    const moveParts = moveStr.match(MOVE_REGEX)
    const move = this.replayPlayer === "white" ? moveParts[1] : moveParts[2]
  },

  createChessSet(chess3D) {
    const rotation180Quaternion = new THREE.Quaternion()
    const self = this

    this.gameBounds.setFromObject(chess3D)

    const board3D = chess3D.getObjectByName(this.board.name)
    if (!board3D) {
      aframeHelper.error(this, `unable to find board mesh '${this.board.name}'`)
    } else {
      this.board.board3D = board3D
      this.board.bounds.setFromObject(board3D)
      rotation180Quaternion.setFromAxisAngle(this.board.up, Math.PI)
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

    for (let piece of this.board.layout) {
      const mesh = this.meshes[piece.code]
      const mesh3D = mesh.mesh3D

      if (mesh3D) {
        const piece3D = mesh3D.clone()
        piece3D.visible = true
        if (this.blackMaterial && piece.isBlack) {
          piece3D.material = this.blackMaterial
        } else if (this.whiteMaterial && !piece.isBlack) {
          piece3D.material = this.whiteMaterial
        }

        if (mesh.rotate180) {
          piece3D.quaternion.premultiply(rotation180Quaternion)
        }

        chess3D.add(piece3D)
        piece.piece3D = piece3D
      }
    }
  },

  setupPicking() {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.piece3D, score: "closestforward"})

    this.board.layout.forEach(setupPiecePicking)
  },

  setupBoard(chess3D) {
    if ( !this.board.board3D || MESHES_ORDER.some(code => !this.meshes[code].mesh3D) ) {
      return
    }

    const groundY = this.board.bounds.max.y
    const invParentMatrix = new THREE.Matrix4().getInverse(chess3D.matrixWorld)

    for (let piece of this.board.layout) {
      const xz = this.xzFromFileRank(this.board.bounds, piece.file, piece.rank)
      piece.piece3D.position.set(xz.x, groundY, xz.z).applyMatrix4(invParentMatrix)
    }
  },

  // 1,1 => bottom left
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

