// Copyright 2019 harlyq
// MIT license

// remix of https://github.com/supermedium/superframe/tree/master/components/gltf-part
var LOADING_MODELS = {};
var MODELS = {};

AFRAME.registerComponent("gltf-part", {
  schema: {
    part: {type: "string"},
    src: {type: "asset"}
  },

  update: function () {
    var el = this.el;
    if (!this.data.part && this.data.src) { return; }
    this.getModel(function (modelPart) {
      if (!modelPart) { return; }
      el.setObject3D("mesh", modelPart)
    });
  },

  /**
   * Fetch, cache, and select from GLTF.
   *
   * @param {modelLoadedCallback} cb - Called when the model is loaded
   * @returns {object} - Selected subset of model.
   */
  getModel: function (cb) {
    var self = this;

    // Already parsed, grab it.
    if (MODELS[this.data.src]) {
      cb(this.selectFromModel(MODELS[this.data.src]));
      return;
    }

    // Currently loading, wait for it.
    if (LOADING_MODELS[this.data.src]) {
      return LOADING_MODELS[this.data.src].then(function (model) {
        cb(self.selectFromModel(model));
      });
    }

    // Not yet fetching, fetch it.
    LOADING_MODELS[this.data.src] = new Promise(function (resolve) {
      new THREE.GLTFLoader().load(self.data.src, function (gltfModel) {
        var model = gltfModel.scene || gltfModel.scenes[0];
        MODELS[self.data.src] = model;
        delete LOADING_MODELS[self.data.src];
        cb(self.selectFromModel(model));
        resolve(model);
      }, function () { }, console.error);
    });
  },

  /**
   * Search for the part name and look for a mesh.
   */
  selectFromModel: function (model) {
    var part;

    part = model.getObjectByName(this.data.part);
    if (!part) {
      console.error("[gltf-part] `" + this.data.part + "` not found in model.");
      return;
    }

    return part.clone()
  }
});