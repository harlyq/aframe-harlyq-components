import { domHelper, intersection, slidingHelper } from "harlyq-helpers"

const VERTS_PER_TILE = 6

AFRAME.registerComponent("sliding-puzzle", {
  schema: {
    rows: { default: 4, },
    cols: { default: 4, },
    hands: { type: "selectorAll", default: "[tracked-controls],[hand-controls],[vive-controls],[oculus-touch-controls],[windows-motion-controls]" },
    grabEvent: { default: "triggerdown" },
    releaseEvent: { default: "triggerup" },
    startOffset: { type: "vec3" },
    endOffset: { type: "vec3", default: {x:0, y:0, z:-.3} },
    snapRatio: { default: .2 },
    hoverOffset: { default: .01 },
    debug: { default: false, }
  },

  init() {
    this.onGrab = this.onGrab.bind(this)
    this.onRelease = this.onRelease.bind(this)

    this.interpolators = []
    this.grabHands = []
    this.hoverTiles = []
    this.mesh = undefined
    this.puzzle = undefined
  },

  remove() {
  },

  update(oldData) {
    const data = this.data

    const checkerBoard = this.createCheckerBoardTexture(data.rows, data.cols)
    this.mesh = this.createMesh(data.rows, data.cols)
    this.mesh.material.map = checkerBoard
    this.el.setObject3D("mesh", this.mesh)

    this.setupTiles(data.rows, data.cols)

    if (data.debug) {
      console.log("found", data.hands.length, "hands")
    }

    this.addListeners()
    this.grabHands.length = 0

    this.shuffle()
  },

  tick(_, deltaTime) {
    const dt = Math.min(100, deltaTime)/1000

    if (this.grabHands.some(grab => grab.tile)) {
      this.tickGrabbing()
    } else {
      this.tickHovering()
    }
    // this.tickMoving(dt)
  },

  getIntersection: (function () {
    const start = new THREE.Vector3()
    const end = new THREE.Vector3()
    const invWorldMatrix = new THREE.Matrix4()
    const normal = new THREE.Vector3(0,0,1)

    return function getIntersection(localPoint, hand, treatAsRay) {
      const data = this.data
      invWorldMatrix.getInverse(this.el.object3D.matrixWorld)
  
      start.copy(data.startOffset)
      start.applyMatrix4(hand.object3D.matrixWorld).applyMatrix4(invWorldMatrix)
      end.copy(data.endOffset)
      end.applyMatrix4(hand.object3D.matrixWorld).applyMatrix4(invWorldMatrix)
      const t = intersection.lineAndPlane(start, end, normal, 0)
      if (typeof t === "undefined" || t < 0 || (!treatAsRay && t > 1)) {
        return undefined
      }
  
      localPoint.subVectors(end, start).multiplyScalar(t).add(start)
      return localPoint
    }
  })(),

  tickHovering: (function () {
    const localPoint = new THREE.Vector3()

    return function tickHovering() {
      this.hoverTiles.length = 0
      
      for (let hand of this.data.hands) {
        if (this.getIntersection(localPoint, hand, false)) {
          const newHoverTile = this.findTileByLocalPos(localPoint)
          if (newHoverTile) {
            this.hoverTiles.push(newHoverTile)
          }
        }
      }
  
      this.drawAllTiles()
    }
  })(),

  tickGrabbing: (function() {
    const localPoint = new THREE.Vector3()

    return function tickGrabbing() {
      const data = this.data
  
      for (let grab of this.grabHands) {
        if (!grab.tile || !grab.row || !grab.col) {
          continue
        }
  
        if (this.getIntersection(localPoint, grab.hand, true)) {
          const row = this.rowFromY(localPoint.y)
          const col = this.colFromX(localPoint.x)
          this.dragTile(grab.tile, this.testSnap(row - grab.row, data.snapRatio), this.testSnap(col - grab.col, data.snapRatio))
        }
      }
    }
  })(),

  testSnap(x, snap) {
    if (Math.abs(x) < snap) {
      return 0
    } else if (Math.abs(1 - x) < snap) {
      return 1
    } else if (Math.abs(-1 - x) < snap) {
      return -1
    } else {
      return x
    }
  },

  setupTiles(numRows, numCols) {
    this.puzzle = slidingHelper.create(numRows, numCols)

    this.drawAllTiles()
  },

  shuffle() {
    slidingHelper.shuffle(this.puzzle)

    this.drawAllTiles()
  },

  rowFromY(y) {
    return (.5 - y)*this.data.rows
  },

  colFromX(x) {
    return (.5 + x)*this.data.cols
  },

  yFromRow(row) {
    return .5 - row/this.data.rows
  },

  xFromCol(col) {
    return col/this.data.cols - .5
  },

  rowColFromHand(hand) {

  },

  rowColFromWorldPos: (function () {
    const invWorldMatrix = new THREE.Matrix4()
    const localPos = new THREE.Vector3()

    return function rowColFromWorldPos(worldPos) {
      invWorldMatrix.getInverse(this.mesh.matrixWorld)
      localPos.copy(worldPos)
      localPos.applyMatrix4(invWorldMatrix)
  
      const row = this.rowFromY(localPos.y)
      const col = this.colFromX(localPos.x)
      return { row, col }
    }
  
  })(),

  findTileByLocalPos(localPos) {
    const row = this.rowFromY(localPos.y)
    const col = this.colFromX(localPos.x)
    return slidingHelper.findTileBySlidingRowCol(this.puzzle, row, col)
  },

  findTileByWorldPos(worldPos) {
    const { row, col } = this.rowColFromWorldPos(worldPos)
    return slidingHelper.findTileBySlidingRowCol(this.puzzle, row, col)
  },

  dragTile(tile, deltaRow, deltaCol) {
    const data = this.data
    const numTiles = data.rows*data.cols
    const missingTileId = numTiles - 1

    if (tile.id === missingTileId) {
      return false
    }

    const missingTile = slidingHelper.findTile(this.puzzle, missingTileId)

    if (tile.row === missingTile.row && (this.sliding === "row" || !this.sliding)) {
      slidingHelper.slideTiles(this.puzzle, tile, "row", deltaCol)
      this.drawAllTiles()

    } else if (tile.col === missingTile.col && (this.sliding === "col" || !this.sliding)) {
      slidingHelper.slideTiles(this.puzzle, tile, "col", deltaRow)
      this.drawAllTiles()

    }
  },

  // row and col may be fractional, both start from 0
  drawTile(id, row, col, zOffset = 0) {
    const position = this.mesh.geometry.getAttribute("position")
    const numCols = this.data.cols
    const numRows = this.data.rows
    const missingTileId = numCols*numRows - 1
    const y0 = id === missingTileId ? 0 : .5 - row/numRows // .5 is the top, -.5 the bottom
    const x0 = id === missingTileId ? 0 : col/numCols - .5 // -.5 is the left, .5 the right
    const y1 = id === missingTileId ? 0 : y0 - 1/numRows
    const x1 = id === missingTileId ? 0 : x0 + 1/numCols

    // layout must match PlaneBufferGeometry
    const i = id*VERTS_PER_TILE
    position.setXYZ(i  , x0, y0, zOffset)
    position.setXYZ(i+1, x0, y1, zOffset)
    position.setXYZ(i+2, x1, y0, zOffset)
    position.setXYZ(i+3, x0, y1, zOffset)
    position.setXYZ(i+4, x1, y1, zOffset)
    position.setXYZ(i+5, x1, y0, zOffset)

    position.needsUpdate = true
  },

  drawAllTiles() {
    const hoverOffset = this.data.hoverOffset

    for (let tile of this.puzzle.tiles) {
      const zOffset = this.hoverTiles.includes(tile) ? hoverOffset : 0
      this.drawTile(tile.id, tile.row, tile.col, zOffset)
    }

    for (let info of this.puzzle.slidingInfos) {
      const zOffset = this.hoverTiles.includes(info.tile) ? hoverOffset : 0
      this.drawTile(info.tile.id, info.tile.row + info.row, info.tile.col + info.col, zOffset)
    }
  },

  addListeners() {
    const data = this.data
    if (data.hands) {
      for (let hand of data.hands) {
        if (data.debug) {
          console.log("listening for:", data.grabEvent, "and", data.releaseEvent, "on", domHelper.getDebugName(hand))
        }
        hand.addEventListener(data.grabEvent, this.onGrab)
        hand.addEventListener(data.releaseEvent, this.onRelease)
      }
    }
  },

  removeListeners() {
    const data = this.data
    if (data.hands) {
      for (let hand of data.hands) {
        if (data.debug) {
          console.log("removed:", data.grabEvent, "and", data.releaseEvent, "on", domHelper.getDebugName(hand))
        }
        hand.removeEventListener(data.grabEvent, this.onGrab)
        hand.removeEventListener(data.releaseEvent, this.onRelease)
      }
    }
  },

  createCheckerBoardTexture(rows, cols) {
    const W = 1024
    const H = 1024
    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H
    drawCheckerBoard(canvas, rows, cols, "#d22", "#eee", "number", "bold", "arial")
    return new THREE.CanvasTexture(canvas)
  },

  createMesh(rows, cols) {
    const indexedGeo = new THREE.PlaneBufferGeometry(1, 1, rows, cols)
    const geo = indexedGeo.toNonIndexed()
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({side: THREE.DoubleSide}))
  },

  onGrab(event) {
    const localPoint = new THREE.Vector3()
    const hand = event.target
    const grab = {hand}

    if (this.getIntersection(localPoint, hand, false)) {
      const tile = this.findTileByLocalPos(localPoint)
      if (tile) {
        // subtract any existing sliding such that (new grab - grab) === slidingInfo
        const slidingInfo = this.puzzle.slidingInfos.find(sliding => sliding.tile === tile)
        grab.tile = tile
        grab.row = this.rowFromY(localPoint.y) - (slidingInfo ? slidingInfo.row : 0)
        grab.col = this.colFromX(localPoint.x) - (slidingInfo ? slidingInfo.col : 0)
      }
    }

    this.grabHands.push(grab)

    if (this.data.debug) {
      console.log("grabbed:", grab.tile ? grab.tile.id : "nothing", "with", domHelper.getDebugName(grab.hand))
    }
  },

  onRelease(event) {
    const data = this.data
    this.grabHands = this.grabHands.filter(grab => grab.hand !== event.target)

    if (this.grabHands.every(grab => !grab.tile)) {
      slidingHelper.recalculateMissingTile(this.puzzle)
      this.drawAllTiles()

      if (data.debug) {
        const missingTile = this.puzzle.missingTile
        console.log("new missing tile", missingTile.id, missingTile.row, missingTile.col)
      }
    }

    if (this.data.debug) {
      console.log("released ", domHelper.getDebugName(event.target))
    }
  },

})

function drawCheckerBoard(canvas, rows, cols, styleA, styleB, numberStyle, preFont, postFont) {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext("2d")
  const dw = w/cols
  const dh = h/rows
  const factor = 0.6

  ctx.font = `${preFont} ${Math.floor( Math.min(dw, dh)*factor )}px ${postFont}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const col = ((r & 1) ^ (c & 1)) ? styleA : styleB
      ctx.strokeStyle = ctx.fillStyle = col
      ctx.fillRect(c*dw, r*dh, dw, dh)
      if (numberStyle === "coord" || numberStyle === "number") {
        const textCol = col === styleA ? styleB : styleA
        ctx.strokeStyle = ctx.fillStyle = textCol
        if (numberStyle === "coord") {
          ctx.fillText(String.fromCharCode(65 + r) + (c + 1).toString(), (c + 0.5)*dw, (r + 0.5)*dh)
        } else {
          ctx.fillText((c + r*cols + 1).toString(), (c + 0.5)*dw, (r + 0.5)*dh)
        }
      }
    }
  }

  return canvas
}


