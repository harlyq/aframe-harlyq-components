import { threeHelper } from "harlyq-helpers"

AFRAME.registerComponent("pixel-color", {
  schema: {
    src: { type: "map" },
    canvas: { type: "selector" },
    color: { type: "color" },
    minSlope: { default: 0 },
    maxSlope: { default: 90 },
    bottomLeft: { type: "vec2", default: {x:0, y:0} },
    topRight: { type: "vec2", default: {x:1, y:1} },
    minIntensity: { default: 0 },
    maxIntensity: { default: 1 },
  },
  multiple: true,

  init() {
    this.color = new THREE.Color()
  },

  update() {
    const data = this.data
    let hasValidData = true

    if (data.src instanceof HTMLCanvasElement || data.src instanceof HTMLImageElement || data.src instanceof SVGImageElement) {
    } else {
      hasValidData = false
      console.error(`unable to derive an image from 'src' - ${data.src}`)
    }

    if (data.canvas instanceof HTMLCanvasElement) {
    } else {
      hasValidData = false
      console.error(`unable to find output 'canvas' - ${data.canvas}`)
    }

    this.color.set(data.color)

    if (hasValidData) {
      this.paintCanvas()
    }
  },

  paintCanvas() {
    const data = this.data
    const srcWidth = data.src.width
    const srcHeight = data.src.height
    const FLOATS_PER_COLOR = 4

    let srcCtx

    if (data.src instanceof HTMLCanvasElement) {
      srcCtx = data.src.getContext("2d")
    } else if (data.src instanceof HTMLImageElement || data.src instanceof SVGImageElement) {
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = srcWidth
      tempCanvas.height = srcHeight
      srcCtx = tempCanvas.getContext("2d")
      srcCtx.drawImage(data.src, 0, 0)
    }

    const srcImage = srcCtx.getImageData(0, 0, srcWidth, srcHeight)
    const srcImageData = srcImage.data
    const intensities = Float32Array.from( { length: srcImageData.length/FLOATS_PER_COLOR }, (_, i) => {
      return ( srcImageData[i*FLOATS_PER_COLOR] + srcImageData[i*FLOATS_PER_COLOR + 1] + srcImageData[i*FLOATS_PER_COLOR + 2] ) / ( 255*3 ) // ignore alpha
    } ) 

    const paintCanvas = document.createElement("canvas")
    paintCanvas.width = srcWidth
    paintCanvas.height = srcHeight
    const paintCtx = paintCanvas.getContext("2d")
    
    const overlayImage = paintCtx.createImageData(srcImage)
    const overlayImageData = overlayImage.data
    const color256 = { r: this.color.r*255, g: this.color.g*255, b: this.color.b*255 }
    const minSlope = Math.tan(THREE.Math.degToRad(Math.max(0, data.minSlope)))
    const maxSlope = Math.tan(THREE.Math.degToRad(Math.max(0, data.maxSlope)))
    const extents = { 
      min: { 
        x: data.bottomLeft.x*srcWidth, 
        y: data.bottomLeft.y*srcHeight,
      },
      max: {
        x: data.topRight.x*srcWidth, 
        y: data.topRight.y*srcHeight,
      },
    }

    for (let x = 0; x < srcWidth; x++) {
      for (let y = 0; y < srcHeight; y++) {
        const i = y*srcWidth + x
        const j = i*FLOATS_PER_COLOR
        const intensity = intensities[i]

        let doPaint = x >= extents.min.x && x <= extents.max.x && y >= extents.min.y && y <= extents.max.y
        doPaint = doPaint && intensity >= data.minIntensity && intensity <= data.maxIntensity

        if (doPaint) {
          const xSlope = ( x === 0 ? intensity - intensities[i + 1] : intensities[i - 1] - intensity ) * srcWidth
          const ySlope = ( y === 0 ? intensity - intensities[i + srcWidth]  : intensities[i - srcWidth] - intensity ) * srcHeight
          const slope = Math.max( Math.abs(xSlope), Math.abs(ySlope) )
          doPaint = slope >= minSlope && slope <= maxSlope
       }

        if (doPaint) {
          overlayImageData[j] = color256.r
          overlayImageData[j+1] = color256.g
          overlayImageData[j+2] = color256.b
          overlayImageData[j+3] = 255
        } else {
          overlayImageData[j+3] = 0
        }
      }
    }

    paintCtx.putImageData(overlayImage, 0, 0)

    const targetCtx = data.canvas.getContext("2d")
    targetCtx.drawImage(paintCanvas, 0, 0, data.canvas.width, data.canvas.height) // src and canvas sizes may differ

    threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, data.canvas)
  }
})