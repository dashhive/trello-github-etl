"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let GH = require("../lib/gh.js");

async function main() {
  await GH.mustInit();
  let itemId = "PNI_lADOBY2i384AAo6czgAcBVE";
  await GH.projects.setFieldValue(
    itemId,
    process.env.GITHUB_TRELLO_LABELS_FIELD_NAME,
    "Meta"
  );

  await GH.projects.setFieldValue(itemId, "Status", "Done");

  // Should be an enum (single select) with Meta, Completed, Paused
  await GH.projects.setFieldValue(itemId, "Trello Labels", "Meta");

  // Not supported
  await GH.projects
    .setFieldValue(itemId, "Labels", "bug")
    .catch(Object)
    .then(function (err) {
      if (!err) {
        throw new Error(
          "Labels are not implemented, but might be supported now."
        );
      }
    });

  console.info();
  console.info("PASS (there may be a graphql error above, if so, ignore it)");
}

main().catch(function (err) {
  console.error(err.stack);
});
