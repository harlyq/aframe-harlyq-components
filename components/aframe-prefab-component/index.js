import { aframeHelper } from "harlyq-helpers"

AFRAME.registerComponent('prefab', {
  schema: {
    template: { default: "" },
    debug: { default: false },
  },

  init() {
    this.templateContent = undefined
    this.hasPrefab = false
  },

  remove() {
    this.destroyPrefab()
  },

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

  update(oldData) {
    const data = this.data
    
    if (oldData.template !== data.template) {
      aframeHelper.loadTemplate( data.template, "", (text) => {
        this.templateContent = text
        this.destroyPrefab()
        this.createPrefab()
      } )
    }
  },

  createPrefab() {
    if (!this.hasPrefab) {
      const newHTML = this.processTemplate(this.templateContent)
      this.el.innerHTML = newHTML
      this.hasPrefab = true

      if (this.data.debug) {
        console.log(newHTML)
      }
    }
  },

  destroyPrefab() {
    if (this.hasPrefab) {
      while (this.el.lastChild) {
        this.el.removeChild(this.el.lastChild)
      }
      this.hasPrefab = false
    }
  },

  processTemplate(str) {
    const templateArgs = Object.keys(this.data).concat("return `" + str + "`")
    const fn = new Function(...templateArgs)
    return fn(...Object.values(this.data))
  },
})