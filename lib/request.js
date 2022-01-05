"use strict";

let Path = require("path");
let pkg = require(Path.join(require.main.path, "package.json"));

module.exports = require("@root/request").defaults({
  userAgent: `${pkg.name}/${pkg.version}`,
});
