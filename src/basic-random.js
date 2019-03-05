// Copyright 2018 harlyq
// MIT license

function BasicRandom() {
  const MAX_UINT32 = 0xffffffff
  let seed = -1
  
  function setSeed(s) {
    seed = s
  }
  
  function random() {
    if (seed < 0) {
      return Math.random()
    }
  
    seed = (1664525*seed + 1013904223) % MAX_UINT32
    return seed/MAX_UINT32
  }
  
  function randomInt(n) {
    return ~~(random()*n)
  }
  
  function randomNumber(min, max) {
    if (min === max) { return min }
    return random()*(max - min) + min
  }
  
  return {
    setSeed,
    random,
    randomInt,
    randomNumber,
  }
}

module.exports = BasicRandom
