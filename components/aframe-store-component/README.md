# store

The **store** component provides a simple collection of user defined key-value pairs.  The **store-bind** component can be used to automatically set the attributes on an entity when the associated **store** is modified.

These components can exist multiple times on an entity

e.g.
```html
<a-scene store__a="_param1: blue">
  <a-box color="orange" store-bind__1="store: a-scene; from: store__a._param1; to: color"></a-box>
</a-scene>
```
Bind's the **color** attribute on the **a-box** to the **store_a.param1** attribute on the **a-scene**, thus setting the box color to `blue`

## store Properties

**type**: `temporary` | `local` | `session` = `temporary`

When set to `local`, the data is stored in the browser local data and will persist until the app data is manually cleared from the browser (running a web page via a localhost may clear the data when the browser is shutdown).  `session` data persists while the browser is running (even if the page is reloaded). 
`temporary` data only exists while the page is running and will be cleared if the page is reloaded.

## store-bind Properties

**from**: string = ''

The store component attribute to bind to

---
**store**: selector = ''

A selector for the entity with the **store**

---
**to**: string = ''

The attribute on this entity to set with the value from the store.  This value will be set whenever the **from** attribute changes.
