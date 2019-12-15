# cube-puzzle

Generates a 3x3x3 cube geometry where a user can turn the sides of the cube with the aim of getting each face to have the same colors.  The cube can be translated and rotated by grabbing with a single hand. 
While holding the cube, moving a second hand near the cube will highlight the side that can be turned.  If the second hand is near the cube then the only the outside squares will be affected, as the 
hand is moved inside the cube, both the outside and adjacent inner squares will be manipulable. Performing a grab with the second hand will enable turning the side, and the side will snap into 
place as each turn nears a 90 degree angle.  Once a rotation is snapped into place, it is possible to release the second hand and grab a different side. 

This component supports **networked-aframe** and the cube is rendered using a single draw call.

e.g.
<a-entity cube-puzzle="moves: U R' D2 L B L' U2 R2 F U' B F'"></a-entity>

## Methds
**shuffle()**

Performs a number of random turns

## Properties

**debug** : boolean = `false`

If true output debugging information to the console

---
**grabEnd** : string = `triggerup`

Gampad button for ending manipulation (this can the same as grabStart)

---
**grabStart** : string = `triggerdown`

Gamepad button for starting manipulation

---
**hands** : selectorAll = `[hand-controls], [oculus-touch-controls], [vive-controls], [windows-motion-controls]`

selector for finding hands in the a-scene

---
**highlightColor** : color = `#555`

additive color for highlighting the cube or sides during manipulation

---
**moves** : string = ""

a space separated list of moves. Possible moves include U R D L F B U' R' D' L' F' B' U2 R2 D2 L2 F2 B2, where each letter represents a side 
U = upper, R = right, D = down, L = left, R = right, B = back. A single letter is for 90 degrees clockwise, ' for counter-clockwise 
and 2 for 180 degree turns

---
**snapAngle** : number = `20`

the maximum angle at which a manual manipulation will snap to the 90 degree angle. For example a **snapAnlge** of `20` means that
if the rotation will snap to 90 if it is between 70 or 110 degrees