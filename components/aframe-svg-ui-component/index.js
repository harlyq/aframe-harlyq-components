import { domHelper, aframeHelper } from "harlyq-helpers"

const SVG_HTML_WIDTH = 256
const SVG_HTML_HEIGHT = 256
const isSVG = (str) => typeof str === "string" && /\<svg/.test(str)

function appendUnique(list, otherList) {
  for (let i = 0; i < otherList.length; i++) {
    if (!list.includes(otherList[i])) {
      list.push(otherList[i])
    }
  }
  return list
}

AFRAME.registerComponent("svg-ui", {
  schema: {
    template: { default: "" },
    clickSelectors: { default: "" },
    hoverSelectors: { default: "" },
    touchSelectors: { default: "" },
    touchDistance: { default: 0.07 },
    resolution: { type: "vec2", default: {x: 512, y:512} },
    touchDeadZone: { default: .5 },
    bubbles: { default: false },
    debug: { default: false },
    enabled: { default: true },
  },

  // copy new properties to the schema so they will appear in the Inspector
  updateSchema(newData) {
    if (typeof newData !== "object") {
      console.error(`invalid properties, expected format <property>:<value>; '${newData}'`)
    }
    
    const originalSchema = AFRAME.components[this.name].schema
    let newSchema = {}

    for (let prop in newData) {
      if (!(prop in originalSchema)) {
        newSchema[prop] = { type: "string" }
      }
    }

    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }

  },

  init() {
    this.hasUIListeners = false
    this.raycasters = []
    this.hoverEls = []
    this.touchEls = new Map()
    this.onSetObject3D = this.onSetObject3D.bind(this)
    this.onRaycasterIntersected = this.onRaycasterIntersected.bind(this)
    this.onRaycasterIntersectedCleared = this.onRaycasterIntersectedCleared.bind(this)
    this.onClick = this.onClick.bind(this)

    this.el.addEventListener("setobject3d", this.onSetObject3D)

    this.createSVGTexture()
  },

  remove() {
    this.el.removeEventListener("setobject3d", this.onSetObject3D)

    if (this.proxyEl && this.proxyEl.parent) {
      this.proxyEl.parent.removeChild(this.proxyEl)
    }
  },

  play() {
    this.addUIListeners()
  },

  pause() {
    this.removeUIListeners()
  },

  update(oldData) {
    const data = this.data

    if (oldData.template !== data.template) {
      aframeHelper.loadTemplate(data.template, (text) => {
        this.templateContent = text
        if (!isSVG(text)) {
          console.warn(`template '${data.template}' doesn't look like SVG: ${text}`)
        }

        this.createSVGFunction(text)
        this.updateSVGTexture()
      })
      
    } else if (this.templateContent) {
      if (Object.keys(oldData) !== Object.keys(data)) {
        this.createSVGFunction(this.templateContent)
      }

      this.updateSVGTexture()
    }

    this.addUIListeners()
  },

  tick() {
    if (this.raycasters.length === 0) {
      this.el.sceneEl.removeBehavior(this)
    } else if (this.data.enabled) {
      this.updateHoverAndTouch()
    }
  },

  // other components can set the template content directly
  setTemplate(newContent) {
    this.templateContent = newContent
    this.updateSVGTexture()
  },

  isSelectable() {
    const data = this.data
    return data.clickSelectors || data.hoverSelectors || data.touchSelectors
  },

  addUIListeners() {
    if (!this.hasUIListeners && this.isSelectable()) {
      this.el.addEventListener("raycaster-intersected", this.onRaycasterIntersected)
      this.el.addEventListener("raycaster-intersected-cleared", this.onRaycasterIntersectedCleared)
      this.el.addEventListener("click", this.onClick)
      this.hasUIListeners = false
    }
  },

  removeUIListeners() {
    if (this.hasUIListeners) {
      this.el.removeEventListener("raycaster-intersected", this.onRaycasterIntersected)
      this.el.removeEventListener("raycaster-intersected-cleared", this.onRaycasterIntersectedCleared)
      this.el.removeEventListener("click", this.onClick)
      this.hasUIListeners = false
    }
  },

  createSVGTexture() {
    const data = this.data

    this.imageEl = document.createElement("img")
    this.imageEl.width = data.resolution.x
    this.imageEl.height = data.resolution.y
    this.imageEl.isReady = true

    const texture = this.texture = new THREE.Texture(this.imageEl)
    const self = this

    // steps for successful rendering of the texture
    // - imageEl.src = <new svg>
    // - imageEl.onload
    // - texture.needsUpdate = true
    // - texture.onUpdate
    // - image.isReady = true
    // - render any pending content

    // steps for failed update
    // - imageEl.src = <new svg>
    // - imageEl.onerror
    // - image.isReady = true
    // - render any pending content

    this.imageEl.onload = () => {
      texture.needsUpdate = true
    }

    this.imageEl.onerror = () => {
      console.error("invalid svg", this.lastContent)
      texture.image.isReady = true
      self.updatePendingContent()
    }

    texture.onUpdate = () => {
      texture.image.isReady = true
      self.updatePendingContent()
    }

    this.updateSVGTexture()
    this.showSVGTextureOnMesh()
  },

  updateSVGTexture() {
    if (this.templateContent) {

      const generatedContent = this.processTemplate(this.templateContent)
      if (this.data.debug) {
        console.log(generatedContent)
      }

      if (this.isSelectable()) {
        if (!this.proxyEl) {
          this.proxyEl = document.createElement("div")
          this.proxyEl.style.position = "absolute"
          this.proxyEl.style.top = "0"
          this.proxyEl.style.left = "0"
          this.proxyEl.style.zIndex = "-999"

          document.body.appendChild(this.proxyEl)
        }

        this.proxyEl.innerHTML = generatedContent

        this.proxySVGEl = this.proxyEl.children[0]
        this.proxySVGEl.setAttribute("width", SVG_HTML_WIDTH)
        this.proxySVGEl.setAttribute("height", SVG_HTML_HEIGHT)
      }

      this.pendingContent = generatedContent
      this.updatePendingContent()
    }
  },

  updatePendingContent() {
    if (this.imageEl.isReady && this.pendingContent) {
      this.imageEl.src = 'data:image/svg+xml;utf8,' + this.pendingContent
      this.imageEl.isReady = false
      this.lastContent = this.pendingContent
      this.pendingContent = undefined
    }
  },

  showSVGTextureOnMesh() {
    const mesh = this.el.getObject3D("mesh")
    if (mesh) {
      if (!Array.isArray(mesh.material)) {
        mesh.material.map = this.texture

        const materialColor = mesh.material.color
        if (materialColor && (materialColor.r < .95 || materialColor.g < .95 || materialColor.b < .95)) {
          console.warn(`svg-ui material color is not white, it may be difficult to see the ui`)
        }
      }
    }
  },

  createSVGFunction(str) {
    const templateArgs = Object.keys(this.data).concat("return `" + str + "`")
    this.svgTextFunction = new Function(...templateArgs)
  },

  processTemplate(str) {
    if (this.svgTextFunction) {
      const result = this.svgTextFunction(...Object.values(this.data))
      return result.replace(/%/g, "%25").replace(/#/g, '%23') // patch all # and % because they are special characters for data:image
    }
  },

  calcViewXYFomUV: (function() {
    let transformedUV = new THREE.Vector2()

    return function calcXYFomUV(uv) {
      transformedUV.copy(uv)
      this.texture.transformUv(transformedUV)

      const viewBox = this.proxySVGEl.viewBox.animVal
      const x = viewBox.width*transformedUV.x + viewBox.x
      const y = viewBox.height*transformedUV.y + viewBox.y
      return {x,y}
    }
  })(),

  calcElementsFromUV: (function () {
    let transformedUV = new THREE.Vector2()

    return function calcElementsFromUV(uv, selector, debug) {
      transformedUV.copy(uv)
      this.texture.transformUv(transformedUV)

      const x = SVG_HTML_WIDTH*transformedUV.x
      const y = SVG_HTML_HEIGHT*transformedUV.y

      // only show elements that are part of this panel's svg
      let elements = document.elementsFromPoint(x,y).filter(el => domHelper.hasAncestor(el, this.proxySVGEl))

      if (debug) {
        console.log("hitElements", x, y, elements)
      }

      if (selector) {
        elements = elements.map(el => domHelper.findMatchingAncestor(el, selector)).filter(a => a)
        if (debug) {
          console.log("selectedElements", elements)
        }  
      }

      return elements
    }
  })(),

  updateHoverAndTouch() {
    let hoverElements = []

    for (let raycaster of this.raycasters) {
      if (raycaster) {
        let touchElements = []
        let hasMoved = false
        const intersection = raycaster.components.raycaster.getIntersection(this.el)
        const touchInfo = this.touchEls.get(raycaster)
  
        if (intersection) {
          intersection.svg = this.calcViewXYFomUV(intersection.uv)

          if (touchInfo.lastMove) {
            hasMoved = Math.hypot(touchInfo.lastMove.x - intersection.svg.x, touchInfo.lastMove.y - intersection.svg.y) > this.data.touchDeadZone
          }

          appendUnique( hoverElements, this.calcElementsFromUV(intersection.uv, this.data.hoverSelectors, false) )
  
          if (intersection.distance < this.data.touchDistance) {
            touchElements = this.calcElementsFromUV(intersection.uv, this.data.touchSelectors, this.data.debug)
          }
        }

        const touchIds = touchElements.map(x => x.id)

        for (let prevEl of touchInfo.elements) {
          if (!touchElements.find(newEl => newEl.id === prevEl.id)) {
            this.sendEvent("svg-ui-touchend", { uiTarget: prevEl, intersection, touches: touchIds }, raycaster)
          }
        }
    
        for (let newEl of touchElements) {
          if (touchInfo.elements.find(prevEl => prevEl.id === newEl.id)) {
            if (hasMoved) {
              this.sendEvent("svg-ui-touchmove", { uiTarget: newEl, intersection, touches: touchIds }, raycaster)
            }
          } else {
            this.sendEvent("svg-ui-touchstart", { uiTarget: newEl, intersection, touches: touchIds }, raycaster)
          }
        }
    
        if (hasMoved || !touchInfo.lastMove) {
          touchInfo.lastMove = intersection.svg
        }
        touchInfo.elements = touchElements
      }
    }

    for (let el of this.hoverEls) {
      if (!hoverElements.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-hoverend", { uiTarget: el, hovers: hoverElements.map(x => x.id) })
      }
    }

    for (let el of hoverElements) {
      if (!this.hoverEls.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-hoverstart", { uiTarget: el, hovers: hoverElements.map(x => x.id) })
      }
    }
  
    this.hoverEls = hoverElements
  },

  sendEvent(name, details, targetEl) {
    if (this.data.debug) {
      console.log("emit", name, details, targetEl)
    }

    this.el.emit(name, details, this.data.bubbles)

    if (targetEl) {
      targetEl.emit(name, details, this.data.bubbles)
    }
  },

  onSetObject3D(e) {
    this.showSVGTextureOnMesh()
  },

  onRaycasterIntersected(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersected", this.el.id)
    }
    const raycaster = e.detail.el

    this.touchEls.set(raycaster, { elements: [] })
    this.raycasters.push(raycaster)
    this.el.sceneEl.addBehavior(this)
  },

  onRaycasterIntersectedCleared(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersectedCleared", this.el.id)
    }

    const raycaster = e.detail.el
    this.raycasters.splice( this.raycasters.indexOf(raycaster), 1 )
    this.touchEls.delete(raycaster)
  },

  onClick(e) {
    const data = this.data
    if (data.debug) {
      console.log("click", this.el.id)
    }

    if (e.detail.intersection && data.enabled) {
      let hitElements = this.calcElementsFromUV(e.detail.intersection.uv, data.clickSelectors, data.debug)
      const intersection = { ...e.detail.intersection, svg: this.calcViewXYFomUV(e.detail.intersection.uv) }

      if (hitElements && hitElements.length > 0) {
        this.sendEvent("svg-ui-click", { uiTarget: hitElements[0], intersection })
      }
    }
  },
})

