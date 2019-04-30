# uv-transform

Wraps the threejs texture uvTransform logic, providing functionality to set the offset, repeat and rotation of a texture.  The transform is applied to the alphaMap, bumpMap, displacementMap, emissiveMap, map, metalnessMap, normalMap, and roughnessMap (if they exist)

e.g.
```html
<a-entity material="src: url(image.jpg)" uv-transform="offset: .2 .2; rotation: 95; repeat: 1.5 1.5">
```
Applies an offset of `.2 .2`, rotation of `95` degrees (centered around the default of `.5 .5`) repeating the pattern `1.5 1.5` times.

This component can appear multiple times on the same instance (typically for different meshes)

## Properties
**center**: vec2 = `.5 .5`

The pivot in UV coords about which this texture is rotated

---
**maps**: string = `map`

A comma separated list of threejs material map types to apply this transform to search https://threejs.org/docs/#api/en/materials/MeshStandardMaterial for a list of potential maps

---
**meshName**: string = `mesh`

Name of the mesh to apply the transform to

---
**offset**: vec2 = `0 0`

Offset in UV coords for translating this texture

---
**repeat**: vec2 = `1 1`

Number of times to repeat this texture

---
**rotation**: number = `0`

Angle in degrees to rotate this texture about the **center**

---
**wrapS**: `repeat` | `clampToEdge` | `mirroredRepeat` = `repeat`

Defines the method for continuing the texture in the **u** dimension beyond 0 or 1 by either: repeating it; clamping it to 0,1; or mirroring it

----
**wrapT**: `repeat` | `clampToEdge` | `mirroredRepeat` = `repeat`

Defines the method for continuing the texture in the **v** dimension beyond 0 or 1 by either: repeating it; clamping it to 0,1; or mirroring it
