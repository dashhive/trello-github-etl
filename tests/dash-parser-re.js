"use strict";

let dashRe = require("../lib/transform.js")._dashAmountRe;

[
  ["Some task (1.0 Dash)", "1.0"],
  ["Some task (1 DASH)", "1"],
  ["Some task (0.5 dash)", "0.5"],
  ["Some task ( 0.5 Dash ))", "0.5"],
  ["Some task ( 0.5Dash ).", "0.5"],
  ["Some task ( .5 Dash )   ", ".5"],
  ["Some (task) ( .5 Dash )   yo", ".5"],
  ["Create :XcoinHeart: emoji image (0.1 Dash)", "0.1"],
].forEach(function (pair, i) {
  let [input, expected] = pair;
  let m = input.match(dashRe);
  if (!m || m[1] !== expected) {
      console.log(input, expected);
      console.log(m);
    throw new Error(
      `[${i}: ${input}] expected '${expected}', but got ` +
        JSON.stringify(m[1], null, 2)
    );
  }
  let output0 = m[1];
  let output = m[0];
  console.log(input.replace(output, " ").trim());
  console.log(
    JSON.stringify(output0, null, 2),
    JSON.stringify(output, null, 2)
  );
});
