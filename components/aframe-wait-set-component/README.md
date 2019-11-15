## wait-set

**wait-set**  is useful for setting properties after an **event** has been received. It can set an arbitrary number of properties on one or more **target** elements, with fixed or random values

If the **debug** component is also on this entity then log the properties that are set to the console

This component can appear multiple times on a single entity

e.g.
```html
<a-entity wait-set="events: start; delay: 1.5; target: .light; material.color=red|yellow; pulse=1->2.5"></a-entity>
```
waits `1.5` seconds after the event `start` has been received on this component's entity and then set the `material.color` to either `red` or `yellow`, and the `pulse` component to a number between `1` and `2.5` for all entities of the class `light`

## Properties

**debug**: boolean = `false`

if true show debugging information when properties are set

---
**delay** : : value OR value1 | value2 | ... | valueN OR min->max = `0`

wait for this many seconds before setting the custom properties on the **target**. If **events** is specified, then only start the delay once **events** is received

---
**events** : string = ""

events to listen for

---
**seed** : int = `-1`

defines a seed for the random number generator, which is useful for providing consistent random numbers. If negative, then `Math.random()` will be used for all random numbers

---
**source** : string = ""

a selector defining the source entities to listen for **inEvent** on.  **sourceScope** can be used to restrict this selector to a part of the DOM hierarchy.

---
**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). If **source** is empty, then the listen on the document (`document`), the parent (`parent`), or this component's entity (`self`)

---
**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

---
**targetScope** : document | self | parent | event = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), the children of the current entities parent (`parent`), or children of the event (`event`).  If **target** is empty, then the set is performed on the document (`document`), the parent (`parent`), this component's entity (`self`) or the initial target of the event (`event`)

---
**\<property\>** : value OR value1 | value2 | ... | valueN OR min->max

Custom attribute which defines a property to set.  This property can use dot notation (e.g. component.property) and value is either: a single value; a list of options (separated by `|`) where one is chosen at random; or a range of two values separated by `->` where a random number is chosen which is greater than or equal to the first value and less than the second value. For the range operator (`->`) the values may be either vectors of numbers (eg. a single number, vec2, vec3 or vec4) or colors (anything else will be treated as options rather than a range).

Values can also have a special `$` form, which will pull data from the current entity e.g. `$material.color` will return the `color` value of the `material` component on the current entity. `$event` can be used to get data from the received event e.g. `$event.target.id` will return the `id` of the `target` of the received event.
