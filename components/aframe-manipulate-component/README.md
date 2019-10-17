# manipulate

Manipulates an entities matrix using hand controls.  Manipulations include scaling, rotating, translating and grabbing, and can be restricted to a specific axis.

e.g
```html
<a-box manipulate="hands: #leftHand, #rightHand"></a-box>
```

Provides one handed grab and two-handed grab and uniform scale of the a-box

```html
<a-box manipulate="hands: #leftHand; oneHanded: scale-x; twoHanded: none; startEvent: trackpaddown; endEvent: trackpadup"></a-box>
```

Restricts manipulation to the `#leftHand`, and only scaling in the x axis when the trackpad is pressed

## Properties

**debug**: boolean = `false`

Activates debugging mode which logs event tracking

---
**enabled**: boolean = `true`

Enable/disable the component

---
**endEvent**: string = `triggerup`

The event which ends manipulations for a given hand (all events are converted to lowercase). We listen for this event on the **hands** elements

---
**hands**: selectorAll = ""

A selector for the hand controls

---
**oneHanded**: `grab` | `scale` | `translate` | `rotate` | `uniformscale` | `none` = `grab`

Actions that are permited when only one hand control is started (i.e. the **startEvent** has been received). 
The `scale`, `translate` and `rotate` also support an axis e.g. `scale-x` will only scale in the x-axis. 
Multiple actions are provided in a comma separated list e.g. `scale-x, scale-y`

---
**pivot**: vec3 = `0 0 0`

The local pivot for one handed scale and rotate actions

---
**startEvent**: string = `triggerdown`

The event which starts manipulations for a given hand (all events are converted to lowercase). We listen for this event on the **hands** elements

---
**twoHanded**: `grab` | `scale` | `translate` | `rotate` | `uniformscale` | `none` = `grab, uniformscale`

Actions that are permited when two hand controls are started (i.e. the **startEvent** has been received). 
The `scale`, `translate` and `rotate` also support an axis e.g. `scale-x` will only scale in the x-axis. 
Multiple actions are provided in a comma separated list e.g. `scale-x, scale-y`

