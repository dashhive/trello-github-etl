"use strict";

const M_CREATED = 0;
const M_LISTS = 1;
//const M_COMMENTS = 4;
const SLEEP = 3000;

// 'checkItem' is a misnomer. Pretend it was called 'ghIssue'.
const ISSUE_TO_ITEM = "checkItem";
const ISSUE_TO_CARD = "card";

let Etl = module.exports;

let Storage = require("dom-storage");
let localStorage = new Storage("./db.json", { strict: true, ws: "  " });
let JsonStorage = require("json-storage").JsonStorage;
let store = JsonStorage.create(localStorage, "trello-gh-projects", {
  stringify: true,
});

let Transform = require("./lib/transform.js");
let gh = require("./lib/gh.js");

Etl.upsertCard = async function _upsertCard(card) {
  // TODO: make optional
  if (card._inactive) {
    // don't import completed items
    return;
  }

  console.info("[Desc/Bounty]", card.name);
  let changed = false;
  let fullIssue = store.get(`${ISSUE_TO_CARD}:${card.id}`);
  let cardMeta = store.get(`meta:card:${card.id}`) || {
    // left for backwards compat with anyone who happened to run this
    // before I changed it (probably just me)
    migration: fullIssue?.__migration,
  };
  store.set(`meta:card:${card.id}`, cardMeta);
  let issue = Transform.mapCardToIssue(card);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    store.set(`${ISSUE_TO_CARD}:${card.id}`, fullIssue);
  }
  if (!cardMeta.migration) {
    cardMeta.migration = M_CREATED;
    store.set(`meta:card:${card.id}`, cardMeta);
  }

  if (!cardMeta.projectItemNodeId) {
    let projectItemNodeId = await gh.projects.add(fullIssue.node_id);
    cardMeta.issueNodeId = fullIssue.node_id;
    cardMeta.projectItemNodeId = projectItemNodeId;
    store.set(`meta:card:${card.id}`, cardMeta);
  }

  //
  // Set Custom Fields
  // TODO get project info instead of caching locally
  // TODO set multiple custom fields at once
  //

  // GITHUB_TRELLO_ID_FIELD
  if (!cardMeta.projectTrelloId) {
    await gh.projects.setFieldValue(
      cardMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_ID_FIELD,
      card.id
    );
    cardMeta.projectTrelloId = card.id;
    store.set(`meta:card:${card.id}`, cardMeta);
  }
  // GITHUB_TRELLO_TYPE_FIELD
  if (!cardMeta.projectTrelloType) {
    let trelloType = "Card";
    await gh.projects.setFieldValue(
      cardMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_TYPE_FIELD,
      trelloType
    );
    cardMeta.projectTrelloType = trelloType;
    store.set(`meta:card:${card.id}`, cardMeta);
  }

  // GITHUB_TRELLO_CARD_TYPE_FIELD
  if (!cardMeta.projectTrelloCardType) {
    let trelloCardType = card._trelloCardType;
    await gh.projects.setFieldValue(
      cardMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_CARD_TYPE_FIELD,
      trelloCardType
    );
    cardMeta.projectTrelloCardType = trelloCardType;
    store.set(`meta:card:${card.id}`, cardMeta);
  }

  let isExpectedOwner = card._owner === cardMeta.owner_username;
  if (card._owner && !isExpectedOwner) {
    await gh.projects.setOwner(cardMeta.projectItemNodeId, card._owner);
    cardMeta.owner_username = card._owner;
    store.set(`meta:card:${card.id}`, card._owner);
  }

  let isExpectedFallback = card._fallbackOwner === cardMeta.fallback_owner;
  if (card._fallbackOwner && !isExpectedFallback) {
    await gh.projects.setFallbackOwner(
      cardMeta.projectItemNodeId,
      card._fallbackOwner
    );
    cardMeta.fallback_owner = card._fallbackOwner;
    store.set(`meta:card:${card.id}`, card._fallbackOwner);
  }

  // GITHUB_TRELLO_LABELS_FIELD
  // TODO check for expected labels
  if (!cardMeta.projectTrelloLabels) {
    let trelloLabels = card._trelloLabels.join(", ");
    await gh.projects.setFieldValue(
      cardMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_LABELS_FIELD,
      trelloLabels
    );
    cardMeta.projectTrelloLabels = trelloLabels;
    store.set(`meta:card:${card.id}`, trelloLabels);
  }

  await card.checklists.reduce(async function (promise, checklist) {
    await promise;
    await Etl.upsertChecklist(card, checklist);
  }, Promise.resolve());

  if (cardMeta.migration < M_LISTS) {
    changed = true;
    card = addIssuesToCardChecklistItems(card);
    let updates = {
      body: Transform.mapCardToIssueMkdn(card),
    };
    if (card.closed && "closed" !== fullIssue.state) {
      updates.state = "closed";
    }
    fullIssue = await gh.issues.update(fullIssue.number, updates);
    store.set(`${ISSUE_TO_CARD}:${card.id}`, fullIssue);
    cardMeta.migration = M_LISTS;
    store.set(`meta:card:${card.id}`, cardMeta);
  }

  return changed;
};

Etl.upsertChecklistItem = async function _upsertChecklistItem(card, item) {
  // TODO: skipping closed items should be optional
  if (item._inactive) {
    // don't import completed items
    return;
  }

  console.info(
    `    [Item/Task ${item.id}]`,
    JSON.stringify(item._title, null, 2)
  );
  let changed = false;
  let fullIssue = store.get(`${ISSUE_TO_ITEM}:${item.id}`);
  item._issue = fullIssue;
  let itemMeta = store.get(`meta:item:${item.id}`) || {
    // left for backwards compat with anyone who happened to run this
    // before I changed it (probably just me)
    migration: fullIssue?.__migration,
  };
  store.set(`meta:item:${item.id}`, itemMeta);
  let issue = Transform.mapChecklistItemToIssue(item);
  console.info(`    [Task.body] ${issue.body}`);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    store.set(`${ISSUE_TO_ITEM}:${item.id}`, fullIssue);
    item._issue = fullIssue;
  }
  if (!itemMeta.migration) {
    itemMeta.migration = M_CREATED;
    store.set(`meta:item:${item.id}`, itemMeta);
  }

  if (issue.title !== fullIssue.title) {
    changed = true;
    fullIssue = await gh.issues.update(fullIssue.number, {
      title: issue.title,
      body: issue.body,
    });
    store.set(`${ISSUE_TO_ITEM}:${item.id}`, fullIssue);
    item._issue = fullIssue;
  }

  let shouldBeClosed = "complete" === item.state;
  let isClosed = "closed" === fullIssue.state;
  if (shouldBeClosed && !isClosed) {
    changed = true;
    fullIssue = await gh.issues.update(fullIssue.number, { state: "closed" });
    store.set(`${ISSUE_TO_ITEM}:${item.id}`, fullIssue);
    item._issue = fullIssue;
  }

  let projectMeta = store.get(`${ISSUE_TO_ITEM}:${item.id}:project`);
  if (!projectMeta) {
    let projectItemNodeId = await gh.projects.add(fullIssue.node_id);
    projectMeta = {
      issueNodeId: fullIssue.node_id,
      projectItemNodeId: projectItemNodeId,
    };
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  // GITHUB_TRELLO_ID_FIELD
  if (!projectMeta.projectTrelloId) {
    let trelloId = item.id;
    await gh.projects.setFieldValue(
      projectMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_ID_FIELD,
      trelloId
    );
    projectMeta.projectTrelloId = trelloId;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  // GITHUB_TRELLO_TYPE_FIELD
  if (!projectMeta.projectTrelloType) {
    let trelloType = "Task";
    await gh.projects.setFieldValue(
      projectMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_TYPE_FIELD,
      trelloType
    );
    projectMeta.projectTrelloType = trelloType;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  // GITHUB_TRELLO_TASK_TYPE_FIELD
  if (!projectMeta.projectTrelloTaskType) {
    let trelloTaskType = item._trelloTaskType;
    await gh.projects.setFieldValue(
      projectMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_TASK_TYPE_FIELD,
      trelloTaskType
    );
    projectMeta.projectTrelloTaskType = trelloTaskType;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  let isExpectedOwner = card._owner === projectMeta.owner_username;
  if (card._owner && !isExpectedOwner) {
    await gh.projects.setOwner(projectMeta.projectItemNodeId, card._owner);
    projectMeta.owner_username = card._owner;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  let isExpectedFallback = card._fallbackOwner === projectMeta.fallback_owner;
  if (card._fallbackOwner && !isExpectedFallback) {
    await gh.projects.setFallbackOwner(
      projectMeta.projectItemNodeId,
      card._fallbackOwner
    );
    projectMeta.fallback_owner = card._fallbackOwner;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  let isExpectedBounty = item._amount === projectMeta.amount;
  if (item._amount && !isExpectedBounty) {
    await gh.projects.setDashAmount(
      projectMeta.projectItemNodeId,
      item._amount
    );
    projectMeta.amount = item._amount;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  // GITHUB_TRELLO_TASK_ASSIGNEE_FIELD
  let isExpectedAssignee =
    item._assignee === projectMeta.projectTrelloTaskAssignee;
  if (item._assignee && !isExpectedAssignee) {
    let trelloTaskAssignee = item._assignee;
    await gh.projects.setFieldValue(
      projectMeta.projectItemNodeId,
      process.env.GITHUB_TRELLO_TASK_ASSIGNEE_FIELD,
      trelloTaskAssignee
    );
    projectMeta.projectTrelloTaskAssignee = trelloTaskAssignee;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  return changed;
};

// Note: modifies original card object
function addIssuesToCardChecklistItems(card) {
  card.checklists.forEach(function (checklist) {
    checklist.checkItems.forEach(function (checkItem) {
      let fullIssue = store.get(`${ISSUE_TO_ITEM}:${checkItem.id}`);
      if (fullIssue) {
        checkItem._issue = fullIssue;
      }
    });
  });
  return card;
}

Etl.upsertChecklist = async function _upsertChecklist(card, checklist) {
  console.info("  [Checklist]", checklist.name);
  await checklist.checkItems.reduce(async function (promise, item) {
    await promise;
    let changed = await Etl.upsertChecklistItem(card, item);
    if (changed) {
      await sleep(SLEEP);
    }
  }, Promise.resolve());
};

async function sleep(delay) {
  return await new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

async function main(board) {
  await gh.mustInit();

  board = Transform.trelloBoardUpgrade(board);
  board.cards.forEach(function (card) {
    // adds these properties to each card:
    //
    // - _inactive
    // - _trelloCardType
    // - _trelloCustomFields,
    // - _trelloLabels
    // - _owner
    // - _fallbackOwner
    //
    // and these properties to each item:
    //
    // - _inactive
    // - _amount
    // - _title
    // - _desc
    // - _trelloTaskType
    // - _assignee
    Transform.customizeTrelloCard(card);
  });

  let testCard = board.cards.find(function (card) {
    // 614cee94c40be9391717fc4e
    //return "Incubator on GitHub" === card.name;
    return "Decentralized TLS/HTTPS for DAPI" === card.name;
  });
  console.info("");
  console.info("###", testCard.checklists[0].checkItems[0].name);
  await Etl.upsertChecklistItem(testCard, testCard.checklists[0].checkItems[0]);

  console.info("");
  console.info("##", testCard.checklists[0].name);
  await Etl.upsertChecklist(testCard, testCard.checklists[0]);

  console.info("");
  console.info("#", testCard.name);
  await Etl.upsertCard(testCard);

  return;
  //console.info("");
  //console.info(cardToIssueBody(board.cards[0]).body);
  board.cards.reduce(async function (promise, card) {
    await promise;
    let changed = await Etl.upsertCard(card);
    if (changed) {
      await sleep(SLEEP);
    }
  }, Promise.resolve());
}

if (require.main === module) {
  let board = require("./board.json");
  main(board).catch(function (err) {
    console.error("Failed:");
    console.error(err);
    process.exit(1);
  });
}
