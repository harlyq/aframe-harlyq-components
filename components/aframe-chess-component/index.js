import { aframeHelper, threeHelper } from "harlyq-helpers"

const WHITE_COORDS = "a1,b1,c1,d1,e1,f1,g1,h1,a2,b2,c2,d2,e2,f2,g2,h2".split(",")
const BLACK_COORDS = "a8,b8,c8,d8,e8,f8,g8,h8,a7,b7,c7,d7,e7,f7,g7,h7".split(",")

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
    whitePieces: { default: "" },
    blackPieces: { default: "" },
    boardMesh: { default: "" },
    blackColor: { type: "color", default: "" },
    whiteColor: { type: "color", default: "" },
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

    function parsePieces(str, coords, debugStr) {
      const pieces = str.split(",").map((x,i) => ({ index: i, meshName: x.trim(), piece3D: undefined, coord: coords[i] }) )

      if (pieces.length < coords.length) {
        aframeHelper.error(this, `not enough ${debugStr}, listed ${pieces.length}, expecting ${coords.length}`)
      }
      
      return pieces
    }

    this.blackPieces = parsePieces(data.blackPieces, WHITE_COORDS, "blackPieces")
    this.whitePieces = parsePieces(data.whitePieces, BLACK_COORDS, "whitePieces")
    this.board = { meshName: data.boardMesh.trim(), board3D: undefined, bounds: new THREE.Box3(), up: new THREE.Vector3(0,1,0) }

    this.blackMaterial = data.blackColor ? new THREE.MeshStandardMaterial({color: data.blackColor}) : undefined
    this.whiteMaterial = data.whiteColor ? new THREE.MeshStandardMaterial({color: data.whiteColor}) : undefined
  },

  tick() {
    this.grabMap.forEach((grabInfo, piece3D) => {
      threeHelper.applyOffsetMatrix(grabInfo.hand.object3D, piece3D, grabInfo.offsetMatrix)
    })
  },

  createChessSet(chess3D) {
    const rotation180Quaternion = new THREE.Quaternion()
    const boardSize = new THREE.Vector3()
    const self = this

    this.gameBounds.setFromObject(chess3D)

    const board3D = chess3D.getObjectByName(this.board.meshName)
    if (!board3D) {
      aframeHelper.error(this, `unable to find board mesh '${this.board.meshName}'`)
    } else {
      this.board.board3D = board3D
      this.board.bounds.setFromObject(board3D)
      this.board.bounds.getSize(boardSize)
      rotation180Quaternion.setFromAxisAngle(this.board.up, Math.PI)
    }

    function populatePieces(pieces, material, debugStr) {
      for (let piece of pieces) {
        const rotate180 = piece.meshName[piece.meshName.length - 1] === "'"
        const meshName = rotate180 ? piece.meshName.slice(0,-1) : piece.meshName
        const piece3D = chess3D.getObjectByName(meshName)

        if (!piece3D) {
          aframeHelper.error(self, `unable to find ${debugStr} mesh '${meshName}'`)
        } else {
          piece3D.visible = false

          const newPiece3D = piece3D.clone()
          newPiece3D.visible = true
          if (material) {
            newPiece3D.material = material
          }

          if (rotate180) {
            newPiece3D.quaternion.premultiply(rotation180Quaternion)
          }

          chess3D.add(newPiece3D)
          piece.piece3D = newPiece3D

          
        }
      }
    }

    populatePieces(this.blackPieces, this.blackMaterial, "blackPieces")
    populatePieces(this.whitePieces, this.whiteMaterial, "whitePieces")
  },

  setupPicking() {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el

    const setupPiecePicking = piece => grabSystem.registerTarget(el, {obj3D: piece.piece3D, score: "closestforward"})

    this.blackPieces.forEach(setupPiecePicking)
    this.whitePieces.forEach(setupPiecePicking)
  },

  setupBoard() {
    if (!this.board.board3D || this.blackPieces.some(piece => !piece.piece3D) || this.whitePieces.some(piece => !piece.piece3D)) {
      return
    }

    const groundY = this.board.bounds.max.y
    for (let piece of this.blackPieces) {
      const xz = this.xzFromCoord(this.board.bounds, piece.coord)
      piece.piece3D.position.set(xz.x, groundY, xz.z)
    }

    for (let piece of this.whitePieces) {
      const xz = this.xzFromCoord(this.board.bounds, piece.coord)
      piece.piece3D.position.set(xz.x, groundY, xz.z)
    }
  },

  xzFromCoord(bounds, coord) {
    const col = coord.charCodeAt(0) - 97 // a
    const row = coord.charCodeAt(1) - 49 // 1
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    return { x: bounds.min.x + (col + .5)*w/8, z: bounds.min.z + (row + .5)*h/8 }
  },

  coordFromXZ(bounds, x, z) {
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    const col = Math.floor( 8*( x - bounds.min.x ) / w )
    const row = Math.floor( 8*( z - bounds.min.z ) / h )
    return col >= 0 && col < 8 && row >= 0 && row < 8 ? String.fromCharCode(col + 97, row + 49) : undefined
  },

  snapToBoard(piece3D) {
    const coord = this.coordFromXZ(this.board.bounds, piece3D.position.x, piece3D.position.z)
    if (coord) {
      const pos = this.xzFromCoord(this.board.bounds, coord)
      const groundY = this.board.bounds.max.y
      piece3D.position.set(pos.x, groundY, pos.z)
    }
  },

  onObject3dSet(event) {
    this.createChessSet(event.detail.object)
    this.setupPicking()
    this.setupBoard()
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

