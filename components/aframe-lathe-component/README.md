# aframe-lathe-component

Wrapper around [THREE.LatheBufferGeometry](https://threejs.org/docs/#api/en/geometries/LatheBufferGeometry).  Given a 2D [svg path](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths), wraps that path around the Y-axis.

e.g.
```html
<a-entity lathe="M0,0 l-1,0 -1,2 0,2"></a-entity>
```
generate a cylinder of radius 1 and height 2 about the y axis

## Properties

**phiStart**: number = 0

starting angle (degrees) for wrapping about the Y-axis. This value may be negative

---
**phiEnd**: number = 360

ending angle (degrees) for wrapping about the Y-axis. This may be negative

---
**shape**: string = ""

a 2D [svg path](https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths) which forms the edge of the lathed object

---
**steps**: int = 1

the number of steps to take along the path. The more steps, the smoother the curved parts of the path

---
**segments** int = 12

the number of segments along the lathed arc.  The more segments, the smoother the geometry
