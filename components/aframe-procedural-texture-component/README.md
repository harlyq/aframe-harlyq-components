## procedural-texture

A component for generating texture images from a fragment shader.  uniform values in the shader can be set via attributes on the component, and the output (**canvas**) can be set to a canvas, or will modify the diffuse map of the current entity.  A number of helpful procedural image functions are also provided to the shader.

In the fragment shader `varying vec2 vUv` is forwarded from the vertex shader. (0,0) represents the bottom left of the texture and (1,1) the top right.

This component can appear multiple times on a single entity

e.g.
```html
  <a-assets>
    <script id="gaussianshader" type="x-shader/x-fragment">
      uniform vec4 backgroundColor;
      uniform vec4 fillColor;

      varying vec2 vUv;

      void main()
      {
        vec4 color = mix(backgroundColor, fillColor, gaussian(vUv));
        gl_FragColor = color;
      }
    </script>
    <canvas id="guassianCanvas" width="1024" height="1024">
  <a-assets>
  <a-entity id="writesToCanvas"
    procedural-texture__gaussian="shader: #gaussianshader; canvas: #gaussian; backgroundColor: blue; fillColor: white"></a-entity>
  <a-box id="usesCanvas" position="-2 0 -2" material="src:#gaussianCanvas"></a-box>
  <a-box id="doesNotUseCanvas" position="2 0 -2" 
    procedural-texture="shader: #gaussianshader; backgroundColor: orange; fillColor: black"></a-box>
```

## Mapping uniform to attribute
| uniform | attribute |
| - | - |
| `uniform vec4 rgba;` | **rgba** - a space separated string, or a color e.g. `rgba(255,200,100,0.5)` |
| `uniform vec3 col;` | **col** - a space separated string, or a color e.g. `red` or `.1 .5 -.1` |
| `uniform vec2 pos;` | **pos** - a space separate string e.g. `6 7` |
| `uniform bool on;` | **on** - a boolean string e.g. `true` |
| `uniform float height;` | **height** - a number e.g. `-6.7` |
| `uniform int size;` | **size** - an integer e.g. `13` |
| `uniform sampler2D texture;` | **texture** - a url, asset or reference to a canvas e.g. `#mycanvas` or `url(image.jpg);` |
| `uniform float a[3];` | **a** - a comma separated array, e.g. `1,2,3` |
| `uniform vec4 colors[3];` | **colors** - a comma separated array of space separated numbers, or colors e.g. `red, .5 .6 1 .5, rgb(100%,0,0)` |

## Properties

**canvas** : string = ""

specifies a canvas to write to.  If not defined, then the procedural texture is applied to the component's entity's "mesh" material

---
**height** : number = 256

defines the hieght of the internal canvas. Ignored if **canvas** is set

---
**shader** : string = ""

css selector for the shader to use

---
**width** : number = 256

used to define the width of the internal canvas.  Ignored if **canvas** is set

---
**\<uniform\>** : value

represents a value to be passed to the **uniform** in the **shader**.  The attribute values are defined in [Mapping uniform to attribute](#mapping)

## Additional glsl Functions

`float remap(float v, float amin, float amax, float bmin, float bmax)`

remaps value **v** over the range **amin** to **amax**, into the new range **bmin** to **bmax**

---
`float rand(const vec2 n)`

map of pseudo random noise

---
`float noise(const vec2 n)`

map of perlin noise

---
`float fbm(vec2 n)`

map of fractal brownian motion

---
`float turbulence(const vec2 P)`

map of turbulence

---
`float roundF(const float number)`

returns the truncated version of **number** + .5

---
`vec2 uvBrick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight)`

remaps uv into a new space (**numberOfBricksWidth**, **numberOfBricksHeight**), where every second row of bricks is offset by .5

---
`float brick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight, const float jointWidthPercentage, const float jointHeightPercentage)`

returns a brick pattern in uv space where 1 represents the joint and 0 the brick. **numberOfBricksWidth** x **numberOfBricksHeight** are applied over the (1,1) uv space

---
`float marble(const vec2 uv, float amplitude, float k)`

returns a marble pattern in the uv space where 0 represents a crack and 1 the marble. **amplitude** affects the width of the marble streaks and **k** affects the roughness of the streaks

---
`float checkerboard(const vec2 uv, const float numCheckers)`

returns a checkboard in uv space where 0 represents the bottom-left square, and 1 the alternate squares.

---
`float gaussian(const vec2 uv)`

returns a gaussian curve in uv space with a maxima about (.5,.5)

---
`vec2 uvTransform(const vec2 uv, const vec2 center, const vec2 scale, const float rad, const vec2 translation)`

remaps uv into a new space which can have **scale**, **rad** rotations about **center** and **translation**

---
`vec2 uvCrop(const vec2 uv, const vec2 uvMin, const vec2 uvMax)`

remaps a cropped uv from **uvMin**:**uvMax** into (0,0):(1,1)

---
`vec4 blur13(const sampler2D image, const vec2 uv, const vec2 resolution, const float sigma)`

returns a blured color, given an **image**, a **uv**, an original pixel **resolution** for the image and a **sigma** for the blur amount




