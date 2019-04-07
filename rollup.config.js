// rollup.config.js
import resolve from 'rollup-plugin-node-resolve'
import glslify from '@shotamatsuda/rollup-plugin-glslify'

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/aframe-harlyq-components.js',
    format: 'umd'
  },
  //plugins: [ glsl({include: '*.glsl', soureMap: false}), resolve() ],
  plugins: [ resolve(), glslify({minify: true}) ],
}