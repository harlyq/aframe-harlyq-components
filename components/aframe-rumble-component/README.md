# rumble

Defines the intensity and duration of a haptic pulse which is sent to one or more controllers when an event is received

e.g.
```html
<a-entity laser-controls="hand: right;" 
  raycaster="objects: a-box; showLine: true; far: 5"
  rumble="events: raycaster-intersection; force: .3"></a-entity>
<a-box></a-box>
```

## Properties
**controllers** : string = ""

A selector to identify the controllers to pulse

---
**delay** : number = `0`

A delay in seconds to wait before activating the pulse

---
**duration** : number = `0.1`

The duration in seconds for the pulse

---
**enabled** : boolean = `true`

If disabled, no pulses are sent

---
**events**: string = ""

A comma separated list of events to pulse on.  The pulse will be sent after **delay** seconds.  If a pulse is already active, then the new pulse will override the old pulse

---
**force**: number = 1

The intensity of the pulse. 1 is 100%, 0 is off