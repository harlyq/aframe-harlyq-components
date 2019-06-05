# texture-updater

A simple component for forcing an update of textures on a mesh's material(s).  This is useful for textures which are updated by a third party.

e.g.
<a-box material="src:#movingCanvas" texture-updater>

## Properties

meshName : string = `mesh`

The name of the mesh which will have its materials updated

---
maps : string = `map`

The names of properties on the material which represent textures to be updated. `map` typically represents the diffuse texture on a material (and in AFrame is set by the **src** attribute)
