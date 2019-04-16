import { threeHelper } from "harlyq-helpers";


const degToRad = THREE.Math.degToRad

AFRAME.registerComponent("lathe", {
  schema: {
    shape: { default: "" },
    steps: { type: "int", default: 1 },
    segments: { type: "int", default: 12 },
    phiStart: { default: 0 },
    phiEnd: { default: 360 },
  },

  update() {
    const data = this.data
    const points = threeHelper.shapeFromPathString(data.shape).extractPoints(data.steps).shape
    const geo = new THREE.LatheBufferGeometry(points, data.segments, degToRad(data.phiStart), degToRad(data.phiEnd))
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    this.el.setObject3D("mesh", mesh)
  }
})
