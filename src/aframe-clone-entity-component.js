// Copyright 2018 harlyq
// MIT license

(function() {

  let cloneID = 0

  AFRAME.registerComponent("clone-entity", {
    schema: {
      type: "selector",
    },
    multiple: true,
  
    update() {
      const idPostFix = "_clone"
      const data = this.data
      const template = data.template
      let cloneEl = document.importNode(template instanceof HTMLTemplateElement ? template.content : template, true)
  
      const makeUniqueIDs = el => {
        if (el.id) el.id += idPostFix + cloneID
        el.children.forEach(addUniqueIDs)
      }
      makeUniqueIDs(cloneEl)
  
      this.el.appendChild(cloneEl)
      cloneID++
    }
  })

})()
