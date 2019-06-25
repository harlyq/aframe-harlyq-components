import { aframeHelper, attribute, rgbcolor, threeHelper } from "harlyq-helpers"

AFRAME.registerSystem("procedural-texture", {
  init() {
    this.renderer = undefined
    this.proceduralTextureComponents = []
  },

  registerComponent(component) {
    this.proceduralTextureComponents.push(component)
    
    if (!this.renderer) {
      this.createRenderer()
    }
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

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false})
    this.renderer.setPixelRatio( window.devicePixelRatio )
    this.renderer.autoClear = true; // when a shader fails we will see pink, rather than the last shader output
    this.renderer.setClearColor(new THREE.Color("purple"), 1.)
  },
})

AFRAME.registerComponent("procedural-texture", {
  dependencies: ["geometry"], // this is for the case where 'canvas' is not set
  schema: {
    shader: { type: "string" },
    canvas: { type: "selector" }
  },
  multiple: true,

  init() {
    this.canvas = undefined
    this.system.registerComponent(this)
  },

  remove() {
    this.system.unregisterComponent(this)
  },

  updateSchema(newData) {
    var isDeferred = false // must be a 'var' so the change in value at the end of this function is reflected in the closure

    if (typeof newData !== "object") {
      console.error(`invalid properties, expected format <property>:<value>; '${newData}'`)
    }
    
    if (!this.data || this.data.shader !== newData.shader) {
      this.shaderProgram = ""
      this.uniforms = {}

      if (newData.shader) {
        // if the loading is deferred i.e. from a file, then procedural texture
        // is generated once the file is loaded, but the schema will not be updated
        aframeHelper.loadTemplate( newData.shader, "main(", (text) => {
          this.shaderProgram = text 
          this.uniforms = this.parseShaderUniforms( this.shaderProgram )
          if (isDeferred) {
            this.updateProceduralTexture()
          }
        } )
      }
    }

    let newSchema = this.uniformsToSchema(this.uniforms)

    if (!newData.canvas) {
      newSchema.width = { type: "int", value: 256 }
      newSchema.height = { type: "int", value: 256 }
    }

    if (Object.keys(newSchema).length > 0) {
      this.extendSchema(newSchema)
    }

    isDeferred = true
  },

  update(oldData) {
    const data = this.data

    if (data.canvas !== oldData.canvas) {
      this.canvas = (data.canvas && data.canvas instanceof HTMLCanvasElement) ? data.canvas : undefined
    }

    if (!data.canvas && !this.canvas) {
      this.canvas = document.createElement("canvas")
      this.canvas.width = data.width || 256
      this.canvas.height = data.height || 256

      const mesh = this.el.getObject3D("mesh")
      if (mesh && mesh.material) {
        mesh.material.map = new THREE.CanvasTexture(this.canvas)
      }
    }

    if (this.canvas && this.shaderProgram) {
      this.updateProceduralTexture()
    }

    if (this.usesComponentTime()) {
      this.el.sceneEl.addBehavior(this) // can be called multiple times
    }
  },

  updateProceduralTexture() {
    if (!this.scene) {
      this.setupScene(this.canvas, this.shaderProgram)
    }

    this.updateUniforms(this.uniforms, this.data)
    this.renderScene()

    threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, this.canvas)
    this.system.updateProceduralTexturesUsingThisCanvas(this.canvas)
    this.canvas.dispatchEvent(new CustomEvent("loaded", {bubbles: false}));
  },

  usesComponentTime() {
    return "time" in this.uniforms && !("time" in this.attrValue)
  },

  tick(time) {
    if (!this.usesComponentTime()) {
      this.el.sceneEl.removeBehavior(this)
    } else {
      this.uniforms.time.value = time*0.001
      this.renderScene()
    }
  },

  setupScene(canvas, shader) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;
    
    this.uniforms = this.parseShaderUniforms(shader)
    const fullFragmentShader = shader.replace(/#include\s*<procedural-ext>/, PROCEDURAL_EXT)

    var shaderMaterial = new THREE.RawShaderMaterial( {
      uniforms: this.uniforms,
      vertexShader: PROCEDURAL_VERTEX_SHADER,
      fragmentShader: fullFragmentShader,
    } );
  
    const mesh = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), shaderMaterial );
    this.scene.add( mesh );
  
    this.ctx = canvas.getContext("2d")
  },
  
  renderScene() {
    const canvas = this.ctx.canvas
    const width = canvas.width
    const height = canvas.height
    const renderer = this.system.renderer

    renderer.setSize( width, height )
    renderer.render( this.scene, this.camera )

    this.ctx.clearRect(0, 0, width, height)
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
          aframeHelper.warn(`no attribute for uniform: ${name}`)
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
        aframeHelper.warn(`unknown uniform type ${type}`)
    }
  }, 
})

export const PROCEDURAL_VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;
void main()
{
  vUv = uv;
  gl_Position = vec4( position, 1.0 );
}`

export const PROCEDURAL_EXT = `
precision highp float;
precision highp int;

// FLOAT -> FLOAT
// could use levels low, high, mid, black, white (mid maps to (black + white)/2)
float remap(float v, float amin, float amax, float bmin, float bmax)
{
  return (v - amin)*(bmax - bmin)/(amax - amin) + bmin;
}

float roundF(const float number)
{
  return sign(number)*floor(abs(number)+0.5);
}

float quantize(const float v, const float quanta) {
  return floor(v/quanta)*quanta;
}

// VEC2 -> VEC2
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


// SAMPLER2D -> VEC4
float normpdf(const float x, const float sigma)
{
  return .39894*exp(-.5*x*x/(sigma*sigma))/sigma;
}

vec4 blur13(const sampler2D image, const vec2 uv, const vec2 resolution, const float sigma)
{
  const int kernelWidth = 13;
  const int kSize = kernelWidth/2 - 1;
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

vec4 terrase13(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 13; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

vec4 terrase5(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 5; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

vec4 terrase27(const sampler2D image, const vec2 uv, const vec2 resolution)
{
  const int kernelWidth = 27; // this must be const for webgl1
  const int kSize = kernelWidth/2 - 1;

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color = max( color, texture2D( image, uv + vec2(float(i), float(j))/resolution ) );
    }
  }

  return color;
}

// VEC2 -> FLOAT
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

// from glsl-voronoi-noise
const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
const vec2 mys = vec2(1e4, 1e6);

vec2 rhash(vec2 uv) {
  uv *= myt;
  uv *= mys;
  return fract(fract(uv / mys) * uv);
}

vec3 hash(const vec3 p) {
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

// from glsl-worley
// Permutation polynomial: (34x^2 + x) mod 289
vec3 permute(const vec3 x) {
  return mod((34.0 * x + 1.0) * x, 289.0);
}

vec3 dist(const vec3 x, const vec3 y) {
  return (x * x + y * y);
}

vec2 worley(const vec2 P, const float jitter) {
  float K= 0.142857142857; // 1/7
  float Ko= 0.428571428571 ;// 3/7
  vec2 Pi = mod(floor(P), 289.0);
  vec2 Pf = fract(P);
  vec3 oi = vec3(-1.0, 0.0, 1.0);
  vec3 of = vec3(-0.5, 0.5, 1.5);
  vec3 px = permute(Pi.x + oi);
  vec3 p = permute(px.x + Pi.y + oi); // p11, p12, p13
  vec3 ox = fract(p*K) - Ko;
  vec3 oy = mod(floor(p*K),7.0)*K - Ko;
  vec3 dx = Pf.x + 0.5 + jitter*ox;
  vec3 dy = Pf.y - of + jitter*oy;
  vec3 d1 = dist(dx,dy); // squared
  p = permute(px.y + Pi.y + oi); // p21, p22, p23
  ox = fract(p*K) - Ko;
  oy = mod(floor(p*K),7.0)*K - Ko;
  dx = Pf.x - 0.5 + jitter*ox;
  dy = Pf.y - of + jitter*oy;
  vec3 d2 = dist(dx,dy); // squared
  p = permute(px.z + Pi.y + oi); // p31, p32, p33
  ox = fract(p*K) - Ko;
  oy = mod(floor(p*K),7.0)*K - Ko;
  dx = Pf.x - 1.5 + jitter*ox;
  dy = Pf.y - of + jitter*oy;
  vec3 d3 = dist(dx,dy); // squared

  // Sort out the two smallest distances (F1, F2)
  vec3 d1a = min(d1, d2);
  d2 = max(d1, d2); // Swap to keep candidates for F2
  d2 = min(d2, d3); // neither F1 nor F2 are now in d3
  d1 = min(d1a, d2); // F1 is now in d1
  d2 = max(d1a, d2); // Swap to keep candidates for F2
  d1.xy = (d1.x < d1.y) ? d1.xy : d1.yx; // Swap if smaller
  d1.xz = (d1.x < d1.z) ? d1.xz : d1.zx; // F1 is in d1.x
  d1.yz = min(d1.yz, d2.yz); // F2 is now not in d2.yz
  d1.y = min(d1.y, d1.z); // nor in  d1.z
  d1.y = min(d1.y, d2.x); // F2 is in d1.y, we're done.
  return sqrt(d1.xy);
}
`