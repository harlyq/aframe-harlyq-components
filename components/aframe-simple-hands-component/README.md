## simple-hands

**simple-hands** offers hover and grab events and can be used on entities with a **tracked-controls** component.  The hover events use sphere to object aligned bounding box checks, selecting the smallest object if multiple objects overlap.

If the **debug** component is on this entity then show a wireframe around the collision sphere and boxes around each of the objects that are subject to collision checks

e.g.
```html
<a-entity vive-controls="hand: left" simple-hands="objects: .special; offset: 1 1 0; radius: 0.01"></a-entity>
```

## Events
| EVENT | DESCRIPTION |
| - | - |
| **hoverend** | sent to the object that the hand sphere no longer collides with. This will also be sent if a grabStart or toolEquip occurs while we are hovering over an object |
| **hoverstart** | sent to the object that the hand sphere collides with. Only sent when not currently grabbing or holding a tool |
| **grabend** | sent to the grabbed object that received when the **grabEnd** trigger is used |
| **grabstart** | sent to the object that we were hovering over when the user pressed the **grabStart** trigger |
| **tooldrop** | sent to the equipped tool when the **toolDrop** trigger is used |
| **toolequip** | sent to the object that we were hovering over when the user pressed the **toolEquip** trigger |

In each case two events will be sent, one to this entity, and the other to the grab or tool entity, both with the parameters `{ hand: HTMLElement, object: HTMLElement }`

## Properties

**bubble** : boolean = `true`

emitted events will bubble up the entity hierarchy

---
**colliderOffset** : vec3 = `0 0 0`

the offset of the center of the collision sphere from the origin of the entity

---
**colliderRadius** : number = `0.05`

the radius (meters) of the sphere for collision checks

---
**debug**: boolean = `false`

if true, show debug bounding boxes around objects that are tested for overlap

---
**grabEnd** : string = `triggerup`

controller trigger for the `grabend` event on a grab object

---
**grabSelectors** : string = ""

a selector to filter the objects to be tested for overlap.  Objects in this list will generate grab events when triggered

---
**grabStart** : string = `triggerdown`

controller trigger for the `grabstart` event on a grab object

---
**leftSelector** : string = ""

selector for the left controller

---
**rightSelector** : string = ""

selector for the right controller

---
**toolDrop**: string = `gripdown`

controller trigger for initiating a `tooldrop` event on a tool object

---
**toolEquip**: string = `triggerdown`

controller trigger for initiating a `toolequip` event on a tool object

---
**toolSelectors**: string = ""

a selector to filter tool related objects. Objects in this list will generate tool events when triggered.  The **toolSelectors** have priority over the **grabSelectors**

---
**watch** : boolean = `true`

if true, watch for the addition and removal of entities (after the scene is loaded) and add them to the collision list if they match the **objects** selector

