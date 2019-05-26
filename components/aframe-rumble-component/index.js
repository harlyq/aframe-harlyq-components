import { aframeHelper } from "harlyq-helpers"

AFRAME.registerComponent( "rumble", {
  schema: {
    events: { default: "" },
    delay: { default: 0 },
    duration: { default: 0.1 },
    force: { default: 1 },
    controllers: { default: "" },
    enabled: { default: true },
  },

  multiple: true,

  init() {
    this.toStart = aframeHelper.onEvents( this.el, this.onEvent.bind( this ) )
    this.pulses = []
  },

  play() {
    this.toStart.play()
  },

  pause() {
    this.toStart.pause()
    this.stopAllActuators()
  },

  update( oldData ) {
    const data = this.data
    if ( data.events !== oldData.events ) {
      this.toStart.setEvents( data.events )
    }

    if ( data.controllers !== oldData.controllers ) {
      this.stopAllActuators()
      this.actuators = [] // will force a rebuild of the actuators
    }

    if ( data.enabled !== oldData.enabled ) {
      if ( !data.enabled ) {
        this.stopAllActuators()
      }
    }
  },

  onEvent( e ) {
    const data = this.data
    if ( !data.enabled ) {
      return
    }

    const actuators = this.getActuators( e )
    if ( actuators.length === 0 ) {
      return
    }

    function pulseActuators(pulses) {
      pulses = []
      
      actuators.map( actuator => {
        pulses.push( actuator )

        actuator.pulse( data.force, data.duration*1000 ).then( () => {
          pulses.splice( pulses.indexOf( actuator ), 1 )
        }, ( err ) => {
          pulses.splice( pulses.indexOf( actuator ), 1 )
          console.error( err ) 
        } ) 
      } )
    }

    if (data.delay > 0) {
      const self = this
      setTimeout( () => pulseActuators(self.pulses), data.delay*1000 )
    } else {
      pulseActuators(this.pulses)
    }
  },

  stopAllActuators() {
    for (let actuator of this.pulses) {
      actuator.pulse(0,0)
    }
    this.pulses.length = 0
  },

  getActuators( e ) {
    if ( this.actuators.length > 0 ) {
      return this.actuators
    }

    const data = this.data
    let cacheActuators = true
    let selector = data.controllers

    if ( data.controllers[0] === "$" ) {
      if ( data.controllers.indexOf( "$event" ) === 0 ) {
        selector = aframeHelper.getProperty( e, data.controllers.slice( 6 ) )
        cacheActuators = false // because the event may change, rebuild the actuators each time
      } else {
        selector = aframeHelper.getProperty( this.el, data.controllers.slice( 1 ) )
      }
    }

    const elements = selector ? document.querySelectorAll( selector ) : [ this.el ]
    let actuators = []

    if ( elements.length === 0 ) {
      console.warn( "no controller elements found" )

    } else {
      for ( let el of elements ) {
        if ( el.components[ 'tracked-controls' ] && el.components[ 'tracked-controls' ].controller ) {
          const gamepad = el.components[ 'tracked-controls' ].controller
          if ( gamepad.hapticActuators.length > 0 ) {
            actuators.push( ...gamepad.hapticActuators )
          }
        }
      }

      if ( actuators.length === 0 ) {
        console.warn( "no tracked-controls found" )
      }
    }

    if ( cacheActuators ) {
      this.actuators = actuators
    }

    return actuators
  },

} )