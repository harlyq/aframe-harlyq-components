import { rgbcolor } from "harlyq-helpers"
import { attribute } from "harlyq-helpers"
import { threeHelper } from "harlyq-helpers"

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

      threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, this.dest)
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

const proceduralVertexShader = `
varying vec2 vUv;
void main()
{
  vUv = uv;
  gl_Position = vec4( position, 1.0 );
}`

const proceduralFragmentShader = `
precision highp float;

// could use levels low, high, mid, black, white (mid maps to (black + white)/2)
float remap(float v, float amin, float amax, float bmin, float bmax)
{
  return (v - amin)*(bmax - bmin)/(amax - amin) + bmin;
}

float rand(const vec2 n)
{
  return fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);
}

float noise(const vec2 n)
{
  const vec2 d=vec2(0.0,1.0);
  vec2 b=floor(n), f=smoothstep(vec2(0.0), vec2(1.0), fract(n));
  return mix( mix( rand(b), rand(b+d.yx), f.x ), mix( rand(b+d.xy), rand(b+d.yy), f.x ), f.y );
}

float fbm(vec2 n) {
  float total=0.0,amplitude=1.0;

  for (int i=0; i<4; i++)
  {
    total+=noise(n)*amplitude;
    n+=n;
    amplitude*=0.5;
  }

  return total;
}

float turbulence(const vec2 P)
{
  float val=0.0;
  float freq=1.0;

  for (int i=0; i<4; i++)
  {
    val+=abs(noise(P*freq)/freq);
    freq*=2.07;
  }

  return val;
}

float roundF(const float number)
{
  return sign(number)*floor(abs(number)+0.5);
}

vec2 uvBrick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0)
  {
    xi=xi-0.5;
  }
  float nxi=roundF(xi);

  return vec2((xi-floor(xi))*numberOfBricksHeight,(yi-floor(yi))*numberOfBricksWidth);
}

float brick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight, const float jointWidthPercentage, const float jointHeightPercentage)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0) { xi = xi - 0.5; } // offset every second brick
  float nxi=roundF(xi);
  xi = abs(xi - nxi);
  yi = abs(yi - nyi);

  return 1. - clamp( min(yi/jointHeightPercentage, xi/jointWidthPercentage) + 0.2, 0., 1. );
}

float marble(const vec2 uv, float amplitude, float k)
{
  k = 6.28*uv.x/k;
  k += amplitude*turbulence(uv.xy);
  k = sin(k);
  k = .5*(k + 1.);
  k = sqrt( sqrt( sqrt(k) ) ); 
  return .2 + .75*k;
}

float checkerboard(const vec2 uv, const float numCheckers)
{
  float cx = floor(numCheckers * uv.x);
  float cy = floor(numCheckers * uv.y);
  return sign( mod(cx + cy, 2.) );
}

float gaussian(const vec2 uv)
{
  vec2 xy = (mod(uv, vec2(1.,1.)) - .5)*2.;
  float exponent = dot(xy,xy)/0.31831;
  return exp(-exponent);
}

vec2 uvTransform(const vec2 uv, const vec2 center, const vec2 scale, const float rad, const vec2 translate) 
{
  float c = cos(-rad);
  float s = sin(-rad);
  float x = (uv.x - translate.x - center.x);
  float y = (uv.y - translate.y - center.y);
  float x2 = (x*c + y*s)/scale.x + center.x;
  float y2 = (-x*s + y*c)/scale.y + center.y;
  return vec2(x2, y2);
}

vec2 uvCrop(const vec2 uv, const vec2 uvMin, const vec2 uvMax) 
{
  vec2 scale = 1./(uvMax - uvMin);
  return uvTransform(uv, vec2(0.), scale, 0., -uvMin*scale);
}

float normpdf(const float x, const float sigma)
{
  return .39894*exp(-.5*x*x/(sigma*sigma))/sigma;
}

vec4 blur13(const sampler2D image, const vec2 uv, const vec2 resolution, const float sigma)
{
  const int kernelWidth = 13;
  const int kSize = (kernelWidth)/2 - 1;
  float kernel[kernelWidth];

  float Z = 0.;

  for (int j = 0; j <= kSize; j++)
  {
    kernel[kSize + j] = kernel[kSize - j] = normpdf(float(j), sigma);
  }
  for (int j = 0; j < kernelWidth; j++)
  {
    Z += kernel[j];
  }

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color += kernel[kSize + j]*kernel[kSize + i]*texture2D( image, uv + vec2(float(i), float(j))/resolution );
    }
  }

  return color/(Z*Z);
}

// from glsl-voronoi-noise
const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
const vec2 mys = vec2(1e4, 1e6);

vec2 rhash(vec2 uv) {
  uv *= myt;
  uv *= mys;
  return fract(fract(uv / mys) * uv);
}

vec3 hash(vec3 p) {
  return fract(sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)),
    dot(p, vec3(57.0, 113.0, 1.0)),
    dot(p, vec3(113.0, 1.0, 57.0)))) *
  43758.5453);
}

float voronoi2d(const in vec2 point) {
  vec2 p = floor(point);
  vec2 f = fract(point);
  float res = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 b = vec2(i, j);
      vec2 r = vec2(b) - f + rhash(p + b);
      res += 1. / pow(dot(r, r), 8.);
    }
  }
  return pow(1. / res, 0.0625);
}
`