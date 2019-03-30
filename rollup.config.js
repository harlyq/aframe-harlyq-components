// rollup.config.js
import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/aframe-harlyq-components.js',
    format: 'umd'
  },
  plugins: [ resolve() ]
};