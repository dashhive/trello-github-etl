"use strict";

let { argv, argc, exit } = require("process");
let fs = require("fs");

(async function () {
  console.info("");
  console.info("Trello ETL Utility: Custom Fields Parser");
  console.info("");
  if (argc < 4) {
    console.error(`Usage: ${argv[0]} <INPUT_FILE>`);
    exit(1);
  }
  let input_file = argv[2];
  let output_file = argv[3];

  console.info(`--- Reading: "${input_file}" ---`);
  let json = require(input_file);
  let transformed = {};
  json.customFields.forEach(function (row, index) {
    transformed[row.name] = row.id;
  });
  let trelloFields = JSON.stringify(transformed);
  fs.writeFileSync(output_file, trelloFields);
  console.info(`Wrote to ${json.customFields.length} row(s) to ${output_file}`);

  exit(0);
})();
