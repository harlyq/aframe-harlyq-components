import { domHelper, aframeHelper } from "harlyq-helpers"

AFRAME.registerComponent("svg-ui", {
  schema: {
    template: { default: "" },
    clickSelector: { default: "" },
    hoverSelector: { default: "" },
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
    this.firstTime = true
    this.hasUIListeners = false
    this.raycaster = undefined
    this.hoverEls = []
    this.onSetObject3D = this.onSetObject3D.bind(this)
    this.onRaycasterIntersected = this.onRaycasterIntersected.bind(this)
    this.onRaycasterIntersectedCleared = this.onRaycasterIntersectedCleared.bind(this)
    this.onClick = this.onClick.bind(this)

    this.el.addEventListener("setobject3d", this.onSetObject3D)
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

    if (this.firstTime) {
      this.createSVGTexture()
    }

    if (oldData.template !== data.template) {
      aframeHelper.loadTemplate(data.template, (text) => {
        this.templateContent = text
        this.updateSVGTexture()
      })
    }

    if (!this.firstTime) {
      this.updateSVGTexture()
    }

    this.addUIListeners()
    this.firstTime = false
  },

  tick() {
    if (!this.raycaster) {
      this.el.sceneEl.removeBehavior(this)
    } else {
      this.updateHover()
    }
  },

  isSelectable() {
    const data = this.data
    return data.clickSelector || data.hoverSelector
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
    
    this.texture = new THREE.Texture(this.imageEl)

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
        this.proxySVGEl.setAttribute("width", this.data.resolution.x)
        this.proxySVGEl.setAttribute("height", this.data.resolution.y)
        this.proxyRect = this.proxySVGEl.getBoundingClientRect()   
      }

      this.imageEl.src = 'data:image/svg+xml;utf8,' + generatedContent
      this.texture.needsUpdate = true
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

  processTemplate(str) {
    const templateArgs = Object.keys(this.data).concat("return `" + str + "`")
    const fn = new Function(...templateArgs)
    // @ts-ignore
    const result = fn(...Object.values(this.data))
    return result.replace(/#/g, '%23') // patch all # because they represent a fragment identifier when using data:image
  },

  calcElementsFromUV: (function () {
    let transformedUV = new THREE.Vector2()

    return function calcElementsFromUV(uv, selector, debug) {
      transformedUV.copy(uv)
      this.texture.transformUv(transformedUV)

      const x = this.proxyRect.left + this.proxyRect.width*transformedUV.x
      const y = this.proxyRect.top + this.proxyRect.height*transformedUV.y

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

  updateHover() {
    if (this.raycaster) {
      const intersection = this.raycaster.components.raycaster.getIntersection(this.el)

      if (intersection) {
        let hitElements = this.calcElementsFromUV(intersection.uv, this.data.hoverSelector, false)

        for (let el of this.hoverEls) {
          if (!hitElements.includes(el)) {
            this.sendEvent("svg-ui-leave", { uiTarget: el })
          }
        }

        for (let el of hitElements) {
          if (!this.hoverEls.includes(el)) {
            this.sendEvent("svg-ui-enter", { uiTarget: el })
          }
        }

        this.hoverEls = hitElements
      }
    }
  },

  onSetObject3D(e) {
    this.showSVGTextureOnMesh()
  },

  onRaycasterIntersected(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersected")
    }
    this.raycaster = e.detail.el
    this.el.sceneEl.addBehavior(this)
  },

  onRaycasterIntersectedCleared(e) {
    if (this.data.debug) {
      console.log("onRaycasterIntersectedCleared")
    }
    this.raycaster = undefined
  },

  onClick(e) {
    if (this.data.debug) {
      console.log("click", this.el.id)
    }

    if (e.detail.intersection) {
      let hitElements = this.calcElementsFromUV(e.detail.intersection.uv, this.data.clickSelector, this.data.debug)

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

