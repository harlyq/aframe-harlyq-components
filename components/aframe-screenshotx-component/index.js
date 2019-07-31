// adapted from 
// https://github.com/aframevr/aframe/blob/master/src/components/scene/screenshot.js
// https://github.com/mrdoob/three.js/blob/dev/examples/webgl_depth_texture.html

/* global ImageData, URL */
// var registerComponent = require('../../core/component').registerComponent;
// var THREE = require('../../lib/three');

var EQUIRECTANGULAR_VERTEX_SHADER = [
  'attribute vec3 position;',
  'attribute vec2 uv;',
  'uniform mat4 projectionMatrix;',
  'uniform mat4 modelViewMatrix;',
  'varying vec2 vUv;',
  'void main()  {',
  '  vUv = vec2( 1.- uv.x, uv.y );',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
  '}'
].join('\n');

var EQUIRECTANGULAR_FRAGMENT_SHADER = [
  'precision mediump float;',
  'uniform samplerCube map;',
  'varying vec2 vUv;',
  '#define M_PI 3.141592653589793238462643383279',
  'void main() {',
  '  vec2 uv = vUv;',
  '  float longitude = uv.x * 2. * M_PI + .5 * M_PI;',
  '  float latitude = uv.y * M_PI;',
  '  vec3 dir = vec3(',
  '    - sin( longitude ) * sin( latitude ),',
  '    cos( latitude ),',
  '    - cos( longitude ) * sin( latitude )',
  '  );',
  '  normalize( dir );',
  '  gl_FragColor = vec4( textureCube( map, dir ).rgb, 1.0 );',
  '}'
].join('\n');

var DEPTH_VERTEX_SHADER = [
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n')

var DEPTH_FRAGMENT_SHADER = [
  '#include <packing>',
  'varying vec2 vUv;',
  'uniform sampler2D tDepth;',
  'uniform float cameraNear;',
  'uniform float cameraFar;',
  'uniform float maxDepth;',
  'float readDepth( sampler2D depthSampler, vec2 coord ) {',
  '  float fragCoordZ = texture2D( depthSampler, coord ).x;',
  '  float z_n = 2.0 * fragCoordZ - 1.0;',
  '  float z_e = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z_n * (cameraFar - cameraNear));',
  '  return clamp(z_e/maxDepth, 0., 1.);',
  '}',
  'void main() {',
  '  //gl_FragColor.rgb = vec3(vUv.x, vUv.y, 0.0);',
  '  //gl_FragColor.rgb = texture2D( tDepth, vUv ).rgb;',
  '  float depth = readDepth( tDepth, vUv );',
  '  gl_FragColor.rgb = 1.0 - vec3( depth );',
  '  gl_FragColor.a = 1.0;',
  '}'
].join('\n')

/**
 * Component to take screenshots of the scene using a keboard shortcut (alt+s).
 * It can be configured to either take 360&deg; captures (`equirectangular`)
 * or regular screenshots (`projection`)
 *
 * This is based on https://github.com/spite/THREE.CubemapToEquirectangular
 * To capture an equirectangular projection of the scene a THREE.CubeCamera is used
 * The cube map produced by the CubeCamera is projected on a quad and then rendered to
 * WebGLRenderTarget with an ortographic camera.
 */
AFRAME.registerComponent('screenshotx', {
  schema: {
    width: {default: 4096},
    height: {default: 2048},
    camera: {type: 'selector'},
    maxDepth: {default: 10},
  },

  init: function () {
    this.setup = this.setup.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this);

    const el = this.el

    if (el.renderer) {
      this.setup();
    } else {
      el.addEventListener('render-target-loaded', this.setup);
    }
  },

  setup() {
    var gl = this.el.renderer.getContext();
    if (!gl) { return; }

    this.cubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    this.orthographicCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
    
    this.screenshot = {}
    this.screenshot.canvas = document.createElement('canvas');
    this.screenshot.ctx = this.screenshot.canvas.getContext('2d');

    this.equirectangular = {}
    this.equirectangular.material = new THREE.RawShaderMaterial({
      uniforms: {map: {type: 't', value: null}},
      vertexShader: EQUIRECTANGULAR_VERTEX_SHADER,
      fragmentShader: EQUIRECTANGULAR_FRAGMENT_SHADER,
      side: THREE.DoubleSide
    });
    const equirectangularQuad = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(2, 2),
      this.equirectangular.material
    );
    this.equirectangular.scene = new THREE.Scene()
    this.equirectangular.scene.add(equirectangularQuad)

    this.depth = {}
    this.depth.canvas = document.createElement('canvas');
    this.depth.ctx = this.depth.canvas.getContext('2d');
    this.depth.material = new THREE.ShaderMaterial( {
      vertexShader: DEPTH_VERTEX_SHADER,
      fragmentShader: DEPTH_FRAGMENT_SHADER,
      uniforms: {
        cameraNear: { value: 0 },
        cameraFar: { value: 0 },
        maxDepth: { value: 0 },
        tDepth: { type: 't', value: null }
      }
    } );
    const depthQuad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), this.depth.material );
    this.depth.scene = new THREE.Scene()
    this.depth.scene.add(depthQuad)
  },

  createRenderTarget: function (width, height) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    target.stencilBuffer = false
    target.depthBuffer = true

    return target
  },

  play: function () {
    window.addEventListener('keydown', this.onKeyDown);
  },

  pause: function() {
    window.removeEventListener('keydown', this.onKeyDown);
  },

  /**
   * <ctrl> + <alt> + s = Regular screenshot.
   * <ctrl> + <alt> + <shift> + s = Equirectangular screenshot.
  */
  onKeyDown: function (evt) {
    const shortcutPressed = evt.keyCode === 83 && evt.ctrlKey && evt.altKey;
    if (this.data && shortcutPressed) {
      const baseFilename = `screenshot${document.title ? '+' + document.title.toLowerCase() : ''}-${Date.now()}`;
      this.capture( evt.shiftKey ? 'equirectangular' : 'perspective', baseFilename )
    }
  },

  capture(projection, baseFilename = undefined) {
    const renderer = this.el.renderer
    const wasVREnabled = renderer.vr.enabled
    renderer.vr.enabled = false

    const camera = (this.data.camera && this.data.camera.components.camera.camera) || this.el.camera
    const size = { width: this.data.width, height: this.data.height }

    if (projection === 'perspective') {
      this.capturePerspective(camera, size)
    } else {
      this.captureEquirectangular(camera, size)
    }

    if (baseFilename) {
      this.saveCapture(this.screenshot.canvas, baseFilename + '.png');

      if (projection === 'perspective') {
        this.saveCapture(this.depth.canvas, baseFilename + '_depth.png');
      }
    }

    renderer.vr.enabled = wasVREnabled

    return this.screenshot.canvas
  },

  capturePerspective(camera, size) {
    const renderer = this.el.renderer

    const screenshotOutput = this.createRenderTarget(size.width, size.height)
    screenshotOutput.depthTexture = new THREE.DepthTexture()
    screenshotOutput.depthTexture.type = THREE.UnsignedShortType

    renderer.clear()
    renderer.setRenderTarget( screenshotOutput )
    renderer.render( this.el.object3D, camera )

    this.screenshot.canvas.width = size.width
    this.screenshot.canvas.height = size.height
    this.copyRenderTargetToCanvas( renderer, screenshotOutput, this.screenshot.ctx, size, true )

    const depthUniforms = this.depth.material.uniforms
    depthUniforms.tDepth.value = screenshotOutput.depthTexture
    depthUniforms.cameraNear.value = camera.near
    depthUniforms.cameraFar.value = camera.far
    depthUniforms.maxDepth.value = this.data.maxDepth

    const depthOutput = this.createRenderTarget(size.width, size.height)    
    renderer.setRenderTarget( depthOutput )
    renderer.render( this.depth.scene, this.orthographicCamera )

    this.depth.canvas.width = size.width
    this.depth.canvas.height = size.height
    this.copyRenderTargetToCanvas( renderer, depthOutput, this.depth.ctx, size, true )

    renderer.setRenderTarget(null);
  },

  captureEquirectangular(camera, size) {
    const el = this.el
    const renderer = el.renderer

    // Create cube camera and copy position from scene camera.
    // NOTE: CubeCamera does not support a depthTexture
    var cubeCamera = new THREE.CubeCamera( camera.near, camera.far, Math.min(this.cubeMapSize, 2048) )
    // cubeCamera.renderTarget.depthTexture = new THREE.DepthTexture()
    // cubeCamera.renderTarget.depthTexture.type = THREE.UnsignedShortType

    // Copy camera position into cube camera;
    camera.getWorldPosition( cubeCamera.position )
    camera.getWorldQuaternion( cubeCamera.quaternion )

    // Render scene into the cube camera texture
    cubeCamera.update( el.renderer, el.object3D )

    const output = this.createRenderTarget(size.width, size.height)

    this.equirectangular.material.uniforms.map.value = cubeCamera.renderTarget.texture

    renderer.clear()
    renderer.setRenderTarget( output )
    renderer.render( this.equirectangular.scene, this.orthographicCamera )

    this.screenshot.canvas.width = size.width
    this.screenshot.canvas.height = size.height
    this.copyRenderTargetToCanvas( renderer, output, this.screenshot.ctx, size, false )

    // this.equirectangular.material.uniforms.map.value = cubeCamera.renderTarget.depthTexture

    // renderer.clear()
    // renderer.setRenderTarget( output )
    // renderer.render( this.equirectangular.scene, this.orthographicCamera )

    // const depthUniforms = this.depth.material.uniforms
    // depthUniforms.tDepth.value = output.texture
    // depthUniforms.cameraNear.value = camera.near
    // depthUniforms.cameraFar.value = camera.far

    // const depthOutput = this.createRenderTarget(size.width, size.height)    
    // renderer.setRenderTarget( depthOutput )
    // renderer.render( this.depth.scene, this.orthographicCamera )

    // this.depth.canvas.width = size.width
    // this.depth.canvas.height = size.height
    // this.copyRenderTargetToCanvas( renderer, output, this.depth.ctx, size, false )

    renderer.setRenderTarget(null);
  },

  flipPixelsVertically: function (pixels, width, height) {
    var flippedPixels = pixels.slice(0);
    for (var x = 0; x < width; ++x) {
      for (var y = 0; y < height; ++y) {
        flippedPixels[x * 4 + y * width * 4] = pixels[x * 4 + (height - y) * width * 4];
        flippedPixels[x * 4 + 1 + y * width * 4] = pixels[x * 4 + 1 + (height - y) * width * 4];
        flippedPixels[x * 4 + 2 + y * width * 4] = pixels[x * 4 + 2 + (height - y) * width * 4];
        flippedPixels[x * 4 + 3 + y * width * 4] = pixels[x * 4 + 3 + (height - y) * width * 4];
      }
    }
    return flippedPixels;
  },

  /**
   * Download capture to file.
   */
  saveCapture: function(canvas, fileName) {
    canvas.toBlob(function (blob) {
      var linkEl = document.createElement('a');
      var url = URL.createObjectURL(blob);
      linkEl.href = url;
      linkEl.setAttribute('download', fileName);
      linkEl.innerHTML = 'downloading...';
      linkEl.style.display = 'none';
      document.body.appendChild(linkEl);
      setTimeout(function () {
        linkEl.click();
        document.body.removeChild(linkEl);
      }, 1);
    }, 'image/png');
  },

  copyRenderTargetToCanvas(renderer, renderTarget, ctx, size, invertY) {
    let pixels = new Uint8Array(4 * size.width * size.height)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, size.width, size.height, pixels)

    if (invertY) {
      pixels = this.flipPixelsVertically(pixels, size.width, size.height)
    }

    const imageData = new ImageData(new Uint8ClampedArray(pixels), size.width, size.height)
    ctx.putImageData(imageData, 0, 0)
  }
});
