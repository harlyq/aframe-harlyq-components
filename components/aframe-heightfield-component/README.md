# heightfield

Generates a heightfield from an image.

e.g.
```html
<a-entity heightfield="src: url(image.jpg); channels: r" material="color: green; flatShading: true; side: double" rotation="90 0 0" position="0 1.5 -2"></a-entity>
```

produces a heightfield of _image.jpg_ using only the red (r) channel. The resulting heightfield is rendered in green with flat shading.

## Properties

**channels**: `rgb` | `rgba` | `r` | `g` | `b` | `a` = `rgb`

Which channel to extract the height information from

---
**heightScale**: number = `.2`

Scaling of the height value.  The maximum intensity represents 1 m when scale is 1

---
**numRows**: int = `32`

The number of rows (in the z dimension) for the heightfield

---
**numCols**: int = `32`

The number of cols (in the x dimension) for the heightfield

---
**smooth**: boolean = `false`

If true, each height point has one vertex and one normal (the average of the triangle face normals).  If false, each triangle's vertices and normals is independent of all other triangles, and each normal matches the normal of the triangle. This uses much a lot more memory, but makes it easier to color each triangle independently and produce a faceted aesthetic.

---
**src**: selector = `null`

The src image to use for the heightfield