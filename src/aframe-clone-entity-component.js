// Copyright 2018-2019 harlyq
// MIT license

let cloneID = 0

AFRAME.registerComponent("clone-entity", {
  schema: {
    type: "selector",
  },
  multiple: true,

  update() {
    const idPostFix = "_clone"
    const template = this.data
    let cloneEl = document.importNode(template instanceof HTMLTemplateElement ? template.content : template, true)

    const makeUniqueIDs = el => {
      if (el.id) el.id += idPostFix + cloneID
      el.children.forEach(makeUniqueIDs)
    }
    makeUniqueIDs(cloneEl)

    this.el.appendChild(cloneEl)
    cloneID++
  }
})
