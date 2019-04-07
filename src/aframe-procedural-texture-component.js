// uses @shotamatsuda/rollup-plugin-glslify
// @ts-ignore
import proceduralVertexShader from "./procedural-vertex.glsl"
// @ts-ignore
import proceduralFragmentShader from "./procedural-fragment.glsl"
import { rgbcolor } from "harlyq-helpers"

AFRAME.registerSystem("procedural-texture", {
  init() {
    this.renderer = new THREE.WebGLRenderer({alpha: true});
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.autoClear = true; // when a shader fails we will see black, rather than the last shader output
  }
})

AFRAME.registerComponent("procedural-texture", {
  schema: {
    shader: { type: "string" },
    dest: { type: "selector" }
  },
  multiple: true,

  init() {
    this.dest = undefined
  },

  updateSchema(newData) {
    if (!this.data || this.data.shader !== newData.shader) {
      this.shaderProgram = ""
      this.uniforms = {}

      if (newData.shader) {
        let shaderEl = document.querySelector(newData.shader)
        if (shaderEl) {
          this.shaderProgram = shaderEl.textContent
        } else if (/main\(/.test(newData.shader)) {
          this.shaderProgram = newData.shader
        }
        this.uniforms = this.parseShaderUniforms(this.shaderProgram)
      }
    }

    const newSchema = this.uniformsToSchema(this.uniforms)
    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }
  },

  update(oldData) {
    const data = this.data

    if (data.dest !== oldData.dest) {
      this.dest = (data.dest && data.dest instanceof HTMLCanvasElement) ? data.dest : undefined
    }

    if (this.dest && this.shaderProgram) {
      if (!this.scene) {
        this.setupScene(this.dest, this.shaderProgram)
      }
      this.renderScene(data)
    }
  },

  setupScene(canvas, shader) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;
    
    this.uniforms = this.parseShaderUniforms(shader)
    const fullFragmentShader = proceduralFragmentShader + shader

    var shaderMaterial = new THREE.ShaderMaterial( {
      uniforms: this.uniforms,
      vertexShader: proceduralVertexShader,
      fragmentShader: fullFragmentShader,
    } );
  
    const mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), shaderMaterial );
    this.scene.add( mesh );
  
    // this.renderer = new THREE.WebGLRenderer({canvas, alpha: true});
    // this.renderer.setPixelRatio( window.devicePixelRatio );
    // this.renderer.setSize( canvas.width, canvas.height );
    // this.renderer.autoClear = true; // when a shader fails we will see black, rather than the last shader output

    this.ctx = canvas.getContext("2d")
  },
  
  renderScene(data) {
    this.updateUniforms(this.uniforms, data)

    // this.renderer.render( this.scene, this.camera );

    const canvas = this.ctx.canvas
    const width = canvas.width
    const height = canvas.height

    this.system.renderer.setSize( width, height );
    this.system.renderer.render( this.scene, this.camera );

    this.ctx.drawImage(this.system.renderer.domElement, 0, 0)

    // trigger an update for materials that use this canvas
    const root = this.el.sceneEl.object3D
    root.traverse((node) => {
      if (node.isMesh && node.material) {
        if (node.material.map && node.material.map.image === this.dest) {
          node.material.map.needsUpdate = true
        }
      }
    })
  },

  parseShaderUniforms(shader) {
    const varRegEx = /uniform (vec2|vec3|vec4|float|int|uint|bool) ([a-zA-Z0-9_]+);/
    let uniforms = {}
  
    shader.split("\n").forEach(line => {
      const match = varRegEx.exec(line)
      if (match) {
        const uniformType = match[1]
        const name = match[2]
        if (name) {
          const newUniform = uniforms[name] || this.allocateUniform(uniformType)
          uniforms[name] = newUniform
        }
      }
    })
  
    return uniforms
  },

  uniformsToSchema(uniforms) {
    let newSchema = []

    for (let key in uniforms) {
      const uniform = uniforms[key]
      switch (uniform.type) {
        case "float32array": 
        case "int32array":
          newSchema[key] = { type: "string" }
          break
        default:
          newSchema[key] = { type: uniform.type }
      }
    }

    return newSchema
  },
  
  updateUniforms(uniforms, data) {
    for (let name in uniforms) {
      const dataValue = data[name]
      const uniform = uniforms[name]
  
      if (typeof dataValue === "undefined") {
        console.warn(`no attribute for uniform: ${name}`)
      } else {
        switch (uniform.type) {
          case "number":
            uniform.value = parseFloat(dataValue)
            break
          case "boolean":
            uniform.value = !!dataValue
            break
          case "float32array":
          case "int32array":
            const vec = dataValue.split(" ").map(x => Number(x)).filter(x => !isNaN(x))
            if (vec.length > 0 && (uniform.value instanceof Float32Array || uniform.value instanceof Int32Array)) {
              uniform.value.set(vec)
            } else {
              let col = new Array(4).fill(1) // default alpha is 1
              uniform.value.set(rgbcolor.toArray(col, rgbcolor.parse(dataValue)).slice(0, uniform.value.length))
            }
            break
          default:
            break
        }
      }
    }
  },
  
  allocateUniform(type) {
    switch (type) {
      case "float":
      case "int": 
        return { type: "number", value: 0 }
      case "bool": 
        return { type: "boolean", value: false }
      case "ivec2":
      case "bvec2":
      case "vec2": 
        return { type: "float32array", value: new Float32Array(2) }
      case "vec3": 
        return { type: "float32array", value: new Float32Array(3) }
      case "vec4": 
        return { type: "float32array", value: new Float32Array(4) }
      case "ivec3": 
      case "bvec3":
        return { type: "int32array", value: new Int32Array(3) }
      case "ivec4": 
      case "bvec4":
        return { type: "int32array", value: new Int32Array(4) }
      default:
        console.warn(`unknown uniform type ${type}`)
    }
  }, 
})

