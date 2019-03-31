# gltf-part

Extracts a part of a gltf model.

e.g.
```html
<a-entity gltf-part="part: roof; src: url(house.gltf)"><a-entity>
```
Shows the `roof` part of the `house.gltf`

---
**part** : string = ""

The name of the part to extract (case sensitive)

---
**src** : asset = null

The gltf asset to extract the part from