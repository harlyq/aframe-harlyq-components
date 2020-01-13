# card-pack

Creates a pack of playing cards. The cards are stacked in Y-up orientation.  The **card-pack** integrates with the **grab-system** so that cards can be moved by a controller.

**card-pack** is compatible with **networked-aframe**. The position and orientation of each card is updated after it has been moved.

## Properties

**back**: number = `54`

The texture frame for the back of the card (see **textureCols** and **textureRows** for setting up a frame)

---
**debug**: boolean = `false`

If true, outputs debug information to the console

---
**faceDown**: boolean = `false`

If true, the cards start facedown

---
**frontStart**: number = `0`

The beginning frame for the first card, this frame increases by 1 for each consecutive card (for **numCards**)

---
**grabbable**: boolean = `true`

If true, the cards can be grabbed and moved around

---
**height**: number = `1`

The height (in meters) for each card (this is the Z direction)

---
**hoverColor**: color = `#888`

The color to apply to the cards when hovered over (un-hovered cards are white (#fff))

---
**numCards**: number = `54`

The number of cards in the pack

---
**src**: asset = `https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/assets/Svg-cards-2.0.svg`

The texture for the card faces and back.

---
**textureCols**: number = `13`

The number of frame columns.  Frame 0 will be the top-left position, frames are in row-major order https://en.wikipedia.org/wiki/Row-_and_column-major_order

---
**textureRows**: number = `5`

The number of frame rows. Frame 0 will be the top-left position, frames are in row-major order https://en.wikipedia.org/wiki/Row-_and_column-major_order

---
**width**: number = `.67`

The width (in meters) of each card (this is the X direction)

---
**yOffset**: number = `0.001`

The offset in the Y direction for each card in the stack (the offset accumulates i.e. the first card is 0*offset, the second 1*offset, the third 2*offset etc)
