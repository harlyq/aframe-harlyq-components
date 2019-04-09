// uses @shotamatsuda/rollup-plugin-glslify
// @ts-ignore
import proceduralVertexShader from "./procedural-vertex.glsl"
// @ts-ignore
import proceduralFragmentShader from "./procedural-fragment.glsl"
import { rgbcolor } from "harlyq-helpers"
import { attribute } from "harlyq-helpers"
import { three_helper } from "harlyq-helpers"

AFRAME.registerSystem("procedural-texture", {
  init() {
    this.renderer = new THREE.WebGLRenderer({alpha: true});
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.autoClear = true; // when a shader fails we will see black, rather than the last shader output

    this.proceduralTextureComponents = []
  },

  registerComponent(component) {
    this.proceduralTextureComponents.push(component)
  },

  unregisterComponent(component) {
    const i = this.proceduralTextureComponents.indexOf(component)
    if (i !== -1) {
      this.proceduralTextureComponents.slice(i, 1)
    }
  },

  updateProceduralTexturesUsingThisCanvas(canvas, exceptComponent = undefined) {
    for (let component of this.proceduralTextureComponents) {
      if (exceptComponent === component) {
        continue
      }

      if (Object.keys(component.uniforms).some( (name) => {
        const uniform = component.uniforms[name]
        return uniform.type === "texture" && 
          (Array.isArray(uniform.value) ? uniform.value.any(texture => texture.image === canvas) : uniform.value.image === canvas)
      } )) {
        // if another procedural texture is using 
        component.update(component.data)
      }
    }
  },
})

AFRAME.registerComponent("procedural-texture", {
  dependencies: ["geometry"], // this is for the case where 'dest' is not set
  schema: {
    shader: { type: "string" },
    dest: { type: "selector" }
  },
  multiple: true,

  init() {
    this.dest = undefined
    this.system.registerComponent(this)
  },

  remove() {
    this.system.unregisterComponent(this)
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
        } else {
          console.warn(`unknown shader: ${newData.shader}`)
        }
        this.uniforms = this.parseShaderUniforms(this.shaderProgram)
      }
    }

    let newSchema = this.uniformsToSchema(this.uniforms)

    if (!newData.dest) {
      newSchema.width = { type: "int", value: 256 }
      newSchema.height = { type: "int", value: 256 }
    }

    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }
  },

  update(oldData) {
    const data = this.data

    if (data.dest !== oldData.dest) {
      this.dest = (data.dest && data.dest instanceof HTMLCanvasElement) ? data.dest : undefined
    }

    if (!data.dest && !this.dest) {
      this.dest = document.createElement("canvas")
      this.dest.width = data.width || 256
      this.dest.height = data.height || 256

      const mesh = this.el.getObject3D("mesh")
      if (mesh && mesh.material) {
        mesh.material.map = new THREE.CanvasTexture(this.dest)
      }
    }

    if (this.dest && this.shaderProgram) {
      if (!this.scene) {
        this.setupScene(this.dest, this.shaderProgram)
      }
      this.renderScene(data)

      three_helper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, this.dest)
      this.system.updateProceduralTexturesUsingThisCanvas(this.dest)
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
  },

  parseShaderUniforms(shader) {
    const varRegEx = /uniform (vec2|vec3|vec4|float|int|uint|bool|sampler2D) ([a-zA-Z0-9_]+)(\[(\d+)\])?;/
    let uniforms = {}
  
    shader.split("\n").forEach(line => {
      const match = varRegEx.exec(line)
      if (match) {
        const uniformType = match[1]
        const name = match[2]
        const arrayCount = typeof match[4] !== "undefined" ? parseInt(match[4], 10) : 0
        if (name) {
          const newUniform = uniforms[name] || this.allocateUniform(uniformType, arrayCount)
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
        case "texture":
          newSchema[key] = { type: "string" }
          break
        case "float32array": 
        case "int32array":
          newSchema[key] = { type: "string" }
          break
        default:
          newSchema[key] = { type: uniform.count > 1 ? "string" : uniform.type }
      }
    }

    return newSchema
  },
  
  updateUniforms: (function () {
    let colArray = new Array(4)
    const toNumber = x => Number(x)
    const isNumber = x => !isNaN(x)

    function setValue(type, dataValue, setFn, el = undefined) {
      switch (type) {
        case "texture":
          const materialSystem = el.sceneEl.systems["material"]
          const textureEl = document.querySelector(dataValue)          
          const textureRef = textureEl ? textureEl : dataValue
          materialSystem.loadTexture(textureRef, {src: textureRef}, (texture) => {
            setFn(texture)
          })
          break
        case "number":
          setFn(parseFloat(dataValue))
          break
        case "boolean":
          setFn(!!dataValue)
          break
        case "float32array":
        case "int32array":
          let vec = dataValue.split(" ").map(toNumber).filter(isNumber)
          if (vec.length == 0) {
            let col = rgbcolor.parse(dataValue)
            if (col) {
              colArray.fill(1) // default, white, alpha 1
              vec = rgbcolor.toArray(colArray, col)
            }
          }

          if (vec.length > 0) {
            setFn(vec)
          }
          break
      }
    }

    return function updateUniforms(uniforms, data) {
      for (let name in uniforms) {
        const dataStr = data[name]
        const uniform = uniforms[name]
    
        if (typeof dataStr === "undefined") {
          console.warn(`no attribute for uniform: ${name}`)
        } else {
          const dataValues = (typeof dataStr === "string" ? attribute.nestedSplit(dataStr) : [dataStr.toString()]).map(x => x.trim())
            
          if (uniform.arrayCount > 0) {
            for (let i = 0; i < dataValues.length; i++) {
              const dataValue = dataValues[i]

              switch (uniform.type) {
                case "texture":
                  setValue(uniform.type, dataValue, v => uniform.value[i] = v, this.el)
                  break
                case "number":
                case "boolean":
                  setValue(uniform.type, dataValue, v => uniform.value[i] = v, this.el)
                  break
                case "float32array":
                case "in32array":
                  setValue(uniform.type, dataValue, v => uniform.value.set(v.slice(0, uniform.size), i*uniform.size))
                  break
              }
            }
          } else {
            switch (uniform.type) {
              case "texture": 
              case "number":
              case "boolean":
                setValue(uniform.type, dataValues[0], v => uniform.value = v, this.el)
                break
              case "float32array":
              case "in32array":
                setValue(uniform.type, dataValues[0], v => uniform.value.set(v.slice(0, uniform.size)))
                break
            }
          }
        }
      }
    }
  })(),
  
  allocateUniform(type, arrayCount) {
    const blockCount = Math.max(1, arrayCount)
    switch (type) {
      case "sampler2D":
        return { type: "texture", value: arrayCount > 0 ? new Array(arrayCount).fill(undefined) : undefined, arrayCount }
      case "float":
      case "int": 
        return { type: "number", value: arrayCount > 0 ? new Array(arrayCount).fill(0) : 0, arrayCount }
      case "bool": 
        return { type: "boolean", value: arrayCount > 0 ? new Array(arrayCount).fill(false) : false, arrayCount }
      case "ivec2":
      case "bvec2":
      case "vec2": 
        return { type: "float32array", value: new Float32Array(2*blockCount), size: 2, arrayCount }
      case "vec3": 
        return { type: "float32array", value: new Float32Array(3*blockCount), size: 3, arrayCount }
      case "vec4": 
        return { type: "float32array", value: new Float32Array(4*blockCount), size: 4, arrayCount }
      case "ivec3": 
      case "bvec3":
        return { type: "int32array", value: new Int32Array(3*blockCount), size: 3, arrayCount }
      case "ivec4": 
      case "bvec4":
        return { type: "int32array", value: new Int32Array(4*blockCount), size: 4, arrayCount }
      default:
        console.warn(`unknown uniform type ${type}`)
    }
  }, 
})

