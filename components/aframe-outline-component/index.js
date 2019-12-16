import { vertex3, hull } from "harlyq-helpers"

AFRAME.registerComponent("outline", {
  schema: {
    color: { type: "color", default: "purple" },
    width: { default: 0.01 },
    meshName: { default: "mesh" },
    style: { oneOf: ["screenspace", "3dspace"], default: "3dspace", parse: (str) => str.toLowerCase() },
    enabled: { default: true },
  },

  init() {
    this.onObject3DSet = this.onObject3DSet.bind(this)
    this.el.addEventListener("object3dset", this.onObject3DSet)

    this.color = new THREE.Color()
    this.material = this.createMaterial()

    const obj3D = this.el.getObject3D(this.data.meshName)
    this.outline = this.createOutline(obj3D, this.material)
  },

  remove() {
    this.el.removeEventListener("object3dset", this.onObject3DSet)
  },

  update(oldData) {
    const data = this.data

    if (data.color !== oldData.color) {
      this.color.set(data.color)
      this.material.uniforms['color'].value.set( this.color.r, this.color.g, this.color.b )
    }

    if (data.style !== oldData.style) {
      switch (data.style) {
        case "screenspace": this.material.defines = { USE_SCREEN_SPACE: true }; break
        default: this.material.defines = { USE_THREED_SPACE: true }; break
      }
    }

    this.material.uniforms['width'].value = data.style === 'screenspace' ? data.width : data.width*10

    if (this.outline) {
      this.outline.visible = this.data.enabled
    }
  },

  createMaterial() {
    return new THREE.ShaderMaterial( {
      uniforms: {
        color: { value: new THREE.Vector3() },
        width: { value: .1 },
      },
      depthWrite: true,
      transparent: false,
      side: THREE.BackSide,

      vertexShader: `
uniform float width;
void main() {

  float outlineWidth = width;

  vec3 modelScale = vec3( 
    length( modelMatrix[0].xyz ), 
    length( modelMatrix[1].xyz ), 
    length( modelMatrix[2].xyz )
  );

#if defined(USE_SCREEN_SPACE)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  
  outlineWidth *= gl_Position.w;
#endif // defined(USE_THREED_SPACE)

  vec3 widthScale = outlineWidth / modelScale;

  mat4 scaleMatrix = mat4(1.);
  scaleMatrix[0][0] = widthScale.x;
  scaleMatrix[1][1] = widthScale.y;
  scaleMatrix[2][2] = widthScale.z;

  vec4 widthOffset = scaleMatrix * vec4( normalize( position ), 1. );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position + widthOffset.xyz, 1.0 );
}`,

      fragmentShader: `
uniform vec3 color;
void main() {
  gl_FragColor = vec4( color, 1. );
}`,

    } )
  },

  createOutline(obj, material) {
    if (obj) {
      
      obj.updateMatrixWorld(true)
      const outlineObj3D = this.createHullOutline(obj, material)

      if (outlineObj3D) {
        outlineObj3D.visible = this.data.enabled
        this.el.setObject3D("outline", outlineObj3D)
      }

      return outlineObj3D
    }
  },

  createHullOutline(root, material) {
    const VERTS_PER_POSITION = 3
    let numVerts = 0

    root.traverse(node => {
      const position = node.geometry && node.geometry.getAttribute("position")
      if (position && position.itemSize === VERTS_PER_POSITION) {
        numVerts += position.array.length
      }
    })

    const verts = new Float32Array(numVerts)
    let startIndex = 0

    // detach the parent so we can get the matrixWorld of each child relative
    // to the root
    const oldParent = root.parent
    root.parent = null
    root.updateMatrixWorld(true)

    root.traverse(node => {
      const position = node.geometry && node.geometry.getAttribute("position")
      if (position && position.itemSize === VERTS_PER_POSITION) {
        verts.set(position.array, startIndex)

        for (let i = 0; i < position.count; i++) {
          const positionIndex = startIndex + i*VERTS_PER_POSITION
          vertex3.applyAffine4(verts, verts, node.matrixWorld.elements, positionIndex, positionIndex)
        }

        startIndex += position.count*VERTS_PER_POSITION
      }
    })

    // restore the state of the parent
    root.parent = oldParent
    root.updateMatrixWorld(true)

    const hullIndices = hull.generateHullTriangles(verts)
    if (hullIndices) {
      const uniqueIndices = hullIndices.slice().sort((a,b) => a - b).filter((x,i,list) => i === 0 || x !== list[i-1])
      const hullGeo = new THREE.BufferGeometry()
      const hullVerts = new Float32Array( uniqueIndices.flatMap( i => [verts[i], verts[i+1], verts[i+2]] ) )
      hullGeo.setAttribute( "position", new THREE.BufferAttribute( hullVerts, VERTS_PER_POSITION ) )
      hullGeo.setIndex( hullIndices.map(i => uniqueIndices.indexOf(i) ) )
      return new THREE.Mesh(hullGeo, material)
    }
  },

  onObject3DSet(event) {
    if (event.detail.type === this.data.meshName) {
      this.outline = this.createOutline(event.detail.object, this.material)
    }
  },
})

