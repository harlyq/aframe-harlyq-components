# merge-geometry

Merges all the sub meshes into a single geometry called `mesh` to reduce the number of draw calls and speed up rendering.  Merging preserves the attributes of each mesh including positions, normals, indices, uvs and colors.  **merge-geometry** only works with meshes based upon BufferGeometry.

Textures on the materials are not preserved.

e.g.
```html
<a-entity merge-geometry>
  <a-box position="0 1 0"></a-box>
  <a-sphere position="0 1 0"></a-sphere>
</a-entity>
```

** Properties

**keepColor**: boolean = `true`

If true and vertex colors exist then the material color is applied to the vertex color, otherwise vertex colors are created and assigned to the material color. If false, only the vertex colors are maintained, and they are only be visible if the **material** of the **merged-geometry** entity has **vertexColors** set to `vertex`

---
**keepOriginal**: boolean = `false`

if true, then the original meshes are maintained, otherwise they are deleted
