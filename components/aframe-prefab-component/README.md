# prefab

Replaces all child elements with the elements from a given template.  The prefab may contain additional attributes which are evaluated as part of the [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)

e.g.
```html
<script id="example" type="x-template">
  <a-box color="${_boxCol}" position="0 0 1"></a-box>
  <a-sphere color="${_sphereCol}" scale="1 1 1" position="-1 0 0"></a-sphere>
</script>
<a-entity prefab="template: #example; _boxCol: red; _sphereCol: blue"></a-entity>
```

## Properties

**debug**: boolean = `false`

Outputs an html string of the completed template to console.log

---
**template**: string = ""

Either a selector, a `url(<filename>)` or an inline string representing the template.  The text of the template is treated like a [template literal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals) and attributes of the component are passed as variables

---
**\<property\>**: string = ""

A custom attribute that can be used as a variable in the template.  The contents of the attribute are passed as a string to the template