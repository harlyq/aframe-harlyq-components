import { threeHelper } from "harlyq-helpers"

AFRAME.registerComponent("chalk", {
  dependencies: ["raycaster"],

  schema: {
    color: { type: "color" },
    length: { default: 0.1 },
    radius: { default: 0.02 },
    debug: { default: false },
  },

  init() {
    this.boards = []
    this.onRaycasterIntersection = this.onRaycasterIntersection.bind( this )
    this.onRaycasterIntersectionCleared = this.onRaycasterIntersectionCleared.bind( this )

    const data = this.data
    const geometry = new THREE.CylinderBufferGeometry( data.radius, data.radius, data.length, 16 )
    geometry.applyMatrix( new THREE.Matrix4().set( 1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1 ) ) // 90 degrees on x

    const mesh = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { color: data.color }) )
    this.el.setObject3D( "mesh", mesh )

    // this.el.setAttribute( "raycaster", { far: data.length*.5 + data.radius*2 } )
  },

  update(oldData) {
    const data = this.data
    
    if (data.color !== oldData.color) {
      const mesh = this.el.getObject3D( "mesh" )
      if ( mesh && mesh.material && !Array.isArray( mesh.material ) ) {
        mesh.material.color.setStyle( data.color )
      }
    }
  },

  play() {
    this.el.addEventListener( "raycaster-intersection", this.onRaycasterIntersection )
    this.el.addEventListener( "raycaster-intersection-cleared", this.onRaycasterIntersectionCleared )
  },

  pause() {
    this.el.removeEventListener( "raycaster-intersection", this.onRaycasterIntersection )
    this.el.removeEventListener( "raycaster-intersection-cleared", this.onRaycasterIntersectionCleared )
  },

  onRaycasterIntersection( e ) {
    if ( this.data.debug ) {
      console.log( "contact" )
    }

    if ( this.boards.length === 0 ) {
      this.startTick()
    }

    this.boards.push( ...e.detail.els.map( el => ( { el, radius: -1, ctx: undefined, texture: undefined, prevIntersection: undefined } ) ) )
  },

  onRaycasterIntersectionCleared( e ) {
    if ( this.data.debug ) {
      console.log( "cleared" )
    }

    // BUG clearedEls is empty
    // for ( let el of e.detail.clearedEls ) {
    //   this.boards.splice( this.boards.findIndex( board => board.el === el ), 1 )
    // }

    this.boards.length = 0
  },

  tick() {
    if ( this.boards.length === 0 ) {
      this.stopTick()
      return
    }

    const aframeRaycaster = this.el.components[ "raycaster" ]

    for ( let board of this.boards ) {
      this.tryDrawOnBoard( aframeRaycaster, board )
    }
  },

  startTick() {
    this.el.sceneEl.addBehavior( this )
  },

  stopTick() {
    this.el.sceneEl.removeBehavior( this )
  },

  tryDrawOnBoard: ( function() {
    const transformedUV = new THREE.Vector2()

    return function tryDrawOnBoard( aframeRaycaster, board ) {
      const data = this.data
      const intersection = aframeRaycaster.getIntersection( board.el )
        
      if ( !intersection ) {
        return false
      }

      // const interactionLength = data.length/2 + data.radius  
      // if ( intersection.distance > interactionLength ) {
      //   return false
      // }

      if ( !board.ctx ) {
        let canvas, texture

        if ( intersection.object && intersection.object.isMesh ) {
          texture = intersection.object.material.map
          if ( texture && texture.image && texture.image instanceof HTMLCanvasElement ) {
            canvas = texture.image
          }
        }

        board.ctx = canvas ? canvas.getContext("2d") : undefined
        board.texture = texture
      }

      const ctx = board.ctx
      const texture = board.texture

      // determine the pixel radius of the chalk radius
      if ( board.radius < 0 && ctx ) {
        if ( !board.prevIntersection ) {
          board.prevIntersection = intersection

        } else {
          const dPos = intersection.point.distanceTo( board.prevIntersection.point )

          if ( dPos > 1e-3 ) {
            const radiusRatio = data.radius/dPos
            const x = radiusRatio * ( intersection.uv.x - board.prevIntersection.uv.x ) * ctx.canvas.width
            const y = radiusRatio * ( intersection.uv.y - board.prevIntersection.uv.y ) * ctx.canvas.height

            board.radius = Math.hypot( x, y )
            board.prevIntersection = undefined
          }
        }
      }

      const radius = board.radius

      if ( ctx && texture && radius > 0 ) {
        transformedUV.set( intersection.uv.x, intersection.uv.y )
        texture.transformUv( transformedUV )

        const canvas = ctx.canvas
        const x = transformedUV.x * canvas.width
        const y = transformedUV.y * canvas.height
        const r = board.radius

        ctx.beginPath()
        ctx.fillStyle = data.color
        ctx.arc( x, y, r, 0, 2*Math.PI )
        ctx.fill()

        threeHelper.updateMaterialsUsingThisCanvas(this.el.sceneEl.object3D, canvas)
      }

      return true
    }
  } )(),
})