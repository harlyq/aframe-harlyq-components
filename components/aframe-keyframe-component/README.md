## keyframe

Animates a set of attributes on an element over time.  The attributes support dot notation (e.g. component.property), and the values can be fixed, a set of options or a range of values. An easing function defines the style of the interpolation curve between values, and the interpolations can be looped a number of times

This component can appear multiple times on a single entity

e.g.
```html
<a-box keyframe="duration: 5; direction: alternate; color: ,red; position: ,1 1 1, 0 0 2"></a-box>
```
performs an animation which loops every `5` seconds, alterating direction. The forward direction has a color from the original color to `red`, and from the original position to `1 1 1` halfway through, then finishing at `0 0 2`.  For the backward direction, the color goes from `red` to the original color, and from `0 0 2` to `1 1 1` at 2.5 seconds, then finishes at the original position

```html
<a-box keyframe="duration: 10.5; direction: forward; material.color: ,red|black,,green->blue; "       
       material="transparent: true; opacity: 0.1; color: yellow"></a-box>
```
this animation is `10.5` seconds long.  It changes the **material.color** from the original color (`yellow`), to a random choice between `red` and `black`, then back to the original color (`yellow`), and finally to a random color between `green` and `blue`.  Each loop repeats the same sequence (`forward`)

## Properties

**direction** : `forward | backward | alternate` = `forward`

The direction of each iteration, forward animates from the first values to the last, backward from the last to the first and alternate, starts with forward, then alternates direction each iteration

---
**duration** : number = `1`

The time in seconds for a keyframe sequence to perform a single iteration

---
**enabled**: boolean = `true`

When **enabled** is `false` the keyframing is paused

---
**easing** : `linear | ease | ease-cubic | ease-quad | ease-quart | ease-quint | ease-sine | ease-expo | ease-circ | ease-elastic | ease-back | ease-bounce` = `linear`

An easing function to use for the interpolation.  Each type (except linear) also has in, out and in-out forms e.g `ease-in-quint`, `ease-out-quint`, `ease-in-out-quint`. See https://sole.github.io/tween.js/examples/03_graphs.html for example curves

---
**loops** : number = `-1`

The number of loops to perform. If -1 then the animation never stops

---
**randomizeEachLoop** : boolean = `true`

If true, re-evaluate the random values before the start of each loop

---
**seed** : int = `-1`

The seed to use for the random number generator. If -1 then a different random seed is chosen each time the component is invoked.  A fixed seed is useful for producing consistent random sequences

---
**\<property\>** : value OR value1 | value2 | ... | valueN OR min->max []

Custom attribute which defines a property to set.  This property can use dot notation (e.g. component.property) and value is an array of either: a single value; a list of options (separated by `|`) where one is chosen at random; or a range of two values separated by `->` where a random number is chosen which is greater than or equal to the first value and less than the second value. For the range operator (`->`) the values may be either vectors of numbers (eg. a single number, vec2, vec3 or vec4) or colors

The value can also be a comma separate list, with the first value for the start of the animation, the last for the end, and intermediate values are evenly distributed across the timeline.  All missing values are treated as maintaining their existing value

When color values are used in a range e.g. `rgb(0,1,0)->red`, the interpolation is performed in RGB space
