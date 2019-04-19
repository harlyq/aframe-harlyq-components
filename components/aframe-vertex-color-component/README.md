# vertex-color

Defines vertex colors for the current geometry.  This is useful when merging geometry as the vertex colors are preserved. Note that the final object color is the material color multiplied by the vertex color, so to ensure the true vertex colors are shown, set the material color to white.  If the vertex-color is not applied, then it will default to the current material color.

e.g.
```html
<a-box vertex-color="color: blue"></a-box>
```

This component can appear multiple times on a single entity

## Properties

**color**: color = `white`

The color for the vertices

---
**meshName**: string = `mesh`

The name of the object3D to color

---
**minSlope**: number = 0

Paint vertices if the absolute slope (in degrees) of the triangle is larger than this value. 0 represents a horizontal triangle, and 90 is a vertical triangle

---
**maxSlope**: number = 0

Paint vertices if the absolute slope (in degrees) of the triangle is smaller than this value. 0 represents a horizontal triangle, and 90 is a vertical triangle

---
**minVertex**: vec3 = {x:0, y:0, z:0}

Only paint vertices that are larger than this value.  Note, (0,0,0) represents the bottom left corner and (1,1,1) is the top right corner

---
**maxVertex**: vec3 = {x:0, y:0, z:0}

Only paint vertices that are smaller than this value.  Note, (0,0,0) represents the bottom left corner and (1,1,1) is the top right corner

