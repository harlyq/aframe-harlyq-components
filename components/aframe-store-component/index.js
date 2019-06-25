import { aframeHelper } from "harlyq-helpers"

function toLowerCase(x) {
  return typeof x === "string" ? x.toLowerCase() : x
}

AFRAME.registerComponent('store', {
  schema: {
    type: { default: "temporary", oneOf: ["temporary", "local", "session"], parse: toLowerCase },
  },

  multiple: true,

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
    this.binds = []
    this.firstTime = true

    this.loadStorage()
    this.el.emit("store-loaded", { store: this, name: this.attrName })
  },

  update(oldData) {
    const data = this.data

    for (let bind of this.binds) {
      const key = bind.key
      if (data[key] !== oldData[key]) {
        aframeHelper.setProperty(bind.target, bind.prop, data[key])
      }
    }

    if (!this.firstTime) {
      this.saveStorage()
    }

    this.firstTime = false
  },

  loadStorage() {
    const originalSchema = AFRAME.components[this.name].schema
    const data = this.data
    if (data.type === "temporary") { return }

    for (let key in this.data) {
      if (!(key in originalSchema)) {
        let value = null
        if (data.type === "local") {
          value = localStorage.getItem(key)
        } else if (data.type === "session") {
          value = sessionStorage.getItem(key)
        }

        if (value !== null) {
          data[key] = value
        }
      }
    }
  },

  saveStorage() {
    const originalSchema = AFRAME.components[this.name].schema
    const data = this.data
    if (data.type === "temporary") { return }

    for (let key in this.data) {
      if (!(key in originalSchema)) {
        if (data.type === "local") {
          localStorage.setItem(key, data[key])
        } else if (data.type === "session") {
          sessionStorage.setItem(key, data[key])
        }
      }
    }
  },

  bind(key, target, prop) {
    if (this.binds.find(item => item.target === target && item.prop === prop)) {
      aframeHelper.warn(`bind '${target}.${prop}' already exists`)
    }
    this.binds.push({key, target, prop})
  },

  unbind(key, target, prop) {
    const i = this.binds.findIndex(item => item.target === target && item.prop === prop && item.key === key)
    if (i >= 0) {
      this.binds.splice(i, 1)
    } else {
      aframeHelper.warn(`unable to find bind '${target}.${prop}' for store key '${key}'`)
    }
  }
})


AFRAME.registerComponent('store-bind', {
  schema: {
    store: { type: "selector" },
    from: { default: "" },
    to: { default: "" },
  },

  multiple: true,

  init() {
    this.onStoreLoaded = this.onStoreLoaded.bind(this)
  },

  remove() {
    const data = this.data
    this.removeListeners(data.store)
    this.unbind(data.store, data.from, data.to)
  },

  update(oldData) {
    const data = this.data

    this.unbind(oldData.store, oldData.from, oldData.to)
    this.bind(data.store, data.from, data.to)

    if (oldData.store !== data.store) {
      this.removeListeners(oldData.store)
      this.addListeners(data.store)
    }
  },

  addListeners(store) {
    if (store) {
      store.addEventListener("store-loaded", this.onStoreLoaded)
    }
  },

  removeListeners(store) {
    if (store) {
      store.removeEventListener("store-loaded", this.onStoreLoaded)
    }
  },

  // stores placed on the scene do not init until after the entity components!
  onStoreLoaded(e) {
    const data = this.data
    this.bind(data.store, data.from, data.to)
  },

  bind(store, from, to) {
    if (store && from && to) {
      const [fromComp, key] = from.split(".")
      const storeComponent = store.components[fromComp]

      if (storeComponent && 'bind' in storeComponent) {
        storeComponent.bind(key, this.el, to)
      }
    }
  },

  unbind(store, from, to) {
    if (store && from && to) {
      const [fromComp, key] = from.split(".")
      const storeComponent = store.components[fromComp]

      if (storeComponent && 'unbind' in storeComponent) {
        storeComponent.unbind(key, this.el, to)
      }
    }
  }
})