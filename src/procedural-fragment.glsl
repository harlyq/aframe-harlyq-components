precision highp float;
#pragma glslify: voronoi3d = require('glsl-voronoi-noise/2d')
// varying vec2 vUv;

// could use levels low, high, mid, black, white (mid maps to (black + white)/2)
float remap(float v, float amin, float amax, float bmin, float bmax)
{
  return (v - amin)*(bmax - bmin)/(amax - amin) + bmin;
}

float rand(const vec2 n)
{
  return fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);
}

// const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
// const vec2 mys = vec2(1e4, 1e6);

// vec2 rhash(vec2 uv) {
//   uv *= myt;
//   uv *= mys;
//   return fract(fract(uv / mys) * uv);
// }

float noise(const vec2 n)
{
  const vec2 d=vec2(0.0,1.0);
  vec2 b=floor(n), f=smoothstep(vec2(0.0), vec2(1.0), fract(n));
  return mix( mix( rand(b), rand(b+d.yx), f.x ), mix( rand(b+d.xy), rand(b+d.yy), f.x ), f.y );
}

float fbm(vec2 n) {
  float total=0.0,amplitude=1.0;

  for (int i=0; i<4; i++)
  {
    total+=noise(n)*amplitude;
    n+=n;
    amplitude*=0.5;
  }

  return total;
}

float turbulence(const vec2 P)
{
  float val=0.0;
  float freq=1.0;

  for (int i=0; i<4; i++)
  {
    val+=abs(noise(P*freq)/freq);
    freq*=2.07;
  }

  return val;
}

float roundF(const float number)
{
  return sign(number)*floor(abs(number)+0.5);
}

vec2 brickUV(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0)
  {
    xi=xi-0.5;
  }
  float nxi=roundF(xi);

  return vec2((xi-floor(xi))*numberOfBricksHeight,(yi-floor(yi))*numberOfBricksWidth);
}

float brick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight, const float jointWidthPercentage, const float jointHeightPercentage)
{
  float yi=uv.y*numberOfBricksHeight;
  float nyi=roundF(yi);
  float xi=uv.x*numberOfBricksWidth;
  if (mod(floor(yi),2.0) == 0.0) { xi = xi - 0.5; } // offset every second brick
  float nxi=roundF(xi);
  xi = abs(xi - nxi);
  yi = abs(yi - nyi);

  return 1. - clamp( min(yi/jointHeightPercentage, xi/jointWidthPercentage) + 0.2, 0., 1. );
}

vec3 marbleColorize(vec3 color, float x)
{
  x=0.5*(x+1.);
  x=sqrt(x); 
  x=sqrt(x);
  x=sqrt(x);
  color=color*vec3(.2+.75*x); 
  // color.b*=0.95; 
  return color;
}

float marble(const vec2 uv, float amplitude, float t)
{
  t = 6.28*uv.x/t;
  t += amplitude*turbulence(uv.xy);
  t = sin(t);
  t = .5*(t + 1.);
  t = sqrt( sqrt( sqrt(t) ) ); 
  return .2 + .75*t;
}

float checkerboard(const vec2 uv, const float numCheckers)
{
  float cx = floor(numCheckers * uv.x);
  float cy = floor(numCheckers * uv.y);
  return sign( mod(cx + cy, 2.) );
}

float gaussian(const vec2 uv, const float repeat)
{
  vec2 xy = (uv - .5)*2.;
  float exponent = dot(xy,xy)/0.31831;
  return exp(-exponent);
}

// float voronoi2d(const in vec2 point) {
//   vec2 p = floor(point);
//   vec2 f = fract(point);
//   float res = 0.0;
//   for (int j = -1; j <= 1; j++) {
//     for (int i = -1; i <= 1; i++) {
//       vec2 b = vec2(i, j);
//       vec2 r = vec2(b) - f + rhash(p + b);
//       res += 1. / pow(dot(r, r), 8.);
//     }
//   }
//   return pow(1. / res, 0.0625);
// }
