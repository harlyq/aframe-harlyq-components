# climb

The **climb** component defines a set of objects (via the **grabSelectors**) which can be grabbed and used to translate a **cameraRig** (which contains entities for the the HMD camera and hands), providing a sensation of climbing.

The **climb** component assumes the **simple-hands** component (or equivalent) is on the same component and configured with valid **grabSelectors**.

e.g.
```html
<a-entity climb="cameraRig: #cameraRig;" simple-hands="leftSelector: #leftHand; rightSelector: #rightHand; grabSelectors: a-box;"></a-entity>
<a-entity id="cameraRig">
  <a-camera></a-camera>
  <a-entity id="leftHand" hand-controls="left"></a-entity>
  <a-entity id="rightHand" hand-controls="right"></a-entity>
</a-entity>
<a-box position="0 0 -1"></a-box>
<a-box position="0 1.1 -1"></a-box>
<a-box position="0 2.2 -1"></a-box>
```
The use can use the `#leftHand` and `#rightHand` to grab onto any `a-box` and translate the `#cameraRig`

## Properties

**cameraRig**: selector = ""

The parent entity of the camera and hand controls - it should not be a scene.  There is a warning if the cameraRig is not specified

---
**debug**: boolean = `false`

If true, outputs data from the grab events

---
**enabled**: boolean = `true`

If false, then doesn't move the camera rig
