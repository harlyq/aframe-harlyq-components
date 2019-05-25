## wait-add-remove

Removes and Adds entities to this entity after an event and/or a delay.  Removes occur before Adds.  The **add** property is an array of selector definitions that represent entities to add

This component can appear multiple times on a single entity

e.g.
```html
<a-entity wait-add-remove="delay: 10; add: a-entity.class#id[geometry=primitive: box][material.color=red]; 
  remove: #three,[color=blue]"></a-entity>
```
after `10` seconds, removes all descendants with the id `three` or an attribute `color` of `blue`, then add a child entity of type `a-entity` with a classname `class`, an id of `id` and two attributes `geometry="primitive: box"` and `material="color:red"`

```html
<a-entity wait-add-remove="events: click; source: .button; sourceScope: self; delay: 2.5; 
  add: a-box#mybox[color=blue]"></a-entity>
```
once the `click` event is received from child of this component (`sourceScope: self`) matching the selector `.button`, wait 2.5 seconds, then add an `a-box` with id `mybox` and `color="blue"`

## Properties

**add** : string[] = ""

List of selectors, which represent entities to add as children to this component's entity. The attributes can use dot notation to represent component-attribute pairs. The add occurs after the remove

---
**addRepeat** : int = `1`

Number of times to repeat the add operation. Useful for adding the same entity multiple times

---
**delay** : value OR value1 | value2 | ... | valueN OR min..max = `0`

Delay in seconds before entities are added and/or removed. If an **events** is specified then the delay is started when the event is received

---
**events** : string = ""

Add and/or remove entities after a matching event has been received.  If a **delay** is present then start the delay after this event has been received

---
**remove** : string[] = ""

Descendants of this component's entity, which match any selector in this list is removed. The remove occurs before the add

---
**source** : string = ""

Optional source entity to listen for **event**.  If not specified use this component's entity

---
**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). If **source** is empty, then the listen on the document (`document`), the parent (`parent`), or this component's entity (`self`)

