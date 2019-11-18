# sfxr

AFrame wrapper around the jsfxr (https://github.com/mneubrand/jsfxr) synth.  This component generates procedural sounds, which can be triggered after events and/or delays.

e.g.

## Properties
**_play**: boolean = `false`

Used in the inspector to play the current sound

**_random**: boolean = `false`

Used in the inspector to generate a random sound

**as3fxr**: string = ""

A string compatible with http://superflashbros.net/as3sfxr/. If set, this overrides any specific setting

**delay**: number = `0`

Play a sound after this delay.  If **events** are specified then start the delay once an event is received

**enabled**: boolean = `true`

If `false`, sounds will not be played

**events**: string = ""

Play the sound after receiving one of these (comma separated) events. If the sound is already playing when another event is received, then the sound will be restarted

**masterVolume**: number (0,1) = `0`

0 is silent, 1 is full volume

**playOnChange**: boolean = `false`

If `true`, sounds will be played whnever the parameter is changed. This is useful when tuning a sound in the Inspector

**preset**: `` | `pickup` | `laser` | `explosion` | `powerup` | `hit` | `jump` | `blip` = ``

A preset sound.  If set, this overrides any specific setting and the as3fx string

**waveType**: `square` | `saw` | `sine` | `noise` = `square`

Shape of the waveform

**attackTime**: number (0,1) = `0`
**sustainTime**: number (.18,1) = `.18`
**sustainPunch**: number (0,1) = `0`
**decayTime**: number (0,1) = `0`
**startFrequency**: number (0,1) = `0`
**minFrequency**: number (0,1) = `0`
**slide**: number (-1,1) = `0`
**deltaSlide**: number (-1,1) = `0`
**vibratoDepth**: number (0,1) = `0`
**vibratoSpeed**: number (0,1) = `0`
**changeAmount**: number (-1,1) = `0`
**changeSpeed**: number (0,1) = `0`
**squareDuty**: number (0,1) = `0`
**dutySweep**: number (-1,1) = `0`
**repeatSpeed**: number (0,1) = `0`
**phaserOffset**: number (-1,1) = `0`
**phaserSweep**: number (-1,1) = `0`
**lpFilterCutoff**: number (0,1) = `0`
**lpFilterCutoffSweep**: number (-1,1) = `0`
**lpFilterResonance**: number (0,1) = `0`
**hpFilterCutoff**: number (0,1) = `0`
**hpFilterCutoffSweep**: number (-1,1) = `0`

