# instance-pool

An **instance-pool** converts the current mesh geometry into a pool of instanced geometry, which can be used by other systems.  Each instance has it's own position, scale, rotation and color, but shares geometry with all other instances so only a single draw call is needed, lessening the load on the GPU.

Examples using the **instance-pool** can be found at:

https://github.com/harlyq/aframe-harlyq-components/blob/master/components/aframe-instance-component/index.js
https://github.com/harlyq/aframe-harlyq-components/blob/master/components/aframe-mesh-particles-component/index.js

## Javascript functions

**reverseBlock( requestedSize: number) => number**

Reserves a block of **requestedSize** elements and returns an **index** for that block.  If the requested number of blocks are not available, then returns `undefined`

---
**releaseBlock( index: number ) => boolean**

Releases a block reserved by **reserverBlock**.  Returns `true` on success, `false` if the **index** could not be found

---
**setColorAt( i: number, r: number, g: number, b: number, a: number = 1 ) => void**

Sets the color of a particular instance^ to an rgba value in the range (0,1).

---
**setPositionAt( i: number, x: number, y: number, z: number ) => void**

Sets the position of an instance^ in the local space of the this component's entity

---
**setScaleAt( i: number, x: number, y: number, z: number ) => void**

Scales an instance^. A value of 1,1,1 will match the scale of the original instance.  0,0,0 will hide an instance

---
**setQuaternionAt( i: number, x: number, y: number, z: number, w: number ) => void**

Apply a rotation to an instance^.

---
**getColorAt( i: number, out: {} ) => { r: number, g: number, b: number, a: number }**

Put the color of an instance^ into parameter **out**.  Returns the parameter **out**

---
**getPositionAt( i: number, out: {} ) => { x: number, y: number, z: number }**

Put the position of an instance^ into parameter **out**. Returns the parameter **out**

---
**getScaleAt( i: number, out: {} ) => { x: number, y: number, z: number }**

Places the scale of an instance^ into the **out** parameter and returns it

---
**getQuaternionAt( i: number, out: {} ) => { x: number, y: number, z: number, w: number }**

Places the quaternion of an instance^ into the **out** parameter and returns it

---
^ The **i** value is the **index** number from **reserveBlock** plus the instance number (starting from 0) e.g. `index+10` represents the 11th instance in this block.

**WARNING** setting **i** values outside of your block range will modify other blocks

## Properties

**patchShader** boolean = `true`

Can be set to false if the user is providing a custom shader for instancing

---
**size** : number = `1000`

Defines the maximum number of instances that can appear at once.  Memory is pre-allocated for this many instances
