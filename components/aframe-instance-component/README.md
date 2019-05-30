# instance

Uses a single instance from the **instance-pool**.  The instance can be synchronized with the position, rotation and scale attributes on the component's entity.

e.g.
```html
<a-box id="box" instance-pool="size: 1"></a-box>
<a-entity instance="src: #box, color: cyan; dynamic: false" position="1 0 0"></a-entity>
```
Creates an **instance-pool** with `1` element, and instanciates a single `cyan` **color**'ed **instance** at `1 0 0`

## Properties

**color** : color = `#fff`

The color of this instance

---
**dynamic** : boolean = `false`

If true, run-time changes to **position**, **scale** and/or **rotation** on this entity will be matched on the instance

---
**src** : selector = ""

The **instance-pool** to use for instances.  Warnings are given if instances are not available
