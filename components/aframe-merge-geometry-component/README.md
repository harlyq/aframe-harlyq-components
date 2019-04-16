# merge-geometry

Merges all the sub meshes into a single geometry called `mesh` to reduce the number of draw calls and speed up rendering.  Merging preserves the attributes of each mesh including positions, normals, indices, uvs and colors.  **merge-geometry** only works with meshes based upon BufferGeometry.

To preserve colors of individual meshes use the **vertex-color** component to color them.  Textures on the materials are not preserved.

e.g.
```html
<a-entity merge-geometry>
  <a-box position="0 1 0"></a-box>
  <a-sphere position="0 1 0"></a-sphere>
</a-entity>
```

** Properties

**preserveOriginal**: boolean = `false`

if true, then the original meshes are maintained, otherwise they are deleted
