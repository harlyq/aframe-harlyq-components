import { pseudorandom, threeHelper } from "harlyq-helpers"

const indexFromXY = (x,y, width) => y*width + x
const xyFromIndex = (i, width) => [ i % width, Math.trunc( i/width ) ]
const instanceName = (level, index, count) => `${level}_${index}_${count}`
const ATTEMPT_MULTIPLIER = 4

AFRAME.registerComponent("foliage", {
  schema: {
    cellSize: { default: 10 },
    model: { type: "asset" },
    modelScale: { type: "vec3", default: { x:1, y:1, z:1 } },
    avoidance: { default: 1 },
    densities: { default: "1" },
    level: { default: 1 },
    intensityMap: { type: "selector" },
    debugCanvas: { type: "selector" },
    seed: { default: -1 }
  },

  multiple: true,

  init() {
    this.cells = []
    this.lcg = pseudorandom.lcg()
    this.model = null;
    this.loader = new THREE.GLTFLoader();

    // let dracoLoader = this.system.getDRACOLoader();
    // if (dracoLoader) {
    //   this.loader.setDRACOLoader(dracoLoader);
    // }
  },

  update(oldData) {
    const data = this.data
    this.lcg.setSeed(data.seed)
    this.densities = data.densities.split(",").map( x => Number(x) )

    this.drawCtx = data.debugCanvas instanceof HTMLCanvasElement ? data.debugCanvas.getContext("2d") : undefined

    if (data.model) {
      this.loadModel(data.model)
    }
  },

  loadModel(name) {
    const self = this

    this.loader.load(name, 
      (gltfModel) => {
        self.model = gltfModel.scene || gltfModel.scenes[0];
        // self.model.animations = gltfModel.animations;
        // el.setObject3D('mesh', self.model);
        self.el.emit('model-loaded', {format: 'gltf', model: self.model});
        this.createFoliage()
      }, 
      undefined /* onProgress */, 
      (error) => {
        var message = (error && error.message) ? error.message : `Failed to load glTF model '${name}'`;
        console.warn(message);
        self.el.emit('model-error', {format: 'gltf', src: name});
      }
    )
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
    const maxDensities = this.densities.length
    const srcImage = srcCtx.getImageData(0, 0, width, height)
    const srcImageData = srcImage.data
    const intensities = Float32Array.from( { length: srcImageData.length/FLOATS_PER_COLOR }, (_, i) => {
      return ( srcImageData[i*FLOATS_PER_COLOR] + srcImageData[i*FLOATS_PER_COLOR + 1] + srcImageData[i*FLOATS_PER_COLOR + 2] ) / ( 255*3 + 1 )  // ignore alpha
    } ) // in the range 0..1

    const sortedIndices = Array.from( intensities.keys() ).sort( (a,b) => intensities[b] - intensities[a] ) // descending

    for (let cell of this.cells)
      this.removeModels(cell)

    this.cells = []
    this.drawGrid2D(width, height, "black")

    for (let index of sortedIndices) {
      const intensity = intensities[index]
      const level = Math.trunc( intensity * ( maxDensities + 1 ) ) // +1 because we include the 0th
      if (level === 0) {
        break
      }

      const [x,y] = xyFromIndex(index, width)
      const density = this.densities[level - 1] // -1 because we ingnore the 0th
      const newCell = this.populateCell(level, index, x, y, width, height, data.cellSize, density, data.avoidance, this.model, data.modelScale)
      this.cells[index] = newCell

      this.addModels(newCell, width, height, data.cellSize)
    }

    threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, data.debugCanvas)
  },

  addModels(cell, width, height, cellSize) {
    for (let k = 0; k < cell.objects.length; k++) {
      const obj = cell.objects[k]

      if (obj.model) {
        const model = obj.model.clone()
        const x = (obj.x - width/2)*cellSize
        const y = 0 
        const z = (obj.y - height/2)*cellSize

        model.scale.copy(obj.modelScale)
        model.position.set(x,y,z)
        this.el.setObject3D( instanceName(cell.level, cell.id, k), model )
      }
    }
  },

  removeModels(cell) {
    for (let k = 0; k < cell.objects.length; k++) {
      this.el.removeObject3D( instanceName(cell.level, cell.id, k) )
    }
  },

  populateCell(level, i, x, y, width, height, cellSize, density, avoidance, model, modelScale) {
    const r = avoidance/cellSize
    const square = x => x*x
    const cell = { id: i, objects: [] }

    this.lcg.setSeed(i*1761)

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
        cell.objects.push( { level, x: nx, y: ny, r, model, modelScale } )
        this.drawCircle2D( nx/width, ny/height, r/width, "blue", true )
        count++
      }
    }

    return cell
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
