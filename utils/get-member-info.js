"use strict";

let members = require("../board.json").members;

members.forEach(function (m) {
  // ex: "51ba022b569488283d000181": "trello:coolaj86,"             // coolaj86
  console.info(
    JSON.stringify(m.id) + ":",
    (JSON.stringify(`trello:${m.username}`) + ",").padEnd(30, " "),
    "// " + m.fullName
  );
});
