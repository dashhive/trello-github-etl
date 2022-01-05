"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let request = require("./request.js");

let token = process.env.GITHUB_TOKEN;
let owner = process.env.GITHUB_ORG;
let repo = process.env.GITHUB_REPO;
let baseUrl = "https://api.github.com";

let GH = module.exports;
let backoff = 90;

// labels
// milestones

GH._request = async function (url, body, method) {
  let resp = await request({
    method: method,
    url: `${baseUrl}${url}`,
    headers: {
      accept: "application/vnd.github.v3+json",
      Authorization: `token ${token}`,
    },
    json: body,
  });
  if (!resp.ok) {
    if (resp?.body?.message?.includes("secondary rate limit")) {
      console.log(`Hit secondary rate limit. Waiting ${backoff} seconds...`);
      await sleep(backoff * 1000);
      // up to 1hr 1m
      backoff = Math.min(3660, backoff * 2);
      return GH._request(url, body, method);
    }
    console.log(resp.statusCode);
    console.log(resp.headers);
    console.log(resp.body);
    throw new Error("not ok");
  }
  backoff = 90;
  return resp.body;
};
GH.issues = {};
GH.issues.create = async function _createIssue(issue) {
  return GH._request(`/repos/${owner}/${repo}/issues`, issue);
};
GH.issues.update = async function _updateIssue(issue_number, issue) {
  return GH._request(
    `/repos/${owner}/${repo}/issues/${issue_number}`,
    issue,
    "PATCH"
  );
};

async function sleep(delay) {
  return await new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}
