"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let GH = require("../lib/gh.js");

async function main() {
  await GH.mustInit();
  let repo = await GH.repos.getOrCreate({ name: process.env.GITHUB_REPO });
  console.log("[DEBUG] repo", repo);

  // TODO: should this be getByTitle?
  let projectTitle = process.env.GITHUB_PROJECT_NAME;
  let project = await GH.projects.getByName({
    name: projectTitle,
  });
  if (!project) {
    console.error(
      `'${projectTitle}' does not exist and cannot be created automatically via the API. Please go create it at: https://github.com/orgs/${process.env.GITHUB_ORG}/projects?type=beta`
    );
    process.exit(1);
  }

  console.log("[DEBUG] project (beta)", project);

  let boardColumn = await GH.projects.addBoardColumn({ name: "Pretzels" });
  console.log(boardColumn);

  // TODO add custom fields
}

main().catch(function (err) {
  console.error(err.stack);
});
