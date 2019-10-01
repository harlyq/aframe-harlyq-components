// @ts-ignore
const LOGGER_COLORS = {
  "error": "red",
  "warn": "yellow",
  "log": "white",
  "info": "grey",
}

AFRAME.registerSystem("logger", {
  init() {
    this.loggers = []
    this.isLogging = false
  },

  remove() {
    this.releaseLogs()
    console.assert(this.loggers.length === 0)
  },

  captureLogs() {
    this.oldLog = console.log
    this.oldError = console.error
    this.oldWarn = console.warn
    this.oldInfo = console.info

    console.log = (...args) => {
      this.sendToLogger("log", sprintf(args))
      this.oldLog(...args)
    }
    console.error = (...args) => {
      this.sendToLogger("error", sprintf(args))
      this.oldError(...args)
    }
    console.warn = (...args) => {
      this.sendToLogger("warn", sprintf(args))
      this.oldWarn(...args)
    }
    console.info = (...args) => {
      this.sendToLogger("info", sprintf(args))
      this.oldInfo(...args)
    }
  },

  releaseLogs() {
    console.log = this.oldLog
    console.error = this.oldError
    console.warn = this.oldWarn
    console.info = this.oldInfo
  },

  sendToLogger(type, msg) {
    if (!this.isLogging) {
      this.isLogging = true
      for (let cons of this.loggers) {
        cons.showMessage(type, msg)
      }
      this.isLogging = false
    }
  },

  registerLogger(comp) {
    this.loggers.push(comp)
    if (this.loggers.length === 1) {
      this.captureLogs()
    }
  },

  unregisterLogger(comp) {
    this.loggers.splice( this.loggers.indexOf(comp), 1 )
    if (this.loggers.length === 0) {
      this.releaseLogs()
    }
  },
})

AFRAME.registerComponent("logger", {
  schema: {
    maxLines: { default: 20 },
    offset: { type: "vec2", default: {x:2, y:2} },
    lineHeight: { default: 12 },
    columnWidth: { default: 80 },
    characterWidth: { default: 7.3 },
    types: { type: "array", default: ["log", "error", "warn"] },
    filter: { default: "" },
    font: { default: "1em monospace" },
  },

  init() {
    this.dirty = true
    this.messages = []
    this.onObject3DSet = this.onObject3DSet.bind(this)

    this.system.registerLogger(this)

    this.createTexture()

    this.el.addEventListener("object3dset", this.onObject3DSet)

    // let count = 0x20
    // let str = ""
    // setInterval(() => {
    //   str += String.fromCharCode(count++)
    //   console.info(str)
    //   console.log(str)
    // },100)
    // console.log("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz")
    // console.log("abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;'[]/?#") // 81 characters
    // console.log("%.2f%.2i%s%o%.3d%c that","1","9","help","34","color:red","is","it") // 1.0009help[object]034 that is it
    // console.warn("a warning")
    // console.error("an error")
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)

    this.system.unregisterLogger(this)
  },

  update(oldData) {
    const data = this.data
    if (oldData.filter !== data.filter) {
      this.filter = data.filter ? new RegExp(data.filter) : undefined
    }
  },

  tick() {
    if (this.dirty && this.imageEl.isReady) {
      this.updateTexture()
    }
  },

  createTexture() {
    this.imageEl = document.createElement("img")
    this.imageEl.width = 512
    this.imageEl.height = 512
    this.imageEl.isReady = true

    const texture = this.texture = new THREE.Texture(this.imageEl)

    // svg images take some time to process so it is important that we
    // perform each step when it is ready, otherwise we are caught in
    // an infinite loop displaying errors, which generates errors, 
    // which displays more errors
    this.imageEl.onload = () => {
      // console.info("loaded")
      texture.needsUpdate = true
    }

    this.imageEl.onerror = () => {
      // console.info("error")
      texture.image.isReady = true
    }

    texture.onUpdate = () => {
      // console.info("updated")
      texture.image.isReady = true
    }

    this.showTexture()
  },

  updateTexture() {
    const imageEl = this.imageEl
    const data = this.data
    const w = data.columnWidth * data.characterWidth
    const h = (data.maxLines + 1)*data.lineHeight

    function sanitizeMessage(str) {
      str = str.replace(/[^\x20-\x7E\n\t]/g, "") // ignore characters not in this set
      return str.replace(/[&<>'"]/g, (m) => m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === "'" ? "&apos;" : "&quot;") // XML character entity references
    }     

    function sanitizeXML(str) {
      return str.replace(/%/g, "%25").replace(/#/g, "%23")
    }
          
    const svgText = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" version="1.1">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#111"/>
      <style> text { font: ${data.font}; }></style>
      ${
        this.messages.map((message, row) => {
          const y = data.offset.y + data.lineHeight*(row + 1)
          const x = data.offset.x
          const msg = sanitizeMessage(message[1])
          return `<text x="${x}" y="${y}" fill="${LOGGER_COLORS[message[0]]}">${msg}</text>`
        }).join("\n")
      }
    </svg>`

    const newSVG = "data:image/svg+xml;utf8," + sanitizeXML(svgText)
    imageEl.src = newSVG
    imageEl.isReady = false
    // console.info("generated", newSVG)
    this.dirty = false
  },

  showTexture() {
    const mesh = this.el.getObject3D("mesh")
    if (mesh && mesh.material) {
      mesh.material.map = this.texture
    }
  },

  showMessage(type, msg) {
    const data = this.data

    if (!data.types.includes(type)) {
      return
    }

    if (this.filter && !this.filter.test(msg)) {
      return
    }

    const lines = msg.split("\n")

    for (let line of lines) {
      for (let i = 0, n = line.length; i < n; i += data.columnWidth) {
        this.messages.push([type, line.slice(i, Math.min(n, i + data.columnWidth))])
      }
    }

    while (this.messages.length >= this.data.maxLines) {
      this.messages.shift()
    }

    this.dirty = true
  },

  onObject3DSet(e) {
    this.showTexture()
  },
})

AFRAME.registerPrimitive("a-logger", {
  defaultComponents: {
    geometry: {primitive: "plane", height: 3, width: 3},
    material: {color: "white", shader: "flat", side: "double"}, // must be white for colors to show correctly
    logger: {},
  },

  mappings: {
    types: "logger.types",
    filter: "logger.filter",
  }
});

function sprintf(args) {
  if (args.length === 0) {
    return ""
  }

  let i = 1
  let str = args[0].toString().replace(/%(\.(\d+))?([cdfios])/g, (m, p1, p2, p3) => {
    let temp
    switch (p3) {
      case "c": i++; return "" // not supported
      case "d": 
      case "i": temp = parseInt(args[i++], 10); return p2 ? temp.toString().padStart(p2, '0') : temp
      case "f": temp = parseFloat(args[i++]); return p2 ? temp.toFixed(p2) : temp
      case "o": return "[object]"
      case "s": return args[i++]
    }
  })
  return str + (i < args.length ? " " + args.slice(i).join(" ") : "")
}