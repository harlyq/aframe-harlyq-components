# trigger-zone

Provides a rectangular zone which sends events when an object's oriented bounding box enters that zone.

e.g.

## Events

EVENT | DESCRIPTION
--|--
trigger-zone-enter | sent when a **triggerSelectors** entity enters the zone. Sent with `{ detail: { zoneTarget: HTMLElement, zoneSource: HTMLElement } }`
trigger-zone-leave | sent when a **triggerSelectors** entity leaves the zone. Sent with `{ detail: { zoneTarget: HTMLElement, zoneSource: HTMLElement } }`

## Properties

**bubbles**: boolean = `false`

If true, events bubble up the hierarchy, otherwise they are only sent to the relevant trigger entity and to the trigger-zone entity (which is slightly better for CPU usage)

---
**debug**: boolean = `false`

When enabled show (cyan) debug boxes around the trigger entities and a (blue for enabled, grey for disabled) debug box around the trigger zone

---
**enabled**: boolean = `true`

Enable or disble the trigger events

---
**test**: `within` | `overlap` = `overlap`

Overlapping occurs when either there is any overlap between the oriented bounding boxes (`overlap`) or the trigger entity is completely within the zone (`within`)

---
**tickMS**: number = `100`

Period at which we check for overlapping trigger entities in the zone.  Higher values can miss fast moving targets, but have lower CPU usage

---
**triggerSelectors**: string = ""

Selector for the trigger entities

---
**watch**: boolean  = `false`

If true, then re-determine the trigger entities when entities are added/removed from the scene. This is useful if new entities can be created at run-time, but adds extra CPU usage whenever the entities are reprocessed