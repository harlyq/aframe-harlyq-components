import { aframeHelper, cardHelper, domHelper, instanced, nafHelper, utils } from "harlyq-helpers"

AFRAME.registerSystem("card-pack", {
  ...nafHelper.networkSystem("card-pack"),

  init() {
    this.setupNetwork()
  },

  remove() {
    this.shutdownNetwork()
  },
})

AFRAME.registerComponent("card-pack", {
  schema: {
    src: { type: "asset", default: "https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/assets/Svg-cards-2.0.svg" },
    textureRows: { default: 5 },
    textureCols: { default: 13 },
    width: { default: .67 },
    height: { default: 1 },
    numCards: { default: 54 },
    grabbable: { default: true },
    hoverColor: { type: "color", default: "#888" },
    frontStart: { default: 0 },
    back: { default: 54 },
    yOffset: { default: 0.001 },
    faceDown: { default: false },
    debug: { default: false },
  },

  init() {
    this.onGrabStart = this.onGrabStart.bind(this)
    this.onGrabEnd = this.onGrabEnd.bind(this)
    this.onHoverStart = this.onHoverStart.bind(this)
    this.onHoverEnd = this.onHoverEnd.bind(this)
    this.grabbedData = new Map() // map of handEl, {number, Matrix4}
    this.hoverIndices = []
    this.hoverColor = new THREE.Color()
    this.controllerIds = [] // sparse array

    this.el.addEventListener("grabstart", this.onGrabStart)
    this.el.addEventListener("grabend", this.onGrabEnd)
    this.el.addEventListener("hoverstart", this.onHoverStart)
    this.el.addEventListener("hoverend", this.onHoverEnd)

    this.system.registerNetworking(this, {
      onClientDisconnected: this.onClientDisconnected.bind(this),
      onOwnershipGained: this.onOwnershipGained.bind(this),
      onOwnershipLost: this.onOwnershipLost.bind(this),
      receiveNetworkData: this.receiveNetworkData.bind(this),
      requestSync: this.requestSync.bind(this),
    })
  },

  remove() {
    this.system.unregisterNetworking(this)

    this.el.removeEventListener("grabstart", this.onGrabStart)
    this.el.removeEventListener("grabend", this.onGrabEnd)
    this.el.removeEventListener("hoverstart", this.onHoverStart)
    this.el.removeEventListener("hoverend", this.onHoverEnd)
  },

  update(oldData) {
    const data = this.data

    let materialSystem = this.el.sceneEl.systems["material"]
    materialSystem.loadTexture(data.src, {src: data.src}, (texture) => {
      this.pack.packInstancedMesh.material.map = texture
      this.pack.packInstancedMesh.material.needsUpdate = true
    })

    if (oldData.hoverColor !== data.hoverColor) {
      this.hoverColor.setStyle(data.hoverColor)
    }

    this.updateDeck()

    if (oldData.grabbable !== data.grabbable) {
      this.grabbedData.clear()

      if (data.grabbable) {
        this.updateGrabbable(0, data.numCards)
      } else {
        this.updateGrabbable(oldData.numCards, 0)
      }
    } else if (data.grabbable) {
      this.updateGrabbable(oldData.numCards, data.numCards)
    }
  },

  tick(_, deltaTime) {
    const dt = deltaTime/1000
    this.tickGrab(dt)
  },

  updateDeck() {
    const data = this.data
    const pos = new THREE.Vector3()

    this.pack = cardHelper.createPack(data.numCards, null, data.textureRows, data.textureCols, data.width, data.height )

    const instancedMesh = this.pack.packInstancedMesh
    this.el.object3D.add(instancedMesh)

    for (let i = 0; i < data.numCards; i++) {
      const index = cardHelper.createCard(this.pack, data.frontStart + i, data.back)

      pos.set(0, i*data.yOffset, 0)
      instanced.setPositionAt(instancedMesh, index, pos)

      if (data.faceDown) {
        instanced.setQuaternionAt(instancedMesh, index, 1, 0, 0, 0)
      }

    }
  },

  tickGrab(dt) {
    for (let item of this.grabbedData) {
      const [index, offsetMatrix] = item[1]
      const hand = item[0]
      const hand3D = hand.object3D
      instanced.applyOffsetMatrix(hand3D, this.pack.packInstancedMesh, index, offsetMatrix)
    }
  },

  updateGrabbable(oldNumCards, numCards) {
    const grabSystem = this.el.sceneEl.systems["grab-system"]
    if (grabSystem && numCards !== oldNumCards) {
      const el = this.el
      const obj3D = this.pack.packInstancedMesh

      for (let instanceIndex = numCards; instanceIndex < oldNumCards; instanceIndex++) {
        grabSystem.unregisterTarget(el, {obj3D, instanceIndex})
      }

      for (let instanceIndex = oldNumCards; instanceIndex < numCards; instanceIndex++) {
        grabSystem.registerTarget(el, {obj3D, instanceIndex, score: "raycast"})
      }
    }
  },
  
  updateGrabbedData(hand, newIndex) {
    const data = this.grabbedData.get(hand)
    const oldIndex = data ? data[0] : undefined

    if (oldIndex !== newIndex) {
      if (nafHelper.isNetworked(this)) {

        if (oldIndex) {
          this.sendControlPacket(oldIndex, "")
        }
  
        if (newIndex) {
          this.sendControlPacket(newIndex, NAF.client)
        }
      }
  
      if (typeof newIndex !== "undefined") {
        const offsetMatrix = instanced.calcOffsetMatrix(hand.object3D, this.pack.packInstancedMesh, newIndex)
        this.grabbedData.set(hand, [newIndex, offsetMatrix])
      } else {
        this.grabbedData.delete(hand)
      }
    }
  },

  getPack() {
    return this.pack
  },

  onGrabStart(event) {
    const data = this.data
    if (data.grabbable && this.pack && event.detail.obj3D === this.pack.packInstancedMesh) {
      const hand = event.detail.hand
      const instanceIndex = event.detail.instanceIndex

      if (data.debug) {
        aframeHelper.log(this, "grabstart", domHelper.getDebugName(hand), event.detail.instanceIndex)
      }

      this.updateGrabbedData(hand, this.canControl(instanceIndex) ? instanceIndex : undefined)
    }
  },

  onGrabEnd(event) {
    const data = this.data
    if (data.grabbable && this.pack && event.detail.obj3D === this.pack.packInstancedMesh) {
      const hand = event.detail.hand

      if (data.debug) {
        aframeHelper.log(this, "grabend", domHelper.getDebugName(hand), event.detail.instanceIndex)
      }

      this.updateGrabbedData(hand, undefined)
    }
  },

  onHoverStart(event) {
    if (this.pack && event.detail.obj3D === this.pack.packInstancedMesh) {
      if (this.data.debug) {
        aframeHelper.log(this, "hoverstart", domHelper.getDebugName(event.detail.hand), event.detail.instanceIndex)
      }

      this.hoverIndices = utils.exchangeArray(
        this.hoverIndices,
        this.hoverIndices.concat(event.detail.instanceIndex),
        (index) => instanced.setColorAt(this.pack.packInstancedMesh, index, this.hoverColor)
      )
    }
  },

  onHoverEnd(event) {
    if (this.pack && event.detail.obj3D === this.pack.packInstancedMesh) {
      if (this.data.debug) {
        aframeHelper.log(this, "hoverend", domHelper.getDebugName(event.detail.hand), event.detail.instanceIndex)
      }

      const newHoverIndices = this.hoverIndices.slice()
      newHoverIndices.splice( newHoverIndices.indexOf(event.detail.instanceIndex) )

      this.hoverIndices = utils.exchangeArray(
        this.hoverIndices,
        newHoverIndices,
        undefined,
        (index) => instanced.setColorAt(this.pack.packInstancedMesh, index, 1, 1, 1)
      )
    }
  },

  /* Networking */
  // can be called outside of a networked client
  canControl(index) {
    if (nafHelper.isNetworked(this)) {
      return !this.controllerIds[index] || this.controllerIds[index] === NAF.clientId
    } else {
      return true
    }
  },

  // can only be called from a networked client
  sendControlPacket(index, controllerId) {
    if (this.canControl(index)) {
      const instancedMesh = this.pack.packInstancedMesh
      const position = {x:0,y:0,z:0}
      const quaternion = {x:0,y:0,z:0,w:0}
      const owner = NAF.utils.getNetworkOwner(this.el)

      const packet = {
        command: undefined,
        index,
        controllerId,
        position: instanced.getPositionAt(instancedMesh, index, position),
        quaternion: instanced.getQuaternionAt(instancedMesh, index, quaternion),
      }

      if (NAF.clientId === owner) {
        packet.command = "control" // only the owner can broadcast *control* messages
        this.system.broadcastNetworkData(this, packet)
      } else {
        packet.command = "request" // everyone else sends a *request* to the owner, who will later broadcast a *control*
        this.system.sendNetworkData(this, packet, owner)
      }
    }
  },

  applyControlPacket(packet) {
    const instancedMesh = this.pack.packInstancedMesh
    const index = packet.index

    if (packet.controllerId) {
      this.controllerIds[index] = packet.controllerId
    } else {
      delete this.controllerIds[index]
    }

    instanced.setPositionAt(instancedMesh, index, packet.position)
    instanced.setQuaternionAt(instancedMesh, index, packet.quaternion)
  },

  getSetupPacket() {
    if (this.pack) {
      const instancedMesh = this.pack.packInstancedMesh
      return {
        command: "setup",
        positions: Array.from(instancedMesh.geometry.getAttribute("instancePosition").array),
        quaternions: Array.from(instancedMesh.geometry.getAttribute("instanceQuaternion").array),
        controllerIds: this.controllerIds,
      }
    }
  },

  requestSync(senderId) {
    this.system.sendNetworkData(this, this.getSetupPacket(), senderId)
  },

  receiveNetworkData(packet, senderId) {
    const owner = NAF.utils.getNetworkOwner(this.el)
    const fromOwner = senderId === owner

    switch (packet.command) {
      case "setup":
        if (fromOwner) {
          const instancedMesh = this.pack.packInstancedMesh
          const instancePosition = instancedMesh.geometry.getAttribute("instancePosition")
          const instanceQuaterion = instancedMesh.geometry.getAttribute("instanceQuaternion")
          
          instancePosition.copyArray(packet.positions)
          instanceQuaterion.copyArray(packet.quaternions)
          instancePosition.needsUpdate = true
          instanceQuaterion.needsUpdate = true

          this.controllerIds = packet.controllerIds
        }
        break

      case "request":
        if (owner === NAF.clientId) {
          const index = packet.index
          if (!this.controllerIds[index] || this.controllerIds[index] === senderId) {
            this.applyControlPacket(packet)
            this.sendControlPacket(index, packet.controllerId)
          }
        }
        break
      
      case "control":
        if (fromOwner) {
          this.applyControlPacket(packet)
        }
        break
    }
  },

  onClientDisconnected(event) {
    const clientId = event.detail.clientId

    for (let i = 0; i < this.controllerIds.length; i++) {
      if (this.controllerIds[i] === clientId) {
        this.controllerIds[i] = ""
      }
    }
  },

  onOwnershipGained() {
    if (this.data.debug) {
      console.log("ownership-gained")
    }

    this.system.broadcastNetworkData(this, this.getSetupPacket())
  },

  onOwnershipLost() {
    if (this.data.debug) {
      console.log("ownership-lost")
    }
  },
})

