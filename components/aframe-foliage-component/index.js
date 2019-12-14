import { attribute, pseudorandom, threeHelper } from "harlyq-helpers"

const indexFromXY = (x,y, width) => y*width + x
const xyFromIndex = (cellID, width) => [ cellID % width, Math.trunc( cellID/width ) ]
const ATTEMPT_MULTIPLIER = 4

AFRAME.registerComponent("foliage", {
  schema: {
    instancePool: { type: "selector" },
    cellSize: { default: 10 },
    avoidance: { default: 1 },
    densities: { default: "1" },
    rotations: { default: "0" },
    scales: { default: "1" },
    colors: { default: "white" },
    intensityMap: { type: "selector" },
    debugCanvas: { type: "selector" },
    seed: { default: -1 }
  },

  multiple: true,

  init() {
    this.cells = []
    this.lcg = pseudorandom.lcg()

    this.onPoolAvailable = this.onPoolAvailable.bind(this)
  },

  remove() {
    if (this.data.instancePool) {
      this.data.instancePool.removeEventListener("pool-available", this.onPoolAvailable)
    }
    this.removeModels()
  },

  update(oldData) {
    const data = this.data
    this.lcg.setSeed(data.seed)
    this.densities = attribute.parseNumberArray( data.densities )
    this.rotations = attribute.parseNumberArray( data.rotations )
    this.scales = attribute.parseNumberArray( data.scales )
    this.colors = attribute.parseColorArray( data.colors )

    this.drawCtx = data.debugCanvas instanceof HTMLCanvasElement ? data.debugCanvas.getContext("2d") : undefined

    if (data.instancePool) {
      this.pool = data.instancePool.components["instance-pool"]
      data.instancePool.addEventListener("pool-available", this.onPoolAvailable)
      if (this.pool.isAvailable()) {
        this.createFoliage()
      }
    }
  },

  tick() {

  },

  tock() {

  },

  createFoliage() {
    const data = this.data
    const intensityMap = data.intensityMap
    const width = intensityMap.width
    const height = intensityMap.height
    let srcCtx

    if (intensityMap instanceof HTMLCanvasElement) {
      srcCtx = intensityMap.getContext("2d")
    } else if (intensityMap instanceof HTMLImageElement || intensityMap instanceof SVGImageElement) {
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = width
      tempCanvas.height = height
      srcCtx = tempCanvas.getContext("2d")
      srcCtx.drawImage(intensityMap, 0, 0)
    }

    const FLOATS_PER_COLOR = 4
    const maxDensities = this.densities.length - 1
    const srcImage = srcCtx.getImageData(0, 0, width, height)
    const srcImageData = srcImage.data
    const intensities = Float32Array.from( { length: srcImageData.length/FLOATS_PER_COLOR }, (_, cellID) => {
      return ( srcImageData[cellID*FLOATS_PER_COLOR] + srcImageData[cellID*FLOATS_PER_COLOR + 1] + srcImageData[cellID*FLOATS_PER_COLOR + 2] ) / ( 255*3 + 1 )  // ignore alpha
    } ) // in the range 0..1

    const sortedIndices = Array.from( intensities.keys() ).sort( (a,b) => intensities[b] - intensities[a] ) // descending

    for (let cell of this.cells) {
      this.removeModels(cell)
    }

    this.cells = []
    this.drawGrid2D(width, height, "black")

    // this.el.sceneEl.object3D.updateMatrixWorld(true) // we want to capture the whole hierarchy, is there a better way to do this?

    for (let index of sortedIndices) {
      const level = Math.trunc( intensities[index] * ( maxDensities + 2 ) ) // +2 because we count the 0th and intensities is only to 0.99999 
      if (level === 0) {
        break
      }

      const [x,y] = xyFromIndex(index, width)
      const densityAttribute = this.densities[level - 1] || 1 // -1 because we ingnore the 0th
      const rotationAttribute = this.rotations[ Math.min(this.rotations.length - 1, level - 1) ] || 0
      const scaleAttribute = this.scales[ Math.min(this.scales.length - 1, level - 1) ] || 1
      const colorAttribute = this.colors[ Math.min(this.colors.length - 1, level - 1) ] || 1
      const newCell = this.populateCell(level, index, x, y, width, height, data.cellSize, densityAttribute, rotationAttribute, scaleAttribute, colorAttribute, data.avoidance)
      this.cells[index] = newCell

      this.addModels(newCell, width, height, data.cellSize)
    }

    threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, data.debugCanvas)
  },

  addModels(cell, width, height, cellSize) {
    const pos = new THREE.Vector3()
    const rotationEuler = new THREE.Euler()
    const rotationQuat = new THREE.Quaternion()
    const objectCount = cell.objects.length

    if (!cell.indexCount || cell.indexCount < objectCount) {
      if (cell.indexCount) {
        this.pool.releaseBlock(objectCount)
      }
      cell.index = this.pool.reserveBlock(objectCount)
      cell.indexCount = objectCount
    }

    if (cell.index === undefined) {
      return // objectCount is 0 or there are no instances available
    }

    const start = cell.index
    for (let k = 0; k < objectCount; k++) {
      const obj = cell.objects[k]

      pos.x = (obj.x - width/2)*cellSize
      pos.y = 0
      pos.z = (obj.y - height/2)*cellSize

      rotationQuat.setFromEuler( rotationEuler.set( 0, obj.rotation, 0 ) )

      this.pool.setScaleAt(start + k, obj.scale, obj.scale, obj.scale)
      this.pool.setPositionAt(start + k, pos.x, pos.y, pos.z)
      this.pool.setQuaternionAt( start + k, rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w )
      this.pool.setColorAt( start + k, obj.color.r, obj.color.g, obj.color.b )
    }

    return cell.objects.length
  },

  removeModels(cell) {
    if (this.poolIndex && cell.indexCount > 0) {
      this.pool.releaseBlock( cell.index )
      cell.indexCount = 0
      cell.index = undefined
    }
  },

  populateCell(level, cellID, x, y, width, height, cellSize, densityAttribute, rotationAttribute, scaleAttribute, colorAttribute, avoidance) {
    const r = avoidance/cellSize
    const square = x => x*x
    const cell = { id: cellID, objects: [] }

    this.lcg.setSeed(cellID*1761)

    function hasOverlap(cell, x, y, r) {
      if (cell) {
        for (let obj of cell.objects) {
          if ( square(obj.x - x) + square(obj.y - y) < square(r + obj.r) ) {
            return true
          }
        }
      }
      return false
    }

    const density = attribute.randomize(densityAttribute, this.lcg.random)
    let count = 0
    let attempts = density*ATTEMPT_MULTIPLIER

    while (count < density && attempts-- > 0) {
      const nx = this.lcg.random() + x
      const ny = this.lcg.random() + y

      let overlap = hasOverlap(cell, nx, ny, r)
      overlap = overlap || ( x > 0 && hasOverlap( this.cells[ indexFromXY(x-1, y, width) ], nx, ny, r ) )
      overlap = overlap || ( y > 0 && hasOverlap( this.cells[ indexFromXY(x, y-1, width) ], nx, ny, r ) )
      overlap = overlap || ( x < width-1 && hasOverlap( this.cells[ indexFromXY(x+1, y, width) ], nx, ny, r ) )
      overlap = overlap || ( y < height-1 && hasOverlap( this.cells[ indexFromXY(x, y+1, width) ], nx, ny, r ) )

      if (overlap) {
        this.drawCircle2D( nx/width, ny/height, r/width, "red" )
      } else {
        const rotation = attribute.randomize(rotationAttribute, this.lcg.random)
        const scale = attribute.randomize(scaleAttribute, this.lcg.random)
        const color = attribute.randomize(colorAttribute, this.lcg.random)
        cell.objects.push( { level, x: nx, y: ny, r, scale, rotation, color } )
        this.drawCircle2D( nx/width, ny/height, r/width, "blue", true )
        count++
      }
    }

    return cell
  },

  onPoolAvailable(evt) {
    if (evt.detail.pool === this.pool) {
      this.createFoliage()
    }
  },

  drawCircle2D(x, y, r, col, fill = false) {
    if (this.drawCtx) {
      x *= this.drawCtx.canvas.width
      y *= this.drawCtx.canvas.height
      r *= this.drawCtx.canvas.width
      this.drawCtx.beginPath()
      this.drawCtx.arc(x, y, r, 0, Math.PI*2)
      if (fill) {
        this.drawCtx.fillStyle = col
        this.drawCtx.fill()
      } else {
        this.drawCtx.strokeStyle = col
        this.drawCtx.stroke()
      }
    }
  },
  
  drawPoint2D(x, y, col) {
    if (this.drawCtx) {
      x *= this.drawCtx.canvas.width
      y *= this.drawCtx.canvas.height
      this.drawCtx.fillStyle = col
      this.drawCtx.fillRect(x, y, 1, 1)
    }
  },
  
  drawGrid2D(width, height, col) {
    if (this.drawCtx) {
      this.drawCtx.strokeStyle = col
      const dx = this.drawCtx.canvas.width/width
      const dy = this.drawCtx.canvas.height/height

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          this.drawCtx.strokeRect(x*dx, y*dy, dx, dy)
        }
      }
    }
  }
})
