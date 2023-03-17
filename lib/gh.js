"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let request = require("./request.js");

let token = process.env.GITHUB_TOKEN;
let owner = process.env.GITHUB_ORG;
let ownerNodeId = "";
let repo = process.env.GITHUB_REPO;
let baseUrl = "https://api.github.com";
let fieldsCache = {};

let GH = module.exports;
let backoff = 60;
let maxProjects = 50;
let maxProjectFields = 50;

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
    json: body || true,
  });

  if (!resp.ok) {
    if (resp?.body?.message?.includes("secondary rate limit")) {
      console.warn(`Hit secondary rate limit. Waiting ${backoff} seconds...`);
      await sleep((backoff + 5) * 1000);
      // up to 1hr 1m
      backoff = Math.min(3660, backoff * 2);
      return await GH._request(url, body, method);
    }
    let err = new Error(`not ok: ${resp.statusCode}`);
    err.response = resp.toJSON();
    throw err;
  }
  backoff = 60;
  return resp.body;
};

GH.mustInit = async function () {
  let project = await GH.projects.getByName({
    name: process.env.GITHUB_PROJECT_NAME,
  });
  console.info("");
  console.info("Project Node ID:", project.id);

  let die = false;
  let maxMissingLen = 0;
  let missings = [];
  let exists = [];
  let columns = null;

  let fields = await GH.projects.getTableFields(project);
  fields.forEach(function (field) {
    fieldsCache[field.id] = field;
    fieldsCache[field.name] = field;
    // 'settings' is ALWAYS at least 'null'
    field.settings = JSON.parse(field.settings);
  });
  fields.forEach(function (field) {
    if ("Status" !== field.name) {
      return;
    }
    columns = field.settings.options;
  });

  let unlisted = {};
  // Ex: "None:Pending, Complete:Completed"
  //     => ["None:Pending", "Complete:Completed"]
  let pairs = process.env.GITHUB_PROJECT_BOARD_LISTS.split(/[,\s]+/);
  pairs.forEach(function (pair) {
    // Ex: "None:Pending" => "Pending"
    let expectedList = pair.split(":")[1];
    let exists = columns.some(function (column) {
      return expectedList === column.name;
    });
    if (!exists) {
      die = true;
      unlisted[expectedList] = true;
    }
  });

  [
    "GITHUB_TRELLO_DASH_FIELD_NAME", // "Dash Bounty"
    "GITHUB_TRELLO_OWNER_FIELD_NAME", // "Owner"
    "GITHUB_TRELLO_FALLBACK_OWNER_FIELD_NAME", // "Fallback Owner"
    // ID of the Card or Task
    "GITHUB_TRELLO_ID_FIELD_NAME", // "Trello ID"
    // "Card" (Bounty) or "Task"
    "GITHUB_TRELLO_TYPE_FIELD_NAME", // "Trello Type"
    // Card Status (Board List Column). Ex: "Completed"
    "GITHUB_TRELLO_CARD_STATUS_FIELD_NAME", // "Status"
    // Card Type (List Column). Ex: "Programmes"
    "GITHUB_TRELLO_CARD_TYPE_FIELD_NAME", // "Trello Board Column"
    // Card Labels (as a string)
    "GITHUB_TRELLO_LABELS_FIELD_NAME", // "Trello Labels"
    // Task Parent
    "GITHUB_TRELLO_TASK_PARENT_FIELD_NAME", // "Dash Incubator on Github"
    // Task Parent Link
    "GITHUB_TRELLO_TASK_PARENT_LINK_FIELD_NAME", // "https://..."
    // Task Type (Checklist Name). Ex: "Production", "QA"
    "GITHUB_TRELLO_TASK_TYPE_FIELD_NAME", // "Task Type"
    // Task Assignee
    "GITHUB_TRELLO_TASK_ASSIGNEE_FIELD_NAME", // "Trello Assignee"
  ].forEach(function (envname) {
    let name = process.env[envname];
    if (!name) {
      die = true;
      console.error(`process.env['${envname}'] is not defined (but should be)`);
      return;
    }

    let field = fields.find(function (field) {
      // TODO allow case / space insensitive?
      // (how strict do we want to be?)
      return name === field.name;
    });
    if (!field) {
      die = true;
      maxMissingLen = Math.max(maxMissingLen, name.length);
      missings.push([name, envname]);
      return;
    }

    // TODO the current code depends on IDs in ENVs
    let envid = envname.slice(0, -"_NAME".length);
    process.env[envid] = field.id;
    exists.push(
      [
        `process.env['${envname}']="${name}"`,
        `process.env['${envid}']="${field.id}"\n`,
      ].join("\n")
    );
  });

  if (die) {
    if (Object.keys(unlisted).length) {
      console.error();
      console.error(
        `The following are not board list columns of '${project.title}':`
      );
      console.error();
      Object.keys(unlisted).forEach(function (name) {
        console.error(`    ${name}`);
      });
      console.error();
      console.error(
        `https://github.com/orgs/${owner}/projects/${project.number}/views/1?layout=board`
      );
      console.error();
    }

    if (missings.length) {
      console.error();
      console.error(`The following are not fields of '${project.title}':`);
      console.error();
      missings.forEach(function ([name, envname]) {
        let longname = `"${name}"`.padEnd(maxMissingLen + 2, " ");
        console.error(`    ${longname}`, `('${envname}')`);
      });
      console.error();
      console.error(
        `https://github.com/orgs/${owner}/projects/${project.number}/views/1`
      );
      console.error();
    }
    process.exit(1);
  }

  console.log();
  console.log("Table Field Columns: Names + IDs:");
  console.log(exists.join("\n"));
  console.log();
  console.log("Fields:");
  console.log(JSON.stringify(fields, null, 2));
  console.log();
  console.log("Board List Columns: Names");
  console.log(JSON.stringify(columns, null, 2));
  console.log();
  console.log("Potentially Useful Info about the Board ^^");
  console.log();
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
    console.error("GraphQL Query:");
    console.error(query);
    console.error("GraphQL Variables:");
    console.error(variables);
    console.error("GraphQL Error:");
    console.error(JSON.stringify(result.errors, null, 2));
    throw new Error("graphql errors (see above)");
  }
  return result;
};

GH.orgs = {};
GH.orgs.get = async function ({ login }) {
  let org = await GH.graphql(
    `
    query($login: String!) {
      organization(login: $login) {
        id
      }
    }
    `,
    { login }
  );
  return org.data.organization.id;
};

GH.projects = {};
GH.projects.create = async function ({ ownerId, name, repositoryIds = [] }) {
  if (!ownerId) {
    ownerId = ownerNodeId;
    if (!ownerId) {
      // TODO place this init somewhere sane
      ownerNodeId = await GH.orgs.get({ login: owner });
      ownerId = ownerNodeId;
    }
  }
  let projectBoard = await GH.graphql(
    `
    mutation($ownerId: ID! $name: String! $repositoryIds: [ID!]) {
        createProject(
            input: {
                ownerId: $ownerId
                name: $name
                repositoryIds: $repositoryIds
            }
        ) {
            project {
                id
            }
        }
    }`,
    { ownerId, name, repositoryIds }
  );
  return projectBoard.data.project.id;
};

GH.projects.getByName = async function ({ name }) {
  let projectBoards = await GH.graphql(
    `
    query($organization: String! $maxProjects: Int!) {
      organization(login: $organization) {
        projectsV2(first: $maxProjects) {
          nodes {
            id
            number
            title
          }
        }
      }
    }`,
    {
      organization: owner,
      maxProjects: maxProjects,
    }
  );

  let board = projectBoards.data.organization.projectsV2.nodes.find(function (
    node
  ) {
    return name === node.title;
  });
  if (!board) {
    return null;
  }
  if (board.fields) {
    board.fields = board.fields.nodes;
  }
  return board;
};
GH.projects.getNodeIdByNumber = async function ({ projectNumber }) {
  if (GH.projects._id_promise) {
    return await GH.projects._id_promise;
  }

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

GH.projects.getNodeIdByName = async function ({ name }) {
  if (GH.projects._id_promise) {
    return await GH.projects._id_promise;
  }

  if (!name) {
    name = process.env.GITHUB_PROJECT_NAME;
  }

  let projectNext = await GH.projects.getByName({ name });

  return projectNext.id;
};

GH.projects.getNumberByName = async function ({ name }) {
  if (!name) {
    name = process.env.GITHUB_PROJECT_NAME;
  }

  let projectNext = await GH.projects.getByName({ name });

  return projectNext.number;
};
GH.projects.add = async function (issueNodeId) {
  let projectNodeId = await GH.projects.getNodeIdByName({});
  let projectItem = await GH.graphql(
    `
    mutation($projectId: ID! $issueId: ID!) {
        addProjectV2ItemById(
            input: {
                projectId: $projectId
                contentId: $issueId
            }
        ) {
            item {
                id
            }
        }
    }`,
    { projectId: projectNodeId, issueId: issueNodeId }
  );
  return projectItem.data.addProjectV2ItemById.item.id;
};

/*
// DOES NOT WORK with GitHub ProjectsNext/Beta/Memex
GH.projects.addBoardColumn = async function ({ name }) {
  let projectNodeId = await GH.projects.getNodeIdByName({});
  let boardColumn = await GH.graphql(
    `
    mutation($projectId: String! $name: String!) {
      addProjectColumn(
        input: {
            projectId: $projectId
            name: $name
        }
      ) {
        columnEdge {
            node {
                createdAt
                name
                purpose
            }
        }
      }
    }`,
    { projectId: projectNodeId, name }
  );
  return boardColumn.data.addProjectColumn.columnEdge.node;
};
*/

GH.projects.getTableFields = async function (project = {}) {
  let projectNumber = project?.number ?? null;
  if (!projectNumber) {
    projectNumber = await GH.projects.getNumberByName({
      name: process.env.GITHUB_PROJECT_NAME,
    });
  }

  let result = await GH.graphql(
    `
    query($login: String! $projectNumber: Int!) {
      organization(login: $login) {
        projectV2(number: $projectNumber) {
          fields(first: ${maxProjectFields}) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
                createdAt
                databaseId
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
                createdAt
                databaseId
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                createdAt
                databaseId
              }
            }
          }
        }
      }
    }`,
    {
      login: owner,
      projectNumber: projectNumber,
    }
  );
  return result.data.organization.projectV2.fields.nodes;
};

GH.projects.getCustomFields = GH.projects.getTableFields;

GH.projects.setFieldValue = async function (itemId, fieldId, value) {
  let field = fieldsCache[fieldId];
  if (!field) {
    // should only happen if field is removed while this tool is running
    throw new Error(`'${fieldId}' not found in fieldsCache`);
  }
  // because 'fieldId' may actually be a name in the cache
  fieldId = field.id;

  // Ex: { "options": [ { "id":"f75ad846", "name":"Todo", "name_html":"Todo" } ] }
  if (field.settings?.options) {
    let name = value;
    let option = field.settings.options.find(function (option) {
      return option.name === name;
    });
    if (!option) {
      throw new Error(
        `Could not find '${name}' among options for '${field.name}':\n` +
          JSON.stringify(field.settings.options, null, 2)
      );
    }
    value = option.id;
  }

  let projectNodeId = await GH.projects.getNodeIdByName({});
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
  let fieldId = process.env.GITHUB_TRELLO_DASH_FIELD;
  await GH.projects.setFieldValue(itemId, fieldId, value.toString());
};

GH.projects.setFallbackOwner = async function (itemId, value) {
  let fieldId = process.env.GITHUB_TRELLO_FALLBACK_OWNER_FIELD;
  await GH.projects.setFieldValue(itemId, fieldId, value.toString());
};

GH.projects.setOwner = async function (itemId, value) {
  let fieldId = process.env.GITHUB_TRELLO_OWNER_FIELD;
  await GH.projects.setFieldValue(itemId, fieldId, value.toString());
};

GH.repos = {};
// See https://docs.github.com/en/rest/reference/repos#create-an-organization-repository
GH.repos.create = async function (repo) {
  return await GH._request(`/orgs/${owner}/repos`, repo, "POST");
};
GH.repos.get = async function (repo) {
  return await GH._request(`/repos/${owner}/${repo.name}`, null, "");
};
GH.repos.getOrCreate = async function (repo) {
  let details = await GH.repos.get({ name: repo.name }).catch(function (err) {
    console.error("error thing:");
    if (404 === err.response.statusCode) {
      return null;
    }
    throw err;
  });

  if (!details) {
    details = await GH.repos.create(repo);
  }
  return details;
};

async function sleep(delay) {
  return await new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

if (module === require.main) {
  GH.mustInit();
}
