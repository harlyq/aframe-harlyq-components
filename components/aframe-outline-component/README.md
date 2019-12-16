# outline

A component to draw an outline around an object.  The outline is generated from a hull around the object and is quick to render, but there are artifacts when objects are close or intersecting.
Outlines will be obscured by other objects in front of them.  

Outlines for objects with hundreds of thousands of vertices can take several seconds to initially generate.

e.g.
<a-box outline></a-box>

## Properties

**color** : color = `pink`

The color of the outline

---
**enabled** : boolean = `true`

If false, the outline is not shown.

---
**meshName** : string = `mesh`

The name of the mesh to apply an outline to

---
**style** : `screenspace | 3dspace` = `3dspace`

`screenspace` where the outline does not change with distance from the camera
`3dspace` the outline will be smaller for more distant objects

---
**width** : number = .01

0 is no outline, 1 is a large outline
