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

vec2 uvBrick(const vec2 uv, const float numberOfBricksWidth, const float numberOfBricksHeight)
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

float marble(const vec2 uv, float amplitude, float k)
{
  k = 6.28*uv.x/k;
  k += amplitude*turbulence(uv.xy);
  k = sin(k);
  k = .5*(k + 1.);
  k = sqrt( sqrt( sqrt(k) ) ); 
  return .2 + .75*k;
}

float checkerboard(const vec2 uv, const float numCheckers)
{
  float cx = floor(numCheckers * uv.x);
  float cy = floor(numCheckers * uv.y);
  return sign( mod(cx + cy, 2.) );
}

float gaussian(const vec2 uv)
{
  vec2 xy = (mod(uv, vec2(1.,1.)) - .5)*2.;
  float exponent = dot(xy,xy)/0.31831;
  return exp(-exponent);
}

vec2 uvTransform(const vec2 uv, const vec2 center, const vec2 scale, const float rad, const vec2 translate) 
{
  float c = cos(-rad);
  float s = sin(-rad);
  float x = (uv.x - translate.x - center.x);
  float y = (uv.y - translate.y - center.y);
  float x2 = (x*c + y*s)/scale.x + center.x;
  float y2 = (-x*s + y*c)/scale.y + center.y;
  return vec2(x2, y2);
}

vec2 uvCrop(const vec2 uv, const vec2 uvMin, const vec2 uvMax) 
{
  vec2 scale = 1./(uvMax - uvMin);
  return uvTransform(uv, vec2(0.), scale, 0., -uvMin*scale);
}

float normpdf(const float x, const float sigma)
{
  return .39894*exp(-.5*x*x/(sigma*sigma))/sigma;
}

vec4 blur9(const sampler2D image, const vec2 uv, const vec2 resolution, const float sigma)
{
  // kernelWidth = 2*(kernelWidth/2) + 1;
  // int kSize = (kernelWidth - 1)/2;
  // float kernel[kernelWidth];
  const int kernelWidth = 9;
  const int kSize = (kernelWidth)/2 - 1;
  float kernel[kernelWidth];

  float Z = 0.;

  for (int j = 0; j <= kSize; j++)
  {
    kernel[kSize + j] = kernel[kSize - j] = normpdf(float(j), sigma);
  }
  for (int j = 0; j < kernelWidth; j++)
  {
    Z += kernel[j];
  }

  vec4 color = vec4(0.);
  for (int i = -kSize; i <= kSize; i++)
  {
    for (int j = -kSize; j <= kSize; j++)
    {
      color += kernel[kSize + j]*kernel[kSize + i]*texture2D( image, uv + vec2(float(i), float(j))/resolution );
    }
  }

  return color/(Z*Z);
}