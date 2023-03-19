(function () {
  "use strict";

  var fs = require("fs");

  function Storage(path, opts) {
    opts = opts || {};
    var db;
    Object.defineProperty(this, "___priv_namespace___", {
      value: opts.namespace,
      writable: false,
      enumerable: false,
    });

    Object.defineProperty(this, "___priv_bk___", {
      value: {
        path: path,
      },
      writable: false,
      enumerable: false,
    });

    Object.defineProperty(this, "___priv_strict___", {
      value: !!opts.strict,
      writable: false,
      enumerable: false,
    });

    Object.defineProperty(this, "___priv_ws___", {
      value: opts.ws || "  ",
      writable: false,
      enumerable: false,
    });

    try {
      db = JSON.parse(fs.readFileSync(path));
    } catch (e) {
      db = {};
    }

    Object.keys(db).forEach(function (key) {
      this[key] = db[key];
    }, this);
  }

  Storage.prototype.get = function (key, __in_opts = null) {
    key = key + ":" + this.___priv_namespace___;
    if (this.hasOwnProperty(key)) {
      let val = this[key];
      if (this.___priv_strict___) {
        val = String(this[key]);
      }
      try {
        return JSON.parse(val);
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  Storage.prototype.set = function (key, val) {
    key = key + ":" + this.___priv_namespace___;
    if (val === undefined) {
      this[key] = null;
    } else if (this.___priv_strict___) {
      this[key] = String(val);
    } else {
      this[key] = val;
    }
    this.___save___();
  };

  Storage.prototype.removeItem = function (key) {
    key = key + ":" + this.___priv_namespace___;
    delete this[key];
    this.___save___();
  };

  Storage.prototype.clear = function () {
    var self = this;
    // filters out prototype keys
    Object.keys(self).forEach(function (key) {
      self[key] = undefined;
      delete self[key];
    });
  };

  Storage.prototype.key = function (i) {
    i = i || 0;
    return Object.keys(this)[i];
  };

  Object.defineProperty(Storage.prototype, "length", {
    get: function () {
      return Object.keys(this).length;
    },
  });

  Storage.prototype.___save___ = async function () {
    if (!this.___priv_bk___.path) {
      return;
    }

    await fs.writeFileSync(
      this.___priv_bk___.path,
      JSON.stringify(this, null, this.___priv_ws___)
    );
  };

  Object.defineProperty(Storage, "create", {
    value: function (path, opts) {
      return new Storage(path, opts);
    },
    writable: false,
    enumerable: false,
  });

  module.exports = Storage;
})();
