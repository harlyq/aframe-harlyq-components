import { aframeHelper } from "harlyq-helpers"

const WHITE_POSITIONS = "a1,b1,c1,d1,e1,f1,g1,h1,a2,b2,c2,d2,e2,f2,g2,h2".split(",")
const BLACK_POSITIONS = "a8,b8,c8,d8,e8,f8,g8,h8,a7,b7,c7,d7,e7,f7,g7,h7".split(",")
const X_AXIS = {x:1, y:0, z:0}
const Y_AXIS = {x:0, y:1, z:0}
const Z_AXIS = {x:0, y:0, z:1}

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
    this.el.addEventListener("grabrend", this.onGrabEnd)

    this.oldMaterialMap = new Map()
    this.hoverMaterial = new THREE.MeshStandardMaterial ( { color: 0xffff00 } )
    this.whiteMaterial = undefined
    this.blackMaterial = undefined
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3dSet)
    this.el.removeEventListener("hoverstart", this.onHoverStart)
    this.el.removeEventListener("hoverend", this.onHoverEnd)
    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabrend", this.onGrabEnd)
  },

  update() {
    const data = this.data
    this.el.setAttribute("gltf-model", data.src)

    function parsePieces(str, positions, debugStr) {
      const pieces = str.split(",").map((x,i) => ({ index: i, meshName: x.trim(), obj3D: undefined, position: positions[i] }) )

      if (pieces.length < positions.length) {
        aframeHelper.error(this, `not enough ${debugStr}, listed ${pieces.length}, expecting ${positions.length}`)
      }
      
      return pieces
    }

    this.blackPieces = parsePieces(data.blackPieces, WHITE_POSITIONS, "blackPieces")
    this.whitePieces = parsePieces(data.whitePieces, BLACK_POSITIONS, "whitePieces")
    this.board = { meshName: data.boardMesh.trim(), obj3D: undefined, bounds: new THREE.Box3(), up: new THREE.Vector3() }

    this.blackMaterial = data.blackColor ? new THREE.MeshStandardMaterial({color: data.blackColor}) : undefined
    this.whiteMaterial = data.whiteColor ? new THREE.MeshStandardMaterial({color: data.whiteColor}) : undefined
  },

  createChessSet(chess3D) {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    const el = this.el
    const rotation180Quaternion = new THREE.Quaternion()
    const boardSize = new THREE.Vector3()
    const self = this

    const obj3D = chess3D.getObjectByName(this.board.meshName)
    if (!obj3D) {
      aframeHelper.error(this, `unable to find board mesh '${this.board.meshName}'`)
    } else {
      this.board.obj3D = obj3D
      this.board.bounds.setFromObject(obj3D)
      this.board.bounds.getSize(boardSize)
      this.board.up.copy(
        boardSize.x < Math.min(boardSize.y, boardSize.z) ? X_AXIS :
        boardSize.y < Math.min(boardSize.x, boardSize.z) ? Y_AXIS : Z_AXIS
      )
      rotation180Quaternion.setFromAxisAngle(this.board.up, Math.PI)
    }

    function populatePieces(pieces, material, debugStr) {
      for (let piece of pieces) {
        const rotate180 = piece.meshName[piece.meshName.length - 1] === "'"
        const meshName = rotate180 ? piece.meshName.slice(0,-1) : piece.meshName
        const obj3D = chess3D.getObjectByName(meshName)

        if (!obj3D) {
          aframeHelper.error(self, `unable to find ${debugStr} mesh '${meshName}'`)
        } else {
          obj3D.visible = false

          const newObj3D = obj3D.clone()
          newObj3D.visible = true
          if (material) {
            newObj3D.material = material
          }

          if (rotate180) {
            newObj3D.quaternion.premultiply(rotation180Quaternion)
          }

          chess3D.add(newObj3D)
          piece.obj3D = newObj3D

          grabSystem.registerTarget(el, {obj3D:newObj3D, score: "horizontalnearest"})
        }
      }
    }

    populatePieces(this.blackPieces, this.blackMaterial, "blackPieces")
    populatePieces(this.whitePieces, this.whiteMaterial, "whitePieces")

  },

  setupBoard() {
    if (!this.board.obj3D || this.blackPieces.some(piece => !piece.obj3D) || this.whitePieces.some(piece => !piece.obj3D)) {
      return
    }

    const groundY = this.board.bounds.max.y
    for (let piece of this.blackPieces) {
      const xz = this.xzFromPosition(this.board.bounds, piece.position)
      piece.obj3D.position.set(xz.x, groundY, xz.z)
    }

    for (let piece of this.whitePieces) {
      const xz = this.xzFromPosition(this.board.bounds, piece.position)
      piece.obj3D.position.set(xz.x, groundY, xz.z)
    }
  },

  xzFromPosition(bounds, position) {
    const col = position.charCodeAt(0) - 97 // a
    const row = position.charCodeAt(1) - 49 // 1
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    return { x: bounds.min.x + (col + .5)*w/8, z: bounds.min.z + (row + .5)*h/8 }
  },

  positionFromXZ(bounds, x, z) {
    const w = bounds.max.x - bounds.min.x
    const h = bounds.max.z - bounds.min.z
    const col = Math.trunc( 8*( x - bounds.min.x ) / w )
    const row = Math.trunc( 8*( z - bounds.min.z ) / h )
    return String.fromCharCode(col + 97, row + 49)
  },

  onObject3dSet(event) {
    this.createChessSet(event.detail.object)
    this.setupBoard()
  },

  onHoverStart(event) {
    const obj3D = event.detail.obj3D
    if (obj3D) {
      if (!this.oldMaterialMap.has(obj3D)) {
        this.oldMaterialMap.set(obj3D, getMaterial(obj3D))
        setMaterial(obj3D, this.hoverMaterial)
      }
    }
  },

  onHoverEnd(event) {
    const obj3D = event.detail.obj3D
    if (obj3D) {
      if (this.oldMaterialMap.has(obj3D)) {
        setMaterial( obj3D, this.oldMaterialMap.get(obj3D) )
        this.oldMaterialMap.delete(obj3D)
      }
    }
  },

  onGrabStart(event) {

  },

  onGrabEnd(event) {

  },
})

