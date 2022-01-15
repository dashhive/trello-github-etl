"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let request = require("./request.js");

let token = process.env.GITHUB_TOKEN;
let owner = process.env.GITHUB_ORG;
let repo = process.env.GITHUB_REPO;
let baseUrl = "https://api.github.com";

let GH = module.exports;
let backoff = 60;

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
      await sleep((backoff + 5) * 1000);
      // up to 1hr 1m
      backoff = Math.min(3660, backoff * 2);
      return await GH._request(url, body, method);
    }
    console.log(resp.statusCode);
    console.log(resp.headers);
    console.log(resp.body);
    throw new Error("not ok");
  }
  backoff = 60;
  return resp.body;
};

GH.issues = {};
GH.issues.create = async function _createIssue(issue) {
  return await GH._request(`/repos/${owner}/${repo}/issues`, issue);
};
GH.issues.update = async function _updateIssue(issue_number, issue) {
  return await GH._request(
    `/repos/${owner}/${repo}/issues/${issue_number}`,
    issue,
    "PATCH"
  );
};

GH.graphql = async function _graphql(query, variables) {
  let result = await GH._request("/graphql", {
    query: query,
    variables: variables,
  });
  if (result.errors) {
    // TODO throw better error
    console.error(result.errors);
    throw new Error("graphql errors (see above)");
  }
  return result;
};

GH.projects = {};
GH.projects.getNodeId = async function () {
  if (GH.projects._id_promise) {
    return await GH.projects._id_promise;
  }

  let owner = process.env.GITHUB_ORG;
  let projectNumber = parseInt(process.env.GITHUB_PROJECT, 10);

  GH.projects._id_promise = GH.graphql(
    `
    query($login: String! $project: Int!) {
        organization(
            login: $login
        ) {
            projectNext(
                number: $project
            ) {
                id
            }
        }
    }`,
    {
      login: owner,
      project: projectNumber,
    }
  ).then(function (project) {
    return project.data.organization.projectNext.id;
  });

  return await GH.projects._id_promise;
};

GH.projects.add = async function (issueNodeId) {
  let projectNodeId = await GH.projects.getNodeId();
  let projectItem = await GH.graphql(
    `
    mutation($projectId: String! $issueId: String!) {
        addProjectNextItem(
            input: {
                projectId: $projectId
                contentId: $issueId
            }
        ) {
            projectNextItem {
                id
            }
        }
    }`,
    { projectId: projectNodeId, issueId: issueNodeId }
  );
  return projectItem.data.addProjectNextItem.projectNextItem.id;
};

GH.projects.getCustomFields = async function () {
  let projectNodeId = await GH.projects.getNodeId();
  let result = await GH.graphql(
    `
    query($projectId: ID!) {
        node(
            id: $projectId
        ) {
            ... on ProjectNext {
                fields(
                    first: 20
                ) {
                    nodes {
                        id
                        name
                        settings
                    }
                }
            }
        }
    }`,
    {
      projectId: projectNodeId,
    }
  );
  return result.data.node.fields.nodes;
};

GH.projects.setFieldValue = async function (itemId, fieldId, value) {
  let projectNodeId = await GH.projects.getNodeId();
  let result = await GH.graphql(
    `
    mutation(
        $projectId: String!
        $itemId: String!
        $fieldId: String!
        $value: String!
    ) {
        updateProjectNextItemField(
            input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: $value
            }
        ) {
            projectNextItem {
                id
            }
        }
    }`,
    {
      projectId: projectNodeId,
      itemId: itemId,
      fieldId: fieldId,
      value: value,
    }
  );

  void result.data.updateProjectNextItemField.projectNextItem.id;
};

GH.projects.setDashAmount = async function (itemId, value) {
  value = parseFloat(value);
  if (isNaN(value)) {
    throw new Error(`not a number: '${value}'`);
  }
  let fieldId = process.env.GITHUB_DASH_FIELD;
  await GH.projects.setFieldValue(itemId, fieldId, value.toString());
};

GH.projects.setFallbackOwner = async function (itemId, value) {
  let fieldId = process.env.GITHUB_FALLBACK_OWNER_FIELD;
  await GH.projects.setFieldValue(itemId, fieldId, value.toString());
};

async function sleep(delay) {
  return await new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}
