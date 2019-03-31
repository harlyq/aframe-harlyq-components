# clone-geo

Clones the Object3D associated with a the first element matching a given selector.

e.g.
```html
<a-box id="mybox" width="2" material="color:blue; transparent:true; opacity:0.5"></a-box>
<a-entity position="0 2 0" clone-geo="#mybox"><a-entity>
```
clones the geometry of `#mybox` and positions it at `0 2 0`
