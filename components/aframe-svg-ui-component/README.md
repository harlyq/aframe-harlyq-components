# svg-ui

The **svg-ui** component provides an interactable user interface (UI) based upon an SVG template, by generating a texture from the SVG and assigning it to the *map* of the `mesh` object.  If a cursor component is available, it generates **svg-ui-click** events when the user clicks on a UI element, and the rasycaster component will generate **svg-ui-enter** and **svg-ui-leave** events when hovering.  The SVG string is treated as a [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), and attributes on the component are passed to the template before being used to generate a texture

The SVG template does NOT support CSS styles inside the SVG or as part of the document (it is ignored).  Because the texture is not interactable, a second svg is generated and placed at (0,0) on the page, and used for determining interactions. This second svg will be visible if **a-sky** and **background** components are not used, which can be useful for debugging

e.g.
```html
<a-entity laser-controls="hand: right" line="color: yellow" raycaster="objects: [svg-ui]; far: 5"></a-entity>
<script id="ui_template" type="x-template">
  <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" version="1.1">
    <circle cx="50" cy="50" r="30" cursor="move" fill="${_col}"/>
  </svg>
</script>
<a-plane position="0 0 -2" svg-ui="template: #ui_template; clickSelector: circle; _col=blue"
  wait-set="event: svg-ui-click; svg-ui._col=red"
></a-plane>
```
The last controls setup a `yellow` laser in the `right` hand which intersects any objects with an `svg-ui` template less than `5`m from the controller.  The UI is placed upon an `a-plane` and uses the template described in `#ui_template`.  This template is an svg rectangle with a circle near the middle, who's color is determined by the `_col` variable.  The **_col** variable is set to `blue` on the `svg-ui` component, and the component will generate `svg-ui-click` events whenever the user clicks on elements that match the `circle` **clickSelector**.  The **wait-set** takes the **svg-ui-click** events and sets the **svg-ui._col** to `red`, which will force a rebuild of the template and show a red circle on the UI texture

## Properties

**bubbles**: boolean = `false`

If true, events bubble up through the hierarchy, otherwise they only appear on this entity (slightly more efficient)

---
**clickSelector**: string = ""

A selector which defines the svg elements that will generate `svg-ui-click` events.  The clicks work by capturing a `click` event received on the object and then using a **raycaster** component (which has this entity in it's **objects** list) to determine where the object was clicked.  Both `click` event and **raycaster** component are automatically provided when using a **cursor** component

---
**debug**: boolean = `false`

If true, show debugging information about clicks, hovers and SVG strings

---
**hoverSelector**: string = ""

A selector which defines the svg elements that will generate `svg-ui-enter` and `svg-ui-leave` events.  There must a **raycaster** component somewhere which will generate the `raycaster-intersected` and `raycaster-intersected-cleared` events on this entity, which we can utilise to determine where the ray is hovering.  The **raycaster** component is provided automatically when using a **cursor** component

---
**resolution**: vec2 = `{x: 512, y:512}`

The resolution of the texture onto which the SVG is generated. The lower the resolution the blurier the texture.  For WebGL1 the resolution dimensions will be forced to powers of 2 by the renderer

---
**template**: string = ""

An SVG string, reference to a **script** element which contains the SVG string, or a `url(<filename>)` which contains the svg text.  This string is treated as a [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals), and all attributes on the component are available to the template. This is useful for dynamically updating the SVG, as any changes to the attributes will regenerate the SVG texture.  If the svg contains any animation add a **texture-updater** component, to ensure the changes are re-rendered every frame.  If errors occur in the template, then reloading the page with the browser's developer tools active may provide more insight into the problem.

---
**\<attribute\>**: string = ""

Custom attributes that can be added to the component.  These attributes can be used in the svg of the **template** to dynamically update the SVG texture