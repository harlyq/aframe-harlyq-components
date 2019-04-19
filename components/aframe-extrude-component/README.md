# extrude

A wrapper around [THREE.ExtrudeBufferGeometry](https://threejs.org/docs/#api/en/geometries/ExtrudeBufferGeometry). Takes a 2D [svg path](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths) and generates a geometry extruded perpendicular to this path, or along another extruded svg path.  The extruded geometry can be beveled at the ends.

e.g.
```html
<a-entity extrude="shape: M-0.054,-0.178 l-0.007,-0.182 0.069,-0.027"></a-entity>
```

## Properties

**bevelEnabled** : boolean = `true`

if true, then bevel the edges

---
**bevelThickness**: number = `6`

how deep the original shape is before beveling starts

---
**bevelSize**: number = `2`

the distance of the beveling outside of the original shape

---
**bevelSegments**: int = `3`

the number of beveling segments, the more segments the smoother the bevel geometry

---
**curveSegments**: int = `12`

the number of points to use for curved parts of the path

---
**depth**: number = 100

the distance to extrude the shape

---
**extrudePath**: string = ''

an optional [svg path](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths) to extrude along

---
**shape**: string = ''

an [svg path](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths) defining the shape of the path

---
**steps**: int = 1

the number of points used to subdivide the extruded path. the more steps, the smoother the curves in the extruded path
