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
**src**: selector = `null`

The src image to use for the heightfield