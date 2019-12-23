# sliding-puzzle

NxM sliding puzzle game, where tiles are slid along cartesian axes until all tiles are back in order.  Any tile along the same row or column of the missing tile can be slid

The **sliding-puzzle** works with **networked-aframe**

## Parameters

---
**cols** : number = `4`

number of columns for the sliding puzzle

---
**debug** : boolean = `false`

if true, output debug information to the console.log

---
**endOffset** : vec3 = `0 0 -.3`

end point of a ray from the hand for selecting tiles

---
**grabEvent** : string = `triggerdown`

gamepad event for grabbing tile that we are hovering over

---
**hands** : selectorAll = `[tracked-controls],[hand-controls],[vive-controls],[oculus-touch-controls],[windows-motion-controls]`

selector for the elements representing the hands

---
**hoverOffset** : number = `0.01`

offset to apply to the tiles to show that a hand is hovering near them

---
**releaseEvent** : string = `triggerup`

the gamepad event for releasing a grabbed a tile

---
**rows** : number = `4`

the number of rows in the sliding puzzle

---
**snapRatio** : number = `.2`

when moving tiles, they will snap into place when in proximity of a nearby tile. `0` implies no snapping and `.5` (maximum) is snap to the nearest tile. snapped tiles will not move until they are dragged beyond the snapping distance.
Because partially slid tiles can prevent other tiles from moving, it is useful to use a non-zero **snapRatio**

---
**startOffset** : vec3 = `0 0 0`

the start point of a ray from the hand for selecting tiles.  In tile intersecting the ray can be grabbed