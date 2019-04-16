## wait-emit

Once one of the the **source** selector elements has received **inEvent** and **delay** seconds have passed, sends **outEvent** to all elements matching the **target** selector. The **wait-emit** component is useful for remapping and redirecting events

This component can appear multiple times on a single entity

e.g.
```html
<a-entity wait-emit="event: click; delay: 1; source: #button; target: .door"></a-entity>
```
Once the element `#button` receives the `click` event, wait `1` second, then send the `click` event (because no **out** was re-use the input **event**) to all the `.door` elements

```html
<a-entity wait-emit="event: click; delay: 1; source: .button; sourceScope: self; out: open; target: .door; targetScope: self"></a-entity>
```
Once a child element (`sourceScope: self`) matching selector `.button` receives the `click` event, wait `1` second, then send the `open` event to all children (`targetScope: self`) matching selector `.door`

## Properties

**delay** : number = `0`

wait for this many seconds before sending **outEvent**.  If **inEvent** is specified, then only start the delay once **inEvent** is received

---
**event** : string = ""

event to listen for

---
**out** : string = ""

output event to send.  This event will contain a **detail** attribute which contains the data from the **inEvent** (if used)

---
**source** : string = ""

a selector defining the source entities to listen for **inEvent** on.  **sourceScope** can be used to restrict this selector to a part of the DOM hierarchy.  If not specified we listen on the component's entity

---
**sourceScope** : document | self | parent = `document`

Limit the scope of the **source** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). If **source** is empty, then the listen on the document (`document`), the parent (`parent`), or this component's entity (`self`)

---
**target** : string = ""

Selector for sending events to.  This selector can be scoped with **targetScope**

---
**targetScope** : document | self | parent = `document`

Limit the scope of the **target** attribute to part of the document tree. It can either be the entire document (`document`), the children of the current entity (`self`), or the children of the current entities parent (`parent`). If **target** is empty, then the set is performed on the document (`document`), the parent (`parent`), or this component's entity (`self`)

