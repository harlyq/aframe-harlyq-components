# vertex-color

Defines vertex colors for the current geometry.  A vertex is coloured only if it satisfied the position, slope and vertex requirements (see the Properties below).

Note that the final object color is the material color multiplied by the vertex color, so to ensure the true vertex colors are shown, set the material color to white.  If the vertex-color is not applied, then it will default to white (which will be multiplied by the material color to determine the final color).

When using a-frame **geometry** and **vertex-color** ensure `skipCache: true` is set on the geometry, otherwise different entities will share the same geometry, and thus the same vertex colors

This component can appear multiple times on a single entity

e.g.
```html
<a-box vertex-color="color: blue"></a-box>
```
Uses vertex colors to make the box blue

## Properties

**color**: color = `white`

The color for the vertices

---
**meshName**: string = `mesh`

The name of the object3D to color

---
**minPosition**: vec3 = {x:-1e10, y:-1e10, z:-1e10}

Only paint vertices that have a local position higher than this value. Note positions are relative to the entity, so 0,0,0 is the entities' origin

---
**maxPosition**: vec3 = {x:1e10, y:1e10, z:1e10}

Only paint vertices that have a local position lower than this value. Note positions are relative to the entity, so 0,0,0 is the entities' origin

---
**minSlope**: number = 0

Paint vertices if the absolute slope (in degrees) of the vertex is larger than this value. 0 represents a horizontal vertex, and 90 is a vertical vertex

---
**maxSlope**: number = 0

Paint vertices if the absolute slope (in degrees) of the vertex is smaller than this value. 0 represents a horizontal vertex, and 90 is a vertical vertex

---
**verts**: int[] = []

Only vertices in this list will be colored (provided they meet the slop and position conditions). If the list is empty then all vertices are candidates for coloring.