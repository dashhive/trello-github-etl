"use strict";

let pkg = require("../package.json");

module.exports = require("@root/request").defaults({
  userAgent: `${pkg.name}/${pkg.version}`,
});
