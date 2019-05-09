import { domHelper, aframeHelper } from "harlyq-helpers"

const SVG_HTML_WIDTH = 256
const SVG_HTML_HEIGHT = 256

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
    bubbles: { default: false },
    debug: { default: false },
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
    this.touchEls = []
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
    } else {
      this.updateHoverAndTouch()
    }
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
      }
    }
  },

  createSVGFunction(str) {
    const templateArgs = Object.keys(this.data).concat("return `" + str + "`")
    this.svgTextFunction = new Function(...templateArgs)
  },

  processTemplate(str) {
    if (this.svgTextFunction) {
      // @ts-ignore
      const result = this.svgTextFunction(...Object.values(this.data))
      return result.replace(/%/g, "%25").replace(/#/g, '%23') // patch all # and % because they are special characters for data:image
    }
  },

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
    let touchElements = []

    for (let raycaster of this.raycasters) {
      if (raycaster) {
        const intersection = raycaster.components.raycaster.getIntersection(this.el)
  
        if (intersection) {
          appendUnique( hoverElements, this.calcElementsFromUV(intersection.uv, this.data.hoverSelectors, false) )
  
          if (intersection.distance < this.data.touchDistance) {
            appendUnique( touchElements, this.calcElementsFromUV(intersection.uv, this.data.touchSelectors, this.data.debug) )
          }
        }
      }
    }

    for (let el of this.hoverEls) {
      if (!hoverElements.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-hoverend", { uiTarget: el, hovers: hoverElements.map(x => x.id) }, this.el.id)
      }
    }

    for (let el of hoverElements) {
      if (!this.hoverEls.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-hoverstart", { uiTarget: el, hovers: hoverElements.map(x => x.id) }, this.el.id)
      }
    }
  
    this.hoverEls = hoverElements

    for (let el of this.touchEls) {
      if (!touchElements.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-touchend", { uiTarget: el, touches: touchElements.map(x => x.id) }, this.el.id)
      }
    }

    for (let el of touchElements) {
      if (!this.touchEls.find(otherEl => otherEl.id === el.id)) {
        this.sendEvent("svg-ui-touchstart", { uiTarget: el, touches: touchElements.map(x => x.id) }, this.el.id)
      }
    }

    this.touchEls = touchElements
  },

  onSetObject3D(e) {
    this.showSVGTextureOnMesh()
  },

  onRaycasterIntersected(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersected", this.el.id)
    }
    this.raycasters.push(e.detail.el)
    this.el.sceneEl.addBehavior(this)
  },

  onRaycasterIntersectedCleared(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersectedCleared", this.el.id)
    }
    this.raycasters.splice( this.raycasters.indexOf(e.detail.el), 1 )
  },

  onClick(e) {
    if (this.data.debug) {
      console.log("click", this.el.id)
    }

    if (e.detail.intersection) {
      let hitElements = this.calcElementsFromUV(e.detail.intersection.uv, this.data.clickSelectors, this.data.debug)

      if (hitElements && hitElements.length > 0) {
        this.sendEvent("svg-ui-click", { uiTarget: hitElements[0] })
      }
    }
  },

  sendEvent(name, details) {
    if (this.data.debug) {
      console.log("emit", name, details)
    }

    this.el.emit(name, details, this.data.bubbles)
  }
})

