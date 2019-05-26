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

A comma separated list of selectors to identify the controller to pulse.  This string also supports a `$` prefix for reading an attribute on this entity and `$event` for reading the properties of the incoming event (in both cases, the resulting value will be used the selector) e.g. `$tool.hand` will read the `hand` attribute of the `tool` component or `$event.detail.hand` will read the `detail.hand` property of the received event.  If no selector is specified, then look for `[tracked-controls]` on the component's entity

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