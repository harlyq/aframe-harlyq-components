# svg-ui

The **svg-ui** component provides an interactable user interface (UI) based upon an SVG template, by generating a texture from the SVG and assigning it to the `material.src` (aka *map* of the `mesh` object).  If a cursor component is available, it generates **svg-ui-click** events when the user clicks on a UI element.  If a **raycaster** component is configured to intersect with the entity then it will potentially generate hover and touch related events.  The SVG string is treated as a [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), and attributes on the component are passed to the template before being used to generate a texture

The **svg-ui** does NOT apply CSS styles defined outside of the SVG or in CDATA sections, but it does support the `<style>` element.  Because current web technology does not support interacting with the texture, a second svg is generated and placed at (0,0) on the page, which is used for determining interactions. This second svg will be visible in 2D if **a-sky** or **background** components are NOT used (which can be useful for debugging)

e.g.
```html
<a-entity laser-controls="hand: right" line="color: yellow" raycaster="objects: [svg-ui]; far: 5"></a-entity>
<script id="ui_template" type="x-template">
  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" version="1.1">
    <style>.hover { stroke: red }</style>
    <circle id="a" cx="50" cy="50" r="30" fill="${_col}"/>
  </svg>
</script>
<a-plane position="0 0 -2" svg-ui="template: #ui_template; clickSelectors: circle; hoverSelectors: #a; useHoverClass: true; _col=blue"
  wait-set="events: svg-ui-click; svg-ui._col=red"
></a-plane>
```
The **laser-controls** setup a `yellow` laser in the `right` hand which intersects any element with an `svg-ui` attribute less than `5`m from the controller.  The UI is placed upon an **a-plane** and uses the template described in `#ui_template`.  This template is an svg `circle` near the middle, who's color is determined by the `${_col}` template expression.  The **_col** variable is set to `blue` on the `svg-ui` component, and the component will generate `svg-ui-click` events whenever the user clicks on elements that match the `clickSelectors: circle`.  The **wait-set** component takes the **svg-ui-click** events and sets the `svg-ui._col` to `red`, which will force a rebuild of the template and show a red circle on the UI texture. The `useHoverClass: true` applies the class `hover` whenever the raycaster hovers over `#a`, which will style the element `#a` will a `stroke: red`

## Events
| EVENT | DESCRIPTION |
| - | - |
| **svg-ui-click** | sent when a `click` event is received, and interaction was on a **clickSelectors** compatible element. Sent for each element with `detail: { uiTarget: HTMLElement, intersection: Intersection }` |
| **svg-ui-hoverend** | sent when ALL **raycaster** components intersecting this entity, no longer intersect this **hoverSelectors** compatible element. Sent for each element with `detail: { uiTarget: HTMLElement, hovers: string[] }`, hovers is a list of ids of all active hover elements. |
| **svg-ui-hoverstart** | sent when ANY **raycaster** components intersecting this entity, intersects a **hoverSelectors** compatible element that is not currently intersected by another **raycaster**. Sent with `detail: { uiTarget: HTMLElement, hovers: string[] }`, hovers is a list of ids of all active hover elements |
| **svg-ui-touchend** | sent when ANY **raycaster** component intersecting this entity, no longer intersects or within the **touchDistance** of a **touchSelectors** compatible element. Sent for each element with `detail: { uiTarget: HTMLElement, intersection: Intersection, touches: string[] }`, touches is a list of ids of all active touch elements |
| **svg-ui-touchstart** | sent when ANY **raycaster** component intersecting this entity, intersects and is within **touchDistance** of a **touchSelectors** compatible element. Sent with `detail: { uiTarget: HTMLElement, intersection: Intersection, touches: string[] }`, touches is a list of ids of all active touch elements |
| **svg-ui-touchmove** | sent when ANY **raycaster** component intersecting this entity, intersects and is within **touchDistance** of a **touchSelectors** compatible element and has moved **touchDeadZone** units from its last `touchmove` (or `touchstart` if this is the first move) position. Sent with `detail: { uiTarget: HTMLElement, intersection: Intersection, touches: string[] }`, touches is a list of ids of all active touch elements |

Hover and touch events are sent independently, so both can occur at the same time. All events are sent to the **svg-ui** component's entity. Touch events are also sent to the **raycaster** component's entity.

Type `Intersection` represents `{ distance: number, point: {x,y,z}, face: THREE.Face, faceIndex: index, object: THREE.Object3D, uv: {x,y}, svg: {x,y} }` where 
* `distance` is meters between the origin of the ray and the intersection
* `point` is the intersection point in world coordinates
* `face` is the threejs face intersection
* `faceIndex` is the index of the face
* `object` is the threejs object that is being intersected
* `uv` is the uv coords at intersection
* `svg` is the xy user coords in viewbox space of the intersection

<aside class="warning">
For hover and touch events to work correctly, the elements that could be returned as a uiTarget must have a unique (within the svg) id and must have a visible representation (i.e. `g` elements and `fill: none` are not selectable).  Ids are used because they are consistent even when the svg is updated.
</aside>

## Properties

**bubbles**: boolean = `false`

If true, events bubble up through the hierarchy, otherwise they only appear on this entity (slightly more efficient)

---
**clickSelectors**: string = ""

A selector which defines the svg elements that will generate `svg-ui-click` events.  The clicks work by capturing a `click` event received on the object to determine where the object was clicked.  The `click` event is automatically provided when using a **cursor** component

---
**debug**: boolean = `false`

If true, show debugging information about clicks, hovers and SVG strings

---
**enabled**: boolean = `true`

Enable or disable to generation of events from the svg-ui

---
**hoverSelectors**: string = ""

A selector which defines the svg elements that will generate `svg-ui-hoverstart` and `svg-ui-hoverend` events.  There must a **raycaster** component somewhere which will generate the `raycaster-intersected` and `raycaster-intersected-cleared` events on this entity, which we can utilise to determine where the ray is hovering.  The **raycaster** component is provided automatically when using a **cursor** component

---
**interactIfOccluded**: boolean = `false`

If false, then the touch and hover interactions only work if this element is the first hit by the raycaster (i.e. picks the front-most svg-ui panel)

---
**resolution**: vec2 = `{x: 512, y:512}`

The resolution of the texture onto which the SVG is generated. The lower the resolution the blurier the texture.  For WebGL1 the resolution dimensions will be forced to powers of 2 by the renderer

---
**template**: string = ""

An SVG string, reference to a **script** element which contains the SVG string, or a `url(<filename>)` which contains the svg text.  This string represents the SVG but is processed as a [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), so all attributes on the component are available to the template. This is useful for dynamically updating the SVG, as any changes to the attributes will regenerate the SVG texture.  If the svg contains any animation add a **texture-updater** component (may not work with Firefox), to ensure the changes are re-rendered every frame.  If errors occur in the template, then reloading the page with the browser's developer tools active may provide more insight into the problem (the `debugger` keyword can also be used in any code sections to set a breakpoint). The SVG texture is more sensitive to malformed SVG than the SVG in html (so the interaction svg may appear, but the svg texture is black), so check for invalid keywords and use double rather than single quotes

Setting `type="x-template"` in the **script** element will prevent the browser from trying to execute the text and generating an error, although not having the type usually provides auto-completion in the editor

Because we are converting the svg to an image for displaying on a mesh, the `xmlns="http://www.w3.org/2000/svg"` attribute is mandatory in the svg

---
**touchDeadZone**: number = `.5`

Minimum distance (in user coordinates, as defined by the ViewBox on the svg) to move before a touch event is sent

---
**touchDistance**: string = ""

Maximum distance (m) for registering a touch for the **touchSelectors**

---
**touchSelectors**: string = ""

Selectors to define elements for touches, and generate `svg-ui-touchstart` and `svg-ui-touchend`.  Touches occur when the distance between the **raycaster** origin and contact point are less than **touchDistance**. There must a **raycaster** component somewhere which will generate the `raycaster-intersected` and `raycaster-intersected-cleared` events on this entity, which we can utilise to determine where the ray is touching.

---
**useHoverClass**: boolean = `false`

If true, then the class `hover` is added to the element when hover is active.  This can be used by custom styles INSIDE the svg (external styles won't work)

---
**\<attribute\>**: string = ""

Custom attributes that can be added to the component.  These attributes can be used in the svg of the **template** to dynamically update the SVG texture