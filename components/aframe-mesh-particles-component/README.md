# mesh-particles

**mesh-particles** link with **instances** to provide an instance based mesh particles, which have properties for manipulation motion, color, scale and rotation.  Multiple particle systems can share the same instane to reduce draw calls.

One of more insantances MUST BE PROVIDED (see the **instances** property) for the particle system to work.

e.g.
```html
<a-box id="box" instance="size: 10000" material="transparent:true"></a-box>
<a-entity mesh-particles="instances: #box; spawnRate: 5->10; radialPosition: 1.5; radialVelocity: 1,2; rotation: 0 0 0->360 360 360, 0 0 0; scale: .4->.2,.1; color: red|green|blue,orange; lifeTime: 3"></a-entity>
```
Uses the `#box` box mesh instances as particles.  From 5 to 10 particles spawn every second, at a position of 1.5m in a ring around the z axis (default for radial), with an outward velocity of 1 m/s which increases to 2 m/s by the end of the particle's life.  The initial scale is between .4 and 2, and shrinks to .1 at the end of life.  Color starts as red, green or blue and blends to orange over the particle's lifetime.

Multiple components can occur on a single instance

## Properties

**acceleration**: option|range vec3[] = ""

Defines the cartesean acceleration in m/s^2 for a particle.  This is overriden by **radialAcceleration**

---
**angularAcceleration**: option|range vec3[] = ""

Defines the angular acceleration in euler degrees/s^2 for a particle

---
**angularVelocity**: option|range vec3[] = ""

Defines the angular velocity in euler degrees/s for a particle

---
**color**: option|range color[] = ""

Defines the RGB color for each particle.  Colors can be specified as a CSS color e.g. name, rgb(0-255, 0-255, 0-255), rgb(0-100%, 0-100%, 0-100%), hsl(0-1, 0-100%, 0-100%), or #color

---
**destination**: selector = ""

An optional target a-entity for all particles.  The particles will arrive at their destination at the end of their lifetime

---
**destinationOffset**: selector = ""

An offset in destination local space to arrive at. Ignored if **destination** is not set

---
**destinationWeight**: number = 1

The linear interpolation weighting of the destination. 0 means the particles ignore the destination and 1 is all particles will arrive at the destination. Ignored if **destination** is not set

---
**duration**: number = -1

The duration in seconds of the whole system, -1 implies the system never ends

---
**enabled**: boolean = `true`

Enable or disable spawning of particles (note existing particles will continue to for the remainder of their lifetime when **enabled** is set to `false`)

---
**events** : string = ""

a comma separated list of events to listen for.  If event is set, then particles will not appear until a matching event is received

---
**instances**: selector = ""

A selector for the entities with **instance** components to use for this particle system.  Multiple instances will be shared evenly amongst this particle system.  If **instances** is not set, then use the **instance** component on this entity.  An error occurs if an instance cannot be found and no particles are generated.

---
**lifeTime**: option|range number = 1

The lifetime of each particle

---
**opacity**: option|range number[] = ""

The opacity for each particle. 0 represents transparent and 1 opaque.  For transparency to work, the **material** of the entity providing the **instance** must be set to `transparent: true`

---
**orbitalAcceleration**: option|range number[] = ""

The orbital acceleration in degrees/s^2 for each particle.  All particles orbit around the origin

---
**orbitalVelocity**: option|range number[] = ""

The orbital velocity in degrees/s^2 for each particle. All particles orbit around the origin

---
**position**: option|range vec3[] = ""

The cartesean position for each particle.  This value is overriden by **radialPosition**

---
**radialAcceleration**: option|range number[] = ""

The radal acceleration in m/s^2 in the direction given by **radialType**. This value overrides **acceleration**

---
**radialPosition**: option|range number[] = ""

The radial position in m in the direction given by **radialType**. This value overrides **position**

---
**radialType**: `circle`|`sphere`|`circlexy`|`circleyz`|`circlexz` = `circle`

The layout for **radialPosition**, **radialVelocity** and **radialAcceleration**. `circle` is synonmous with `circlexy` and represents a circle about the z-axis. `circleyz` is about the x-axis and `circlexz` is about the y-axis

---
**radialVelocity**: option|range number[] = ""

The radial velocity in m/s in the direction of **radialType**. This value overrides **velocity**

---
**rotation**: option|range vec3[] = ""

The rotation of each particle in euler degrees/s

---
**scale**: option|range (vec3|number)[] = 1

The scale of each particle.  A vec3 represents the scale along each axis, whilst a number represents the uniform scale for all axes.

---
**seed**: int = -1

A seed for the pseudo random number generator.  Using -1 uses an unseeded random number, whilst using a fixed seed will give the same results each run

---
**source**: selector = ""

The source entity from which particles eminate

---
**spawnRate**: option|range number = 1

The number of particles spawned per second

---
**velocity**: option|range vec3[] = ""

The velocity in m/s for each particle. This value is overriden by **radialVelocity**

## Option|Range

Values defined as option|range can use an extended syntax which provides a generates a random value.  `->` is used to designate a range and will provide a value which is greater than or equal to the first value but less than the second value e.g. `1->2` will generate a number between 1 and 2.  `|` is the option syntax for which a value will be randonly chosen from one of the options e.g. `1|2|3` will choose 1, 2, or 3.  A value can be either an option or a range, but not both, and vector values will randomly generate values for each component e.g. `1 5 10->2 -6 3` will generate a vector who's x is between 1 and 2, y between 5 and -6 and z between 10 and 3.  Ranges also work for color values with a random value chosen in the RGB space.

Some option|range values occur as an array (e.g. **velocity**).  This indicates that the value can change over the lifetime of the particle.  The first entry is the value at the start of the particle's life and the final entry at the end.  Intermediate entries occur evenly spaced over the particle's lifetime, and the values are interpolated between one entry and the next.