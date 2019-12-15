# chess

A component to play chess.  Games can be played against either human or AI opponents, show static setups, watch replays, or just move pieces around without rules.  The board model can be replaced, and layouts and replays can be customized.

The AI is provided by a slightly modified version of https://github.com/glinscott/Garbochess-JS

This component can be networked with **network-aframe**.

## Properties

**aiDuration**: number = `1`

the maximum thinking time in seconds for the AI.  The larger the value the more challenging the AI

---
**aiWorker**: string = `https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/garbochess.js`

the webworker file for the AI.

---
**blackColor**: color = `#444`

optional tint for the black pieces

---
**blackPlayer**: `human | ai` = `ai`

the black player is either `human` or `ai`

---
**boardMesh**: string = ""

The name of the mesh that represents the 8x8 board. This mesh must only represent the black and white squares, as it will be used for aligning the pieces

---
**boardMoveSpeed**: number = `4`

The number of tiles per second that a piece can move (e.g. during an ai move, a replay, or watching another player)

---
**debug**: boolean = `false`

If true, output debug information to the console

---
**fen**: string = `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

A string conforming to [Forsyth-Edwards Notation](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation).  It is used to define the board layout, starting player, castling and en passant rules. 
For **mode** `replay` a *fen* in the **pgn** will override this value

---
**highlightColor**: color = `#ff0`

color of highlights when picking pieces (i.e. as a human player)

---
**maxCountPerPiece**: number = `8`

To minimize draw calls, pieces with the same mesh are instanced.  This value defines the maximum number of instances for a single piece of a single side e.g. white pawn

---
**meshes**: string = `rook,knight',bishop',queen,king,pawn,rook,knight,bishop,queen,king,pawn`

A comma separated list of names of meshes that appear in the **src** model that represent the pieces.  If the name ends in an apostophe (e.g. knight') then the piece will be rotated 180 degrees about the Y axis - which is useful when sharing
pieces between black and white sides.  The meshe names must much the following order `r,n,b,q,k,p,R,N,B,Q,K,P` (e.g. black rook, black knight, black bishop, black queen, black king, black pawn, white rook, white knight, white bishop, white queen, white king, white pawn), and the same mesh name can be used for multiple pieces.

---
**mode**: `freestyle | game | replay | static` = `freestyle`

mode of the game. 
|mode|description|
|---|---|
|`freestyle`|players grab and move pieces, there are no rules applied to the moves, and the board is setup according to **fen**|
|`game`|the **whitePlayer** and **blackPlayer** attribute determine whether the player is an `ai` or `human` and chess rules are enforced for each mode. The first player to move a piece during a human turn will control that side for the rest of the game (or until they leave the room), and it is possible for the same player to control both sides. The **fen** attribute determines the initial setup for the game|
|`replay`|the moves in the **pgn** are replayed and there is no player interaction.  The board setup is defined by the *fen* in the **pgn** or by the **fen** attribute if the **pgn** does not contain a *fen*|
|`static`|the **fen** defines the initial board setup, and the pieces cannot be moved|

---
**model**: string = `https://cdn.jsdelivr.net/gh/harlyq/aframe-harlyq-components@master/examples/assets/chess_set/chess_set.glb`

model which contains the board and pieces.  This may either be a selector for an asset or be a `url(filename)`.  The model should contain the board, and one representation of each piece (this piece may be shared between black and white sides).
The component assumes Y is up and the lower left corner of the board is in negative X, negative Z. All pieces should have their origin at the center of their base and be in the same orientation as the board. If using the **blackColor** and **whiteColor** to tint the pieces, it is recommended that the model pieces are white. Each piece and the board should have a unique name

---
**pgn**: string = ""

a string or `url(filename)` conforming to [Portable Game Notation](https://en.wikipedia.org/wiki/Portable_Game_Notation) which defines the moves for **mode** `replay`.  If a *fen* is defined in the pgn then it overrides the **fen** attribute

---
**replayTurnDuration**: number = `.5`

the minimum time in seconds between turns when **mode** is `replay`

---
**whiteColor**: color = `#eee`

optional tint for the white pieces

---
**whitePlayer**: `human | ai` = `ai`

the white player is either `human` or `ai`
