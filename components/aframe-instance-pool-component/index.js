const FLOATS_PER_COLOR = 4
const FLOATS_PER_POSITION = 3
const FLOATS_PER_QUATERNION = 4
const FLOATS_PER_SCALE = 3

const BLOCK_INDEX = 0
const BLOCK_SIZE = 1

AFRAME.registerComponent("instance-pool", {
  schema: {
    size: { default: 1000 },
    patchShader: { default: true },
  },

  init() {
    this.oldMesh = undefined
    this.positions = undefined
    this.colors = undefined
    this.quaternions = undefined
    this.scales = undefined
    this.instancedGeoemtry = undefined
    this.reservedCount = 0
    this.occupiedBlocks = []
    this.freeBlocks = []
    this.inCreateInstances = false

    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.onBeforeCompile = this.onBeforeCompile.bind(this)

    this.el.addEventListener("object3dset", this.onObject3DSet)
  },

  remove() {
    this.el.removeEventListener("object3dset", this.setobject3d)
    this.destroyInstances()
  },

  update() {
    this.createInstances()
  },

  onObject3DSet(e) {
    if ( !this.inCreateInstances && e.target === this.el && e.detail.type === "mesh" ) {
      this.destroyInstances()
      this.createInstances()
    }
  },

  createInstances() {
    const obj3D = this.el.getObject3D("mesh")
    const mesh = obj3D ? obj3D.getObjectByProperty("isMesh", true) : undefined // find the first mesh
    if (!mesh || !mesh.geometry || !mesh.material) {
      return
    }

    this.inCreateInstances = true
    this.oldMesh = mesh

    const data = this.data
    const instancedGeometry = new THREE.InstancedBufferGeometry().copy(mesh.geometry)

    const numInstances = data.size
    instancedGeometry.maxInstancedCount = 0

    const positions = this.positions && this.positions.length === numInstances ? this.positions : new Float32Array(numInstances*FLOATS_PER_POSITION)
    const scales = this.scales && this.scales.length === numInstances ? this.scales : new Float32Array(numInstances*FLOATS_PER_SCALE).fill(0) // scale to 0 to hide
    const colors = this.colors && this.colors.length === numInstances ? this.colors : new Float32Array(numInstances*FLOATS_PER_COLOR).fill(1)
    const quaternions = this.quaternions && this.quaternions === numInstances ? this.quaternions : new Float32Array(numInstances*FLOATS_PER_QUATERNION).map((x,i) => (i-3) % FLOATS_PER_QUATERNION ? 0 : 1)

    this.instancePosition = new THREE.InstancedBufferAttribute(positions, FLOATS_PER_POSITION)
    this.instanceQuaternion = new THREE.InstancedBufferAttribute(quaternions, FLOATS_PER_QUATERNION)
    this.instanceScale = new THREE.InstancedBufferAttribute(scales, FLOATS_PER_SCALE)
    this.instanceColor = new THREE.InstancedBufferAttribute(colors, FLOATS_PER_COLOR)

    instancedGeometry.setAttribute("instancePosition", this.instancePosition)
    instancedGeometry.setAttribute("instanceQuaternion", this.instanceQuaternion)
    instancedGeometry.setAttribute("instanceScale", this.instanceScale)
    instancedGeometry.setAttribute("instanceColor", this.instanceColor)

    let instancedMaterial = mesh.material

    if (data.patchShader) {
      // insert the instance logic into whatever standard shader the user has provided
      if (Array.isArray(mesh.material)) {
        instancedMaterial = mesh.material.map(x => x.clone())
        instancedMaterial.forEach(x => x.onBeforeCompile = this.onBeforeCompile(x.onBeforeCompile))
      } else {
        instancedMaterial = mesh.material.clone()
        instancedMaterial.onBeforeCompile = this.onBeforeCompile(instancedMaterial.onBeforeCompile)
      }
    }

    const instancedMesh = new THREE.Mesh(instancedGeometry, instancedMaterial)
    instancedMesh.frustumCulled = false

    this.el.setObject3D("mesh", instancedMesh)

    this.instancedGeoemtry = instancedGeometry
    this.positions = positions
    this.quaternions = quaternions
    this.scales = scales
    this.colors = colors
    this.reservedCount = 0
    this.freeBlocks = [[0, numInstances]] // blockIndex, number of instances
    this.occupiedBlocks = []

    this.inCreateInstances = false
    this.el.emit( "pool-available", { pool: this } )
  },

  destroyInstances() {
    if (this.oldMesh) {
      this.el.setObject3D("mesh", this.oldMesh)
      this.oldMesh = undefined
    }
    this.instancedGeoemtry = undefined
    this.positions = undefined
    this.quaternions = undefined
    this.scales = undefined
    this.colors = undefined
    this.freeBlocks = []
    this.occupiedBlocks = []
  },

  onBeforeCompile(oldOnBeforeCompileFn) {
    const oldFunction = oldOnBeforeCompileFn

    return function onBeforeCompile(shader) {
      if (oldFunction) {
        oldFunction(shader)
      }

      let vertexShader = shader.vertexShader
      let fragmentShader = shader.fragmentShader
  
      vertexShader = vertexShader.replace('void main()', `
      attribute vec3 instancePosition;
      attribute vec4 instanceQuaternion;
      attribute vec4 instanceColor;
      attribute vec3 instanceScale;
  
      varying vec4 vInstanceColor;
  
      vec3 applyQuaternion( const vec3 v, const vec4 q ) 
      {
        return v + 2. * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
      }
  
      void main()`)
  
      vertexShader = vertexShader.replace('#include <color_vertex>', `
      #include <color_vertex>
      vInstanceColor = instanceColor;`)
  
      vertexShader = vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = applyQuaternion( position*instanceScale, instanceQuaternion ) + instancePosition;`)
  
      vertexShader = vertexShader.replace('#include <defaultnormal_vertex>', `
      vec3 transformedNormal = normalMatrix * applyQuaternion( objectNormal/instanceScale, -instanceQuaternion );
      
      #ifdef FLIP_SIDED
        transformedNormal = - transformedNormal;
      #endif
  
      #ifdef USE_TANGENT
        vec3 transformedTangent = normalMatrix * applyQuaternion( objectTangent/instanceScale, -instanceQuaternion );
        #ifdef FLIP_SIDED
          transformedTangent = - transformedTangent;
        #endif
      #endif`)
  
      fragmentShader = fragmentShader.replace('#include <color_pars_fragment>', `
      #include <color_pars_fragment>
      varying vec4 vInstanceColor;`)
  
      fragmentShader = fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor *= vInstanceColor;`)
  
      shader.vertexShader = vertexShader
      shader.fragmentShader = fragmentShader
    }
  },

  isAvailable() {
    return !!this.instancedGeoemtry
  },

  reserveBlock(requestedSize) {
    if (requestedSize <= 0) {
      return undefined
    }

    // search in reverse, prefer to reuse released blocks
    for (let j = this.freeBlocks.length - 1; j >= 0; j--) {
      const block = this.freeBlocks[j]
      const remainder = block[BLOCK_SIZE] - requestedSize

      if (remainder >= 0) {
        const newBlock = [block[BLOCK_INDEX], requestedSize]
        this.occupiedBlocks.push(newBlock)

        this.instancedGeoemtry.maxInstancedCount = Math.max(this.instancedGeoemtry.maxInstancedCount, newBlock[BLOCK_INDEX] + newBlock[BLOCK_SIZE])

        if (remainder > 0) {
          block[BLOCK_INDEX] += requestedSize
          block[BLOCK_SIZE] = remainder
        } else {
          const i = this.freeBlocks
          this.freeBlocks.splice(i, 1)
        }

        return newBlock[BLOCK_INDEX]
      }
    }

    return undefined
  },  

  releaseBlock(index) {
    for (let i = 0; i < this.occupiedBlocks.length; i++) {
      const block = this.occupiedBlocks[i]
      if (block[BLOCK_INDEX] === index) {
        for (let j = index; j < index + block[BLOCK_SIZE]; j++) {
          this.setScaleAt(j, 0, 0, 0) // scale to 0 to hide
        }

        this.occupiedBlocks.splice(i, 1)
        this.freeBlocks.push(block)
        this.repartionBlocks(block)

        const lastOccupiedInstance = this.occupiedBlocks.reduce((highest, block) => Math.max(highest, block[BLOCK_INDEX] + block[BLOCK_SIZE]), 0)
        this.instancedGeoemtry.maxInstancedCount = Math.max(this.instancedGeoemtry.maxInstancedCount, lastOccupiedInstance)

        return true
      }
    }
    return false
  },

  repartionBlocks() {
    // go in reverse for simple removal, always removing the block with the largest index on a merge
    for (let mergeIndex = this.freeBlocks.length - 1; mergeIndex >= 0; mergeIndex--) {
      const mergeBlock = this.freeBlocks[mergeIndex]

      for (let j = 0; j < mergeIndex; j++) {
        const otherBlock = this.freeBlocks[j]
        if (otherBlock[BLOCK_INDEX] == mergeBlock[BLOCK_INDEX] + mergeBlock[BLOCK_SIZE]) {
          // otherBlock immediately after mergeBlock
          otherBlock[BLOCK_INDEX] = mergeBlock[BLOCK_INDEX]
          otherBlock[BLOCK_SIZE] += mergeBlock[BLOCK_SIZE]
          this.freeBlocks.splice(mergeIndex, 1)
          break
        } else if (otherBlock[BLOCK_INDEX] + otherBlock[BLOCK_SIZE] === mergeBlock[BLOCK_INDEX]) {
          // otherBlock immediately before mergeBlock
          otherBlock[BLOCK_SIZE] += mergeBlock[BLOCK_SIZE]
          this.freeBlocks.splice(mergeIndex, 1)
          break
        }
      }
    }
  },

  setColorAt(i, r, g, b, a) {
    const j = i*FLOATS_PER_COLOR
    this.colors[j] = r
    this.colors[j+1] = g
    this.colors[j+2] = b
    this.colors[j+3] = typeof a !== "undefined" ? a : 1
    this.instanceColor.needsUpdate = true
  },

  setPositionAt(i, x, y, z) {
    const j = i*FLOATS_PER_POSITION
    this.positions[j] = x
    this.positions[j+1] = y
    this.positions[j+2] = z
    this.instancePosition.needsUpdate = true
  },

  setScaleAt(i, x, y, z) {
    const j = i*FLOATS_PER_SCALE
    this.scales[j] = x
    this.scales[j+1] = typeof y !== "undefined" ? y : x
    this.scales[j+2] = typeof z !== "undefined" ? z : x
    this.instanceScale.needsUpdate = true
  },

  setQuaternionAt(i, x, y, z, w) {
    const j = i*FLOATS_PER_QUATERNION
    this.quaternions[j] = x
    this.quaternions[j+1] = y
    this.quaternions[j+2] = z
    this.quaternions[j+3] = w
    this.instanceQuaternion.needsUpdate = true
  },

  getPositionAt(i, out) {
    const j = i*FLOATS_PER_POSITION
    out.x = this.positions[j]
    out.y = this.positions[j+1]
    out.z = this.positions[j+2]
    return out
  },

  getColorAt(i, out) {
    const j = i*FLOATS_PER_COLOR
    out.r = this.colors[j]
    out.g = this.colors[j+1]
    out.b = this.colors[j+2]
    out.a = this.colors[j+3]
    return out
  },

  getScaleAt(i, out) {
    const j = i*FLOATS_PER_SCALE
    out.x = this.scales[j]
    out.y = this.scales[j+1]
    out.z = this.scales[j+2]
    return out
  },

  getQuaternionAt(i, out) {
    const j = i*FLOATS_PER_QUATERNION
    out.x = this.quaternions[j]
    out.y = this.quaternions[j+1]
    out.z = this.quaternions[j+2]
    out.w = this.quaternions[j+3]
    return out
  },

})