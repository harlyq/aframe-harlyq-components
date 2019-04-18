# vertex-color

Defines vertex colors for the current geometry.  This is useful when merging geometry as the vertex colors are preserved.

e.g.
```html
<a-box vertex-color="color: blue"></a-box>
```

This component can appear multiple times on a single entity

## Properties

**color**: color = `white`

The color for the vertices

---
**start**: int = `0`

The start index of the vertices to color

---
**end**: int = `-1`

The end index of the vertices to color, if this value is negative then the end index is determined from `length - end`

---
**meshName**: string = `mesh`

The name of the object3D to color