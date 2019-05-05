# face-color

Uses vertex colors to define the color of each face (triangle) for the current geometry.  A face is coloured only if it satisfied the position, slope and index requirements (see the Properties below).

Note that the final object color is the material color multiplied by the face color, so to ensure the true face colors are shown, set the material color to white.  If the face-color is not applied, then it will default to white (which will be multiplied by the material color to determine the final color).

Face colors only work on non-indexed buffer geometry.  If the geometry is indexed or is not buffer geometry then it will be replaced by a non-indexed buffer geometry version.

When using a-frame **geometry** and **face-color** ensure `skipCache: true` is set on the geometry, otherwise different entities will share the same geometry, and thus the same face colors

For **face-color** all vertices on a face are assigned the same color, whilst **vertex-color** sets the color of individual vertices (which will be blended across the triangle)

e.g.
```html
<a-box face-color="color: red"></a-box>
```
Uses vertex colors to make each face of the box red

This component can appear multiple times on a single entity

## Properties

**color**: color = `white`

The color for the faces

---
**faces**: int[] = []

Only faces in this list will be colored (provided they meet the slop and position conditions). If the list is empty then all faces are candidates for coloring.

---
**meshName**: string = `mesh`

The name of the object3D to color

---
**minPosition**: vec3 = {x:-1e10, y:-1e10, z:-1e10}

Only paint faces that have all vertex positions higher than this value. Note positions are relative to the entity, so 0,0,0 is the entities' origin

---
**maxPosition**: vec3 = {x:1e10, y:1e10, z:1e10}

Only paint faces that have all vertex positions lower than this value. Note positions are relative to the entity, so 0,0,0 is the entities' origin

---
**minSlope**: number = 0

Paint faces if the absolute slope (in degrees) of the face is larger than this value. 0 represents a horizontal face, and 90 is a vertical face

---
**maxSlope**: number = 0

Paint faces if the absolute slope (in degrees) of the face is smaller than this value. 0 represents a horizontal face, and 90 is a vertical face

