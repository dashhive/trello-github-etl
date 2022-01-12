"use strict";

const M_CREATED = 0;
const M_LISTS = 1;
//const M_COMMENTS = 4;
const SLEEP = 3000;

let Storage = require("dom-storage");
let localStorage = new Storage("./db.json", { strict: true, ws: "  " });
let JsonStorage = require("json-storage").JsonStorage;
let store = JsonStorage.create(localStorage, "trello-gh-projects", {
  stringify: true,
});

let Transform = require("./lib/transform.js");
let gh = require("./lib/gh.js");
let board = require("./board.json");

// sorry not sorry
function cardToIssueBody(card) {
  let checklists = card.checklists
    .map(function (checklist) {
      let tasks = checklist.checkItems
        .map(function (item) {
          let issue = store.get(`checkItem:${item.id}`);
          let x = " ";
          if ("closed" === issue.state) {
            x = "x";
          }
          return `- [${x}] #${issue.number}`;
        })
        .join("\n");
      if (tasks) {
        tasks += "\n";
      }
      // TODO checklist.name should be a label
      //   - Concept
      //   - Specification
      //   - Production
      //   - QA
      return [`## ${checklist.name}\n`, tasks].join("\n");
    })
    .join("\n");

  return [`Imported from <${card.url}>.`, `> ${card.desc}`, checklists].join(
    "\n\n"
  );
}

async function upsertChecklistItem(item) {
  // TODO: make optional
  if ("complete" === item.state) {
    // don't import completed items
    return;
  }

  item = Transform.parseChecklistItem(item);

  console.info(`    [Task ${item.id}]`, JSON.stringify(item._title, null, 2));
  let changed = false;
  let fullIssue = store.get(`checkItem:${item.id}`);
  let issue = Transform.mapChecklistItemToIssue(item);
  console.info(`    [Task.body] ${issue.body}`);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    store.set(`checkItem:${item.id}`, fullIssue);
  }
  if (!fullIssue.__migration) {
    fullIssue.__migration = M_CREATED;
  }

  if (issue.title !== fullIssue.title) {
    changed = true;
    let m = fullIssue.__migration;
    fullIssue = await gh.issues.update(fullIssue.number, {
      title: issue.title,
      body: issue.body,
    });
    fullIssue.__migration = m;
    store.set(`checkItem:${item.id}`, fullIssue);
  }

  if ("complete" === item.state && "closed" !== fullIssue.state) {
    changed = true;
    let m = fullIssue.__migration;
    fullIssue = await gh.issues.update(fullIssue.number, { state: "closed" });
    fullIssue.__migration = m;
    store.set(`checkItem:${item.id}`, fullIssue);
  }

  let meta = store.get(`checkItem:${item.id}:project`);
  if (!meta) {
    let projectItemNodeId = await gh.projects.add(fullIssue.node_id);
    meta = {
      issueNodeId: fullIssue.node_id,
      projectItemNodeId: projectItemNodeId,
    };
    store.set(`checkItem:${item.id}:project`, meta);
    await sleep(SLEEP);
  }

  if (item._amount && !meta.amount) {
    await gh.projects.setDashAmount(meta.projectItemNodeId, item._amount);
    meta.amount = item._amount;
    store.set(`checkItem:${item.id}:project`, meta);
    await sleep(SLEEP);
  }

  return changed;
}

async function upsertCard(card) {
  // TODO: make optional
  if (card.closed) {
    // don't import completed items
    return;
  }

  console.info("[Bounty]", card.name);
  let changed = false;
  let fullIssue = store.get(`card:${card.id}`);
  let issue = Transform.mapCardToIssue(card);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    store.set(`card:${card.id}`, fullIssue);
  }
  if (!fullIssue.__migration) {
    fullIssue.__migration = M_CREATED;
  }

  await card.checklists.reduce(async function (promise, checklist) {
    await promise;
    await upsertChecklist(checklist);
  }, Promise.resolve());

  if (fullIssue.__migration < M_LISTS) {
    changed = true;
    let updates = {
      body: cardToIssueBody(card),
    };
    if (card.closed && "closed" !== fullIssue.state) {
      updates.state = "closed";
    }
    fullIssue = await gh.issues.update(fullIssue.number, updates);
    fullIssue.__migration = M_LISTS;
    store.set(`card:${card.id}`, fullIssue);
  }

  return changed;
}

async function upsertChecklist(checklist) {
  console.info("  [List]", checklist.name);
  await checklist.checkItems.reduce(async function (promise, item) {
    await promise;
    let changed = await upsertChecklistItem(item);
    if (changed) {
      await sleep(SLEEP);
    }
  }, Promise.resolve());
}

async function sleep(delay) {
  return await new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}

async function main() {
  console.info("");
  console.info("###", board.cards[0].checklists[0].checkItems[0].name);
  await upsertChecklistItem(board.cards[0].checklists[0].checkItems[0]);

  console.info("");
  console.info("##", board.cards[0].checklists[0].name);
  await upsertChecklist(board.cards[0].checklists[0]);

  console.info("");
  console.info("#", board.cards[0].name);
  await upsertCard(board.cards[0]);

  //console.info("");
  //console.info(cardToIssueBody(board.cards[0]).body);
  board.cards.reduce(async function (promise, card) {
    await promise;
    let changed = await upsertCard(card);
    if (changed) {
      await sleep(SLEEP);
    }
  }, Promise.resolve());
}

main().catch(function (err) {
  console.error("Failed:");
  console.error(err);
  process.exit(1);
});
