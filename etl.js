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
let trelloFields = require("./trello-fields.json");

Etl.upsertCard = async function _upsertCard(card) {
  // TODO: make optional
  if (card.closed) {
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
  let closed = "complete" === item.state;
  if (closed) {
    // don't import completed items
    return;
  }

  item = Transform.parseChecklistItem(item);

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

  if (item._amount && !projectMeta.amount) {
    await gh.projects.setDashAmount(
      projectMeta.projectItemNodeId,
      item._amount
    );
    projectMeta.amount = item._amount;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }

  let fallbackOwnerField = card.customFieldItems.find(function (card) {
    return card.idCustomField === trelloFields.secondaryAdmin;
  });
  let fallbackOwner = fallbackOwnerField?.value?.text;
  let isExpectedFallbackOwner = fallbackOwner === projectMeta.fallback_owner;
  if (fallbackOwner && !isExpectedFallbackOwner) {
    await gh.projects.setFallbackOwner(
      projectMeta.projectItemNodeId,
      fallbackOwner
    );
    projectMeta.fallback_owner = fallbackOwner;
    store.set(`${ISSUE_TO_ITEM}:${item.id}:project`, projectMeta);
  }
  let fallbackOwnerId = "";
  if (fallbackOwner) {
    fallbackOwnerId = Transform.trelloUsernameToId(fallbackOwner);
  }

  let ownersIds = card.idMembers;
  let ownerId = ownersIds.find(function (ownerId) {
    return ownerId !== fallbackOwnerId;
  });
  let ownerUsername = Transform.trelloIdToUsername(ownerId);
  if (ownerUsername && !projectMeta.owner_username) {
    await gh.projects.setOwner(projectMeta.projectItemNodeId, ownerUsername);
    projectMeta.owner_username = ownerUsername;
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
  board = Transform.trelloBoardUpgrade(board);

  let testCard = board.cards[72];
  console.info("");
  console.info("###", testCard.checklists[0].checkItems[0].name);
  await Etl.upsertChecklistItem(testCard, testCard.checklists[0].checkItems[0]);

  console.info("");
  console.info("##", testCard.checklists[0].name);
  await Etl.upsertChecklist(testCard, testCard.checklists[0]);

  console.info("");
  console.info("#", testCard.name);
  await Etl.upsertCard(testCard);

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
