# aframe-harlyq-components

A collection of components for AFrame

[timer-emit](#timer-emit) - emitting events based over time (can use an audio source for timings)

[wait-add-remove](#wait-add-remove) - for adding and removing entities after a delay or event

[wait-emit](#wait-emit) - emitting events after a delay or event

[wait-set](#wait-set) - for setting attributes on a component after a delay or event

# usage

```html
<head>
  <script src="https://aframe.io/releases/0.8.2/aframe.min.js"></script>
  <script src=></script>
</head>
<body>
  <a-scene>
  </a-scene>
</body>
```

## timer-emit

Used for sending events at certain times from the creation of the component, or when an HTMLMediaEvent starts playing. The event detail contains a `source` parameter identifying the entity from which the event was sent.

e.g.
```html
<a-entity timer-emit="periodic=1,2,3,4,5; after3seconds=3; in10seconds=10"></a-entity>
```
repeatedly sends the event `periodic` at 1,2,3,4 and 5 seconds, sends `after3seconds` after 3 seconds and `in10seconds` at 10 seconds.

**src** : selector = null

Selector for an HTMLMediaEvent.  If present, this media element will be used for all timings. The events are only sent if the media event is playing

**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

**targetScope** : document | self | parent = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`)

**stopOnPause**: boolean = `true`

If true and **src** is set then stop the HTMLMediaElement when pausing this component

**\<event\>**: number[] = ""

Custom attributes that have a array of numbers. Each number represents the time in seconds at which this event should be fired

## wait-add-remove

Removes and Adds entities to this entity after an event, a delay, or a delay after an event.  The Remove occurs before the Add.  The **add** property is an array of selector definitions to represent entities to add

e.g.
<a-entity wait-add-remove="delay: 10; add: a-entity.class#id[geometry=primitive: box][material.color=red]; remove: #three,[color=blue]"></a-entity>

after `10` seconds, removes all descendants with the id `three` or an attribute `color` of `blue`, then add a child entity of type `a-entity` with a classname `class`, an id `id` and two attributes `geometry` and `material.color`. 

**delay** : number = `0`

Delay of `x` seconds before entities are added and/or removed. If an **event** is specified then the delay is started when the event is received

**event** : string = ""

Add and/or remove entities after this event has been received.  If a **delay** is present then start the delay after this event has been received

**source** : string = ""

Optional source entity to listen for **event**.  If not specified we use this component's entity

**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). 

**add** : string[] = ""

List of selectors, which represent entities to add as children to this component's entity. The attributes can use dot notation to represent component-attribute pairs. The add occurs after the remove

**addRepeat** : int = `1`

Number of times to repeat the add operation

**remove** : string[] = ""

Descendants of this component's entity, which match any selector in this list is removed. The remove occurs before the add

## wait-emit

Once one of the the **source** selector elements has received **inEvent** and **delay** seconds have passed, sends **outEvent** to all elements matching the **target** selector. The **wait-emit** component is useful for remapping and redirecting events.

e.g.
```html
<a-entity wait-emit="inEvent: click; delay: 1; source: #button; target: .door"></a-entity>
```

Once the element `#button` receives the `click` event, wait `1` second, then send the `click` event to all the `.door` elements.

**inEvent** : string = ""

event to listen for

**delay** : number = `0`

wait for this many seconds before sending **outEvent**.  If **inEvent** is specified, then only start the delay once **inEvent** is received

**source** : string = ""

a selector defining the source entities to listen for **inEvent** on.  **sourceScope** can be used to restrict this selector to a part of the DOM hierarchy.  If not specified we listen on the component's entity

**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). 

**outEvent** : string = ""

output event to send.  This event will contain a **detail** attribute which contains the data from the **inEvent** (if used)

**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

**targetScope** : document | self | parent = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`)

## wait-set

**wait-set**  is useful for setting properties after an **event** has been received. It can set an arbitrary number of properties on one or more **target** elements.

e.g.
```html
<a-entity wait-set="event: start; delay: 1.5; target: .light; material.color=red|yellow; pulse=1..2.5"></a-entity>
```
waits `1.5` seconds after the event `start` has been received on this component's entity and then set the `material.color` to either `red` or `yellow`, and the `pulse` component to a number between `1` and `2.5` for all entities of the class `light`.

**delay** : number = `0`

wait for this many seconds before sending **outEvent**.  If **inEvent** is specified, then only start the delay once **inEvent** is received

**event** : string = ""

event to listen for

**seed** : int = `-1`

defines a seed for the random number generator, which is useful for providing consistent random numbers. If negative, then `Math.random()` will be used for all random numbers

**source** : string = ""

a selector defining the source entities to listen for **inEvent** on.  **sourceScope** can be used to restrict this selector to a part of the DOM hierarchy.  If not specified we listen on the component's entity

**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). 

**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

**targetScope** : document | self | parent = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`)

**\<property\>** : value OR value1 | value2 | ... | valueN OR min..max

Custom attribute which defines a property to set.  This property can be either: a single value; a list of options (separated by `|`) where one is chosen at random; or a range of two values separated by `..` where a random number is chosen which is greater than or equal to the first value and less than the second value. For the range operator (`..`) the values may be either vectors of numbers (eg. a single number, vec2, vec3 or vec4) or colors, anything else will be treated as options rather than a range.
