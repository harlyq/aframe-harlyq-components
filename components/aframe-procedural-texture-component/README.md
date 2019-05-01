## procedural-texture

A component for generating texture images from a fragment shader.  uniform values in the shader can be set via attributes on the component, and the output (**canvas**) can be set to a canvas, or will modify the diffuse map of the current entity.  A number of helpful procedural image functions are also provided to the shader.

In the fragment shader `varying vec2 vUv` is forwarded from the vertex shader. (0,0) represents the bottom left of the texture and (1,1) the top right.

Although procedural textures can be updated at run-time, it is computationally expensive to do so, so consider an alterantive approach if animated textures are needed.

This component can appear multiple times on a single entity

**WARNING**: glsl functions are non-trivial to debug, incorrect shader code fail with a console error and produce purple textures

e.g.
```html
  <a-assets>
    <script id="gaussianshader" type="x-shader/x-fragment">
      #include <procedural-ext>
      uniform vec4 backgroundColor;
      uniform vec4 fillColor;

      varying vec2 vUv;

      void main()
      {
        vec4 color = mix(backgroundColor, fillColor, gaussian(vUv));
        gl_FragColor = color;
      }
    </script>
    <canvas id="guassiancanvas" width="1024" height="1024">
  <a-assets>
  <a-entity id="writesToCanvas"
    procedural-texture__gaussian="shader: #gaussianshader; canvas: #gaussiancanvas; backgroundColor: blue; fillColor: white"></a-entity>
  <a-box id="usesCanvas" position="-2 0 -2" material="src:#gaussiancanvas"></a-box>
  <a-box id="doesNotUseCanvas" position="2 0 -2" 
    procedural-texture="shader: #gaussianshader; backgroundColor: orange; fillColor: black"></a-box>
```
This has two examples of procedural textures.  The first, `#writeToCanvas` sets the **shader** to the script tag which contains the fragment shader code.  The shader is using `#include <procedural-ext>`, which is a set of useful procedural functions provided by the component (including `gaussian`). The **canvas** is set to the 1024x1024 `#gaussiancanvas`, and the uniforms **backgroundColor** and **fillColor** which appear in the shader, will be set to `blue` and `white` respectively.  To use the procedural canvas the box `#useCanvas` sets **material.src** to the `#gaussiancanvas`

The second example has the procedural texture on the same a-entity that is going to use it, so there is no **canvas** property and no **material.src** property, and this time the **backgroundColor** is `orange` and the **fillColor** `black`

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

If **time** is used as a uniform and it is not explicitly defined in the **procedural-texture** component, then the procedural texture will be updated every frame with the time set to the number of seconds since the component was started. 
Because procedural textures go through an intermediate render step it can become computationally expensive, so if the material will only be used a couple of times consider writing a custom shader.

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

represents a value to be passed to the **uniform** in the **shader**.  The attribute values are defined in [Mapping uniform to attribute](#mapping).

# \#include <procedural-ext>
## float -> float glsl functions

`float quantize(float v, float quanta)`

returns v rounded to the nearest quanta multiple

---
`float remap(float v, float amin, float amax, float bmin, float bmax)`

remaps value **v** over the range **amin** to **amax**, into the new range **bmin** to **bmax**

---
`float roundF(float number)`

returns the truncated version of **number** + .5

## vec2 -> vec2 glsl functions

---
`vec2 uvBrick(vec2 uv, float numberOfBricksWidth, float numberOfBricksHeight)`

remaps uv into a new space (**numberOfBricksWidth**, **numberOfBricksHeight**), where every second row of bricks is offset by .5

---
`vec2 uvCrop(vec2 uv, vec2 uvMin, vec2 uvMax)`

remaps a cropped uv from **uvMin**:**uvMax** into (0,0):(1,1)

---
`vec2 uvTransform(vec2 uv, vec2 center, vec2 scale, float rad, vec2 translation)`

remaps uv into a new space which can have **scale**, **rad** rotations about **center** and **translation**

## sampler2d, vec2 -> vec4 glsl functions

---
`vec4 blur13(sampler2D image, vec2 uv, vec2 resolution, float sigma)`

returns a blured color, given an **image**, a **uv**, an original pixel **resolution** for the image and a **sigma** for the blur amount

---
`vec4 terrase5(sampler2D image, vec2 uv, vec2 resolution)`

returns the maximum color of a 5x5 square centered around a given **uv** at a given pixel **resolution**

---
`vec4 terrase13(sampler2D image, vec2 uv, vec2 resolution)`

returns the maximum color of a 13x13 square centered around a given **uv** at a given pixel **resolution**

---
`vec4 terrase27(sampler2D image, vec2 uv, vec2 resolution)`

returns the maximum color of a 27x27 square centered around a given **uv** at a given pixel **resolution**

## vec2 -> float glsl functions

`float brick(vec2 uv, float numberOfBricksWidth, float numberOfBricksHeight, float jointWidthPercentage, float jointHeightPercentage)`

returns a brick pattern in uv space where 1 represents the joint and 0 the brick. **numberOfBricksWidth** x **numberOfBricksHeight** are applied over the (1,1) uv space

---
`float checkerboard(vec2 uv, float numCheckers)`

returns a checkboard in uv space where 0 represents the bottom-left square, and 1 the alternate squares.

---
`float fbm(vec2 n)`

map of fractal brownian motion

---
`float gaussian(vec2 uv)`

returns a gaussian curve in uv space with a maxima about (.5,.5)

---
`float marble(vec2 uv, float amplitude, float k)`

returns a marble pattern in the uv space where 0 represents a crack and 1 the marble. **amplitude** affects the width of the marble streaks and **k** affects the roughness of the streaks

---
`float noise(vec2 n)`

map of perlin noise

---
`float rand(vec2 n)`

map of pseudo random noise

---
`float turbulence(vec2 P)`

map of turbulence (using noise)

---
`float voronoi2d(vec2 point)`

map of voronoi cells (see https://en.wikipedia.org/wiki/Voronoi_diagram)

---
`vec2 worley(vec2 P, float jitter)`

map or worley noise (see https://en.wikipedia.org/wiki/Worley_noise). a jitter of 0 will produce a grid, whilst higher values tend to look like voronoi patterns

