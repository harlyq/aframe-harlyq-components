## simple-hands

**simple-hands** offers hover and grab events and can be used on entities with a **tracked-controls** component.  The hover events use sphere to object aligned bounding box checks, selecting the smallest object if multiple objects overlap.

e.g.
```html
<a-entity vive-controls="hand: left" simple-hands="objects: .special; offset: 1 1 0; radius: 0.01"></a-entity>
```

## Events
| EVENT | DESCRIPTION |
| - | - |
| **hoverstart** | sent to the object that the hand sphere collides with. Only sent when the trigger is not pressed |
| **hoverend** | sent to the object that the hand sphere no longer collides with. This will also be sent if a grab starts while we are hovering over an object |
| **grabstart** | sent to the object that we were hovering over when the user pressed the trigger. Only sent if the hand sphere is colliding with an object |
| **grabend** | sent to the object that received the grabstart, when the user releases the trigger |

## Properties

**bubble** : boolean = `true`

emitted events will bubble up the entity hierarchy

---
**debug** : boolean = `false`

show a wireframe around the collision sphere and boxes around each of the objects that are subject to collision checks

---
**objects** : string = ""

a selector to filter the objects to be tested for overlap

---
**offset** : vec3 = `0 0 0`

the offset of the center of the collision sphere from the origin of the entity

---
**radius** : number = `0.05`

the radius (meters) of the sphere for collision checks

---
**watch** : boolean = `true`

if true, watch for the addition and removal of entities and add them to the collision list if they match the **objects** selector

