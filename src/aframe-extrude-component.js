import { threeHelper } from "harlyq-helpers";

AFRAME.registerComponent("extrude", {
  schema: {
    shape: { default: "" },
    depth: { default: 100 },
    curveSegments: { type: "int", default: 12 },
    bevelEnabled: { default: true },
    bevelThickness: { default: 6 },
    bevelSize: { default: 2 },
    bevelSegments: { type: "int", default: 3 },
    extrudePath: { default: "" },
    steps: { type: "int", default: 1 },
  },

  update() {
    const data = this.data
    const shape = threeHelper.shapeFromPathString(data.shape)
    const options = {...data, extrudePath: data.extrudePath ? threeHelper.shapeFromPathString(data.extrudePath) : undefined }
    const geo = new THREE.ExtrudeBufferGeometry( shape, options )
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    this.el.setObject3D("mesh", mesh)
  }
})
