#include <procedural-ext>
uniform vec4 backgroundColor;
uniform vec4 fillColor;    
varying vec2 vUv;
void main() {
  gl_FragColor = mix(backgroundColor, fillColor, gaussian(vUv));
}