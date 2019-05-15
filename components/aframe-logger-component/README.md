# logger

Displays console log,warn,error and info messages onto a texture.  Messages can be filtered by type and/or content

The primitive **a-logger** is provided to create a plane geometry to show the messages

e.g
<a-logger></a-logger>

## Properties

**characterWidth**: number = `7.75`

The width in units of each character

---
**columnWidth**: number = `80`

Number of characters to show before wrapping the text

---
**filter**: string = ""

A [regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes) for filtering the message string.

---
**font**: string = `1em monospace`

A CSS string of the font to use.

---
**lineHeight**: number = `12`

The spacing (in pixels) between each line

---
**maxLines**: number = `20` 

The maximum number of lines to show at once.  Old lines are removed from the top and new lines added to the bottom. The height of the texture in units is given by **maxLine** x **lineHeight**

---
**offset**: vec2 = `{x:2, y:2}`

The number of units (x and y) to offset the top left of the text

---
**types**: array: `log,error,warn`

A comma separated list of the types to show on the logger, may be any combination of `log`, `warn`, `error` and `info`

