# hull

Generates a convex hull geometry given a set of **points** or the object3D of another entity (**src**)

e.g.
```html
<a-entity hull="points: -1 -1 -1, -1 -1 1, -1 1 -1, -1 1 1, 1 -1 -1, 1 -1 1, 1 1 -1, 1 1 1" material="color: blue; wireframe: true"></a-entity>
```
creates a hull of using the corners of a box (`points`), and show the hull in a `blue` `wireframe`

```html
<a-entity hull="src: #model"></a-entity>
<a-gltf-model id="model" src="Books_01.gltf"></a-gltf-model>
```
creates a hull for the `Books_01.gltf` model

## Properties

**computeNormals**: boolean = `false`

if true, then a set of normals are generated for each vertex

---
**points** : string = ""

a comma separated list or space separated numbers representing x y and z axis e.g. 1 1 1,-1 -1 -1

---
**src** : selector = ""

a selector for an entity, using it's object3D as a basis for the hull