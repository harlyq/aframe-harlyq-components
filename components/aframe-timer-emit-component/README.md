## timer-emit

Used for sending events at certain times from the creation of the component, or when an HTMLMediaEvent starts playing. The event detail contains a `source` parameter identifying the entity from which the event was sent

This component can appear multiple times on a single entity

e.g.
```html
<a-entity timer-emit="_periodic=1,2,3,4,5; _after3seconds=3; _in10seconds=10"></a-entity>
```
repeatedly sends the event `_periodic` at 1,2,3,4 and 5 seconds, sends `_after3seconds` after 3 seconds and `_in10seconds` at 10 seconds

```html
<a-entity timer-emit="src=#someAudio; splash=1,15.5"></a-entity>
```
once the media source #someAudio is started will send `splash` twice, once after 1 second and once after 15.5 seconds.  If the media source is paused then the internal event timer is also paused

## Properties

**src** : selector = null

Selector for an HTMLMediaEvent.  If present, this media element will be used for all timings. The events are only sent if the media event is playing

---
**stopOnPause**: boolean = `true`

If true and **src** is set then stop the HTMLMediaElement when pausing this component

---
**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

---
**targetScope** : document | self | parent = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`)

---
**\<event\>**: number[] = ""

Custom attributes that have a array of numbers. Each number represents the time in seconds at which this event should be fired