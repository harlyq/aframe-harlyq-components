## simple-particles

**simple-particles** work with **simple-emitters** to provide various GL_POINT based particle fx with a single draw call.  The **simple-particles** component defines the texture and number of particles, whilst the **simple-emitter** defines the appearance and motion of each particle fx.

e.g.
```html
<a-entity simple-particles="name: test; src: url(test.png)"></a-entity>
<a-entity simple-emitter="particles: test"></a-entity>
```

Mulitple **simple-particle** components can be placed on a single entity.

⚠️ do not place a **simple-particle** on an **a-scene**, it must be on an entity within the world.

## Properties

**alphaTest** : number = 0

pixels with alpha values below this threshold are not drawn.  This is a simpler alternative to transparency when working with particles

**blending** : `none` | `normal` | `additive` | `subtractive` | `multiply` | `normal` = `normal`

how each particle is drawn

**count** : number = 1000

the maximum number of particles in the system. emitters are given particles on the first in first served basis, and will be denied particles if there are no further particles to allocate. The larger this number the more GPU resources that are used for the particle systems

**depthTest** : boolen = true

if `true`, only draw the particle if is closer to the camera then other objects in the scene. if `false`, always draw the particle

**depthWrite** : boolen = true

if `true`, then write its position into the depth buffer when drawing this particle. this works in conjunction with **depthTest**, to have objects nearer to the camera occlude objects further from the camera

**fog** : boolen = true

if `true`, then these particles are affected by the fog settings

**name** : string = `particles`

a unique name for this particle system, individual emitters will reference this name to obtain particles

**particleSize** : number = 10

the size of each particle in pixels.  If **usePerspective** is `true`, then this value represents the size at 1m from the camera

**particleType** : `particle` | `ribbon` = `particle`

not used

**texture** : map = ''

the image used for particles in this particle system

**textureFrame** : vec2 = `{x: 1, y: 1}`

the **texture** image can be broken into a table of frames, with the number of columns (x) and rows (y) defined by **textureFrame**

**transparent** : boolen = false

if `true`, then a particle's opacity is used to make the particle appear transparent.  An opacity of 1 is opaque, whilst 0 is invisible. Transparency works best when the farthest objects are drawn first, but this is rarely 
possible with particle systems, so transparency may not look as intended. **alphaTest** is a more limited but more reliable alternative

**useAngularMotion** : boolen = true
**useFramesOrRotation** : boolen = true
**useLinearMotion** : boolen = true
**useOrbitalMotion** : boolen = true
**useRadialMotion** : boolen = true

if `true`, then this particle system will support various types of motion. Setting any value to `false` will disable the specific type of motion and lower the GPU cost for the particle system

**usePerspective** : boolen = true

if `true` particles will appear larger when they are closer to the camera
