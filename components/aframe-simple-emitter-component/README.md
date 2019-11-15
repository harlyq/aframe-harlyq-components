## simple-emitter

The **simple-emitter** is used to define the appearance of particle fx within a **simple-particles** system.  The particle system can define frames, color, opacity, rotation, position, motion (including linear, angular, orbital and radial) and scale. All motion calculations and interpolations are performed on the GPU, which limits the amount of data that can be used, so all over-time property arrays can have at most 3 elements, and 
each particle will repeat it's motion and appearance over the **loopTime**

e.g.
```html
```

Multiple components can be placed on a single entity.

## Properties

**acceleration** : vec3 = `0 0 0`

An option-range for the linear acceleration in meters per second squared along each axis. This can be a value, option or range e.g. `0 0 0` for 0 acceleration. `0 -1 0->0 -2 0` for an acceleration on the y-axis between -1 and -2 m/s^2. 
`1 2 3|4 5 6|-1 -2 -3` for accelerations of either 1 2 3 or 4 5 6 or -1 -2 -3 for each particle

**angularAcceleration** : vec3 = `0 0 0`

An option-range for the angular acceleration in degrees per second squared around each axis. This can be a value, option or range, e.g. `10 -20 330` is 10 deg/sec on the x-axis, -20 deg/sec on the y-axis and 330 deg/sec on the z-axis.
`10 -10 0->20 -20 50` will picked a value between 10 and 20 for the x rotation, -10 and -20 for the y and 0 and 5 for the z. `0 0 0|10 0 0|0 10 0` will pick either 0 0 0 or 10 0 0 or 0 10 0 for each particle.

**angularVelocity** : vec3 = `0 0 0`

An option-range for the angular velocity in degrees per second around each axis. This can be a value, option or range, e.g. `10 -20 330` is 10 deg/sec on the x-axis, -20 deg/sec on the y-axis and 330 deg/sec on the z-axis.
`10 -10 0->20 -20 50` will picked a value between 10 and 20 for the x rotation, -10 and -20 for the y and 0 and 5 for the z. `0 0 0|10 0 0|0 10 0` will pick either 0 0 0 or 10 0 0 or 0 10 0 for each particle.

**colors** : color[] = `white`

An over-time list of colors. Each element can be a value, option or range. e.g. `black,white` goes from black to white, `black->white` generates a random color for each particle, `black|white,red->green` starts each
particle as either white or black, then transitions to a random color between orange and pink (this is a random color between the red, green and blue components of orange and pink)

**count** : number = `100`

The maximum number of particles to use.  This amount of particles requested from the associated **simple-particles** component when this component is initialized (and the value cannot be changed at run-time).
This component will generate an error if the **simple-particles** does not have enough particles avaible

**enabled** : boolean = true

If `true` then the particle system is active

**frameStyle** : `sequence` | `randomsequence` | `random` = `sequence`

For `sequence`, we show each from the first to the second value (inclusive) of **frames** at regular intervals over the lifetime of the particle. For `randomsequence`, a randomly chosen sequence is used (note that some
frames may be skipped or repeated). Use `random` to pick one of the frames at random and use it for the lifetime of the particle.

**frames** : number[] = `0`

An array of 0 or more frames.  If no frames are specified, default to frame 0. If one frame is specified then use that frame for all particles.  If two frames are specified, then use then in accordance with the **frameStyle** rules

**lifeTime** : number = `1`

The maximum lifetime of a particle in seconds.  This is an option-range value e.g. `2` is 2 seconds, `3->4` implies each particle lives for between 3 and 4 seconds, `5|6|1` sets each particle's lifetime to either 5, 6 or 1 seconds

**loopTime** : number = `0`

The number of seconds before a particle is reused.  If less than the maximum **lifeTime** value, then default to the maximum **lifeTime** value.  The larger **loopTime** is than **lifeTime** the less obvious the particle repetition, but the fewer particles will appear at any one time (because the total **count** is fixed)

**opacities** : number[] = `1`

An over-time array of opacities (1 for opaque, 0 for transparent) for each particle, an empty array defaults to 1. Each element can be a value, option or range e.g. `1,.5 -> .6,0` starts all pixels as opaque (1), 
then linearly interpolate to a value between .5 and .6 at their half-life , and finally interpolate down to invisible (0)

**orbitalAcceleration** : number = `0`

The acceleration in degrees per second squared on a random axis (the same axis is used for **oribalAcceleration** and **orbitalVelocity**) around the origin of the particle system. This does nothing if the particle spawned at the origin.  This number is an option-range, e.g. `10` is 10 deg/s^2, `9->-5` is a value between 9 and -5 deg/s^2 and `4.5|6|-3` is either 4.5, 6 or -3 deg/s^2

**orbitalVelocity** : number = `0`

The velocity in degrees per second on a random axis (the same axis is used for **oribalAcceleration** and **orbitalVelocity**) around the origin of the particle system. This does nothing if the particle spawned at the origin.  This number is an option-range, e.g. `10` is 10 deg/s, `9->-5` is a value between 9 and -5 deg/s and `4.5|6|-3` is either 4.5, 6 or -3 deg/s

**particles** : string = `particles`

The matching value from the **name** attribute of a **simple-particles** component that this emitter will use

**radialAcceleration** : number = `0`

**radialVelocity** : number = `0`

**rotations** : number[] = `0`

**scales** : number[] = `1`

**spawnGeometry** = selector = ""

**spawnShape** : `point` | `geometrytriangle` | `geometryedge` | `geometryvertex` | `circle` | `sphere` | `box` | `insidecircle` | `insidesphere` | `insidebox` = `point`

**textureFrame** : vec2 = `0 0`

**velocity** : vec3 = `0 0 0`

### over-time
over-time properties represent an array of values that are linear interpolated between over the age of the particle. If no value is specified then the default will be used, 
if one-value then the result is constant, for two values we start at the first value and linear interpolate to the last value over the lifetime of the particle.  For three or 
more values, only the first three elements are used. The first value is the start value, the second value is the value at half the lifetime and the third value is the final
value at the full lifetime