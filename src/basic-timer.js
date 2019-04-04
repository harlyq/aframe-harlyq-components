// Copyright 2018-2019 harlyq
// MIT license

export default function BasicTimer() {
  let sendEventTimer
  let timeOfStart
  let timeoutCallback
  let timeRemaining

  function start(delay, callback) {
    stop()
    
    if (delay > 0) {
      sendEventTimer = setTimeout(callback, delay*1000)
      timeOfStart = Date.now()
      timeoutCallback = callback
    } else {
      callback()
    }
  }

  function stop() {
    // @ts-ignore
    clearTimeout(self.sendEventTimer)
    sendEventTimer = undefined
    timeOfStart = undefined
    timeRemaining = undefined
    timeoutCallback = undefined
  }

  function pause() {
    if (sendEventTimer) {
      let remaining = Date.now() - timeOfStart
      stop()
      timeRemaining = remaining
    }
  }

  function resume() {
    if (timeRemaining) {
      start(timeRemaining, timeoutCallback)
      timeRemaining = undefined
    }
  }

  return {
    start,
    stop,
    pause,
    resume
  }
}
