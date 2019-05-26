# chalk

A component to represent a piece of chalk which can write on anything with a canvas texture.  A **raycaster** component on the same entity can be used to restrict the set of **objects** and define a **far** distance for interactions.  Once an interaction occurs and the object's main material is a canvas, then the chalk color is painted onto the canvas.

e.g.
```html
<a-scene>
  <a-assets>
    <canvas id="canvas" width="1024" height="1024"></canvas>
  </a-assets>
  <a-entity id="rightHand" vive-controls="hand: right">
    <a-entity chalk="color: blue;" raycaster="objects: .board; far: .1"></a-entity>
  </a-entity>
  <a-entity class="board" position="0 1 -.5" rotation="-45 0 0" geometry="primitive: plane" material="src: #canvas"></a-entity>
</a-scene>
```
A `blue` **chalk** component is held in the `rightHand`, and will write on things of class `board` (as defined by the **raycaster**) when `.1` meters away. The `board` in this case is a flat plane with a `#canvas` material

## Properties

**color** : Color = "white"

define the color of the chalk

---
**debug** : boolean = `false`

if true, log contact information on the console

---
**length** : number = `0.1`

length of the chalk in meters

---
**radius** : number = `0.02`

radius of the chalk in meters
