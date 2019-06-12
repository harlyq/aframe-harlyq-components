# arm-swinger

A component for moving an entity based upon arm movement. The direction of travel is determined by the forward direction of the arm movement, and the speed by the speed of arm movement

e.g.
<a-entity id="cameraRig" arm-swinger="handSelectors: #leftHand, #rightHand; startEvent: trackpaddown; endEvent: trackpadup; scaling: .3">
  <a-camera id="camera"></a-camera>
  <a-entity id="leftHand" vive-controls="hand: left"></a-entity>
  <a-entity id="rightHand" vive-controls="hand: right"></a-entity>
</a-entity>

## Properties

**cameraRig** : Selector = ""

Defines the entity to move, which typically consists of entities for the camera and hands.  If a **cameraRig** is not specified (or invalid) then the component's entity is moved

---
**enabled** : boolean = `true`

If false, all motion is disabled

---
**endEvent** : string = `gripup`

All motion is stopped when this controller event is received

---
**handSelectors** : SelectorAll = ""

Selectors representing the left and right controllers

---
**scaling** : number = `1`

A multiplier for the motion, higher numbers represent faster motion

---
**startEvent** : string = `gripdown`

Controller motion tracking is started once this event is received