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
    this.delayedEventHandler = aframeHelper.delayedEventHandler( this.el, this.pulseActuators.bind(this) )
    this.pulses = []
  },

  remove() {
    this.delayedEventHandler.remove()
    this.stopAllActuators()
  },

  play() {
    this.delayedEventHandler.play()
  },

  pause() {
    this.delayedEventHandler.pause()
    this.stopAllActuators()
  },

  update( oldData ) {
    const data = this.data
    if ( data.events !== oldData.events || data.enabled !== oldData.enabled || data.delay !== oldData.delay ) {
      this.delayedEventHandler.update( data.events, "", "", data.delay, data.enabled )
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

  pulseActuators() {
    const data = this.data
    this.pulses.length = 0
    
    const actuators = this.getActuators()

    actuators.forEach( actuator => {
      this.pulses.push( actuator )

      actuator.pulse( data.force, data.duration*1000 ).then( () => {
        this.pulses.splice( this.pulses.indexOf( actuator ), 1 )
      }, ( err ) => {
        this.pulses.splice( this.pulses.indexOf( actuator ), 1 )
        console.error( err ) 
      } ) 
    } )
  },

  stopAllActuators() {
    for (let actuator of this.pulses) {
      actuator.pulse(0,0)
    }
    this.pulses.length = 0
  },

  getActuators() {
    if ( this.actuators.length > 0 ) {
      return this.actuators
    }

    const data = this.data
    let cacheActuators = true

    const elements = data.controllers ? document.querySelectorAll( data.controllers ) : [ this.el ]
    let actuators = []

    if ( elements.length === 0 ) {
      aframeHelper.warn( this, "no controller elements found" )

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
        aframeHelper.warn( this, "no tracked-controls found" )
      }
    }

    if ( cacheActuators ) {
      this.actuators = actuators
    }

    return actuators
  },

} )