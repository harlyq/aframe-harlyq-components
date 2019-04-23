const FLOATS_PER_COLOR = 4
const FLOATS_PER_POSITION = 3
const FLOATS_PER_QUATERNION = 4
const FLOATS_PER_SCALE = 3

AFRAME.registerComponent("instance", {
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

    this.onSetObject3D = this.onSetObject3D.bind(this)
    this.patchInstancesIntoShader = this.patchInstancesIntoShader.bind(this)

    this.el.addEventListener("setobject3d", this.onSetObject3D)
  },

  remove() {
    this.el.removeEventListener("setobject3d", this.setobject3d)
    this.destroyInstances()
  },

  update() {
    this.createInstances()
  },

  onSetObject3D(e) {
    if (e.target === this.el && e.detail.type === "mesh") {
      this.destroyInstances()
      this.createInstances()
    }
  },

  createInstances() {
    const mesh = this.el.getObject3D("mesh")
    if (!mesh || !mesh.geometry || !mesh.material) {
      return
    }

    this.oldMesh = mesh

    const data = this.data
    const instancedGeometry = new THREE.InstancedBufferGeometry().copy(mesh.geometry)

    const numInstances = data.size
    instancedGeometry.maxInstancedCount = 0

    const positions = this.positions && this.positions.length === numInstances ? this.positions : new Float32Array(numInstances*FLOATS_PER_POSITION)
    const scales = this.scales && this.scales.length === numInstances ? this.scales : new Float32Array(numInstances*FLOATS_PER_SCALE).fill(1)
    const colors = this.colors && this.colors.length === numInstances ? this.colors : new Float32Array(numInstances*FLOATS_PER_COLOR).fill(1)
    const quaternions = this.quaternions && this.quaternions === numInstances ? this.quaternions : new Float32Array(numInstances*FLOATS_PER_QUATERNION).map((x,i) => (i-3) % FLOATS_PER_QUATERNION ? 0 : 1)

    this.instancePosition = new THREE.InstancedBufferAttribute(positions, FLOATS_PER_POSITION)
    this.instanceQuaternion = new THREE.InstancedBufferAttribute(quaternions, FLOATS_PER_QUATERNION)
    this.instanceScale = new THREE.InstancedBufferAttribute(scales, FLOATS_PER_SCALE)
    this.instanceColor = new THREE.InstancedBufferAttribute(colors, FLOATS_PER_COLOR)

    instancedGeometry.addAttribute("instancePosition", this.instancePosition)
    instancedGeometry.addAttribute("instanceQuaternion", this.instanceQuaternion)
    instancedGeometry.addAttribute("instanceScale", this.instanceScale)
    instancedGeometry.addAttribute("instanceColor", this.instanceColor)

    let instancedMaterial = mesh.material

    if (data.patchShader) {
      // insert the instance logic into whatever standard shader the user has provided
      if (Array.isArray(mesh.material)) {
        instancedMaterial = mesh.material.map(x => x.clone())
        instancedMaterial.forEach(x => x.onBeforeCompile = this.patchInstancesIntoShader)
      } else {
        instancedMaterial = mesh.material.clone()
        instancedMaterial.onBeforeCompile = this.patchInstancesIntoShader
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
  },

  destroyInstances() {
    if (this.oldMesh) {
      this.el.setObject3D("mesh", this.oldMesh)
      this.oldMesh = undefined
    }
  },

  patchInstancesIntoShader(shader) {
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
  },

  reserveBlock(requested) {
    const total = this.data.size
    const reserved = this.reservedCount
    if (reserved + requested < total) {
      this.reservedCount += requested
      this.instancedGeoemtry.maxInstancedCount = this.reservedCount
      return reserved
    }
    return -1
  },

  releaseBlock(index) {
    console.warn("releaseBlock not supported")
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