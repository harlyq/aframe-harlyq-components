import { aframeHelper, hull } from "harlyq-helpers"

AFRAME.registerComponent( "hull", {
  schema: {
    points: { default: "" },
    src: { type: "selector" },
    computeNormals: { default: false },
  },

  init() {
    this.onObject3DSet = this.onObject3DSet.bind( this )
  },

  update( oldData ) {
    const data = this.data
    let points

    if ( data.src === this.el ) {
      aframeHelper.error( `cannot set 'src' to yourself` )
    }

    if ( data.src !== oldData.src ) {
      if ( oldData.src ) {
        oldData.src.removeEventListener( "object3dset", this.onObject3DSet )
      }

      if ( data.src ) {
        if ( data.src.object3D ) {
          points = generatePointsFromObject3D( data.src.object3D )        
          data.src.addEventListener( "object3dset", this.onObject3DSet )
        } else {
          aframeHelper.warn( `'src' must point to an entity` )
        }
      }
    }

    if ( data.points !== oldData.points ) {
      if ( data.points && !points ) {
        const verts = data.points.split( "," ).map( str => AFRAME.utils.coordinates.parse( str ) )
        const AXIS = [ "x", "y", "z" ]
        points = Float32Array.from( { length: verts.length*3 }, ( _, i ) => verts[ ~~( i/3 ) ][ AXIS[ i%3 ] ] )
      }
    }

    if ( points ) {
      this.generateHull( points )
    }
  },

  generateHull( points ) {
    const triangles = hull.generateHullTriangles( points )
    const newPositions = triangles.flatMap( index => [ points [index ], points[ index+1 ], points[ index+2 ] ] )

    const geo = new THREE.BufferGeometry()
    geo.setAttribute( "position", new THREE.BufferAttribute( Float32Array.from( newPositions ), 3 ) )

    if ( this.data.computeNormals ) {
      geo.computeVertexNormals()
    }
    
    const mesh = new THREE.Mesh( geo, new THREE.MeshBasicMaterial( { color: "white" } ) )
    this.el.setObject3D( "mesh", mesh )
  },

  onObject3DSet( e ) {
    const data = this.data

    if ( e.target === data.src ) {
      const points = generatePointsFromObject3D( data.src.object3D )
      if ( points ) {
        this.generateHull( points )
      }
    }
  },

} )

function generatePointsFromObject3D( object3D ) {
  let points = []

  object3D.parent.updateMatrixWorld()
  const invObjectMatrix = new THREE.Matrix4().getInverse( object3D.matrixWorld )
  const localMatrix = new THREE.Matrix4()
  const objectVert = new THREE.Vector3()

  object3D.traverse( node => {
    const mesh = node.isMesh ? node : undefined

    if ( mesh && mesh.geometry ) {
      localMatrix.copy( mesh.matrixWorld ).multiply( invObjectMatrix )

      if ( mesh.geometry.isBufferGeometry ) {
        const positions = mesh.geometry.getAttribute( "position" ).array
        const stride = mesh.geometry.getAttribute( "position" ).itemSize
        const numPositions = positions.length

        for ( let i = 0; i < numPositions; i += stride ) {
          objectVert.set( positions[ i ], positions[ i+1 ], positions[ i+2 ] ).applyMatrix4( localMatrix )
          points.push( objectVert.x, objectVert.y, objectVert.z )
        }

      } else {
        const vertices = mesh.geometry.vertices
        const numVertices = mesh.geometry.vertices.length

        for ( let i = 0; i < numVertices; i++ ) {
          objectVert.copy( vertices[i] ).applyMatrix4( localMatrix )
          points.push( objectVert.x, objectVert.y, objectVert.z )
        }
      }
    }
  } )

  return points.length > 0 ? points : undefined
}


