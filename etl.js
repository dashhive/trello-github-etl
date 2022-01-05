"use strict";

const M_CREATED = 0;
const M_LISTS = 1;
//const M_COMMENTS = 2;
const SLEEP = 3000;

let Storage = require("dom-storage");
let localStorage = new Storage("./db.json", { strict: true, ws: "  " });
let JsonStorage = require("json-storage").JsonStorage;
let store = JsonStorage.create(localStorage, "trello-gh-projects", {
  stringify: true,
});

store.getItem = store.get;
store.setItem = store.set;

let gh = require("./lib/gh.js");
let board = require("./board.json");
let members = {
  "57e58ebcdb59d360ac33b82f": "riongull",
  //"60470c6bea10f5041bd1973f": "SamKirby22",
  //"5e36a8092dc8cf28e1bf5a04": "cloudwheels",
  //"59ceb948feac14253a312881": "spectaprod",
  "51ba022b569488283d000181": "coolaj86",
};

function cardToIssue(card) {
  return {
    title: card.name,
    body: `Imported from <${card.url}>.
> ${card.desc}`,
    assignees: card.idMembers
      .map(function (id) {
        return members[id];
      })
      .filter(Boolean),
  };
}

function checklistItemToIssue(item) {
  return {
    title: item.name,
    body: "",
    assignees: [item.idMember]
      .map(function (id) {
        return members[id];
      })
      .filter(Boolean),
  };
}

async function upsertChecklistItem(item) {
  console.info("    [Task]", item.name);
  let changed = false;
  let fullIssue = store.get(`checkItem:${item.id}`);
  let issue = checklistItemToIssue(item);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    fullIssue.__migration = M_CREATED;
    store.set(`checkItem:${item.id}`, fullIssue);
  }

  if ("complete" === item.state && "closed" !== fullIssue.state) {
    changed = true;
    fullIssue = await gh.issues.update(fullIssue.number, { state: "closed" });
    store.set(`checkItem:${item.id}`, fullIssue);
  }

  //"state": "complete",
  return {};
}

async function upsertCard(card) {
  console.info("[Bounty]", card.name);
  let changed = false;
  let fullIssue = store.get(`card:${card.id}`);
  let issue = cardToIssue(card);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    fullIssue.__migration = M_CREATED;
    store.set(`card:${card.id}`, fullIssue);
  }

  if (card.closed && "closed" !== fullIssue.state) {
    changed = true;
    fullIssue = await gh.issues.update(fullIssue.number, { state: "closed" });
    store.set(`card:${card.id}`, fullIssue);
  }

  await card.checklists.reduce(async function (promise, checklist) {
    await promise;
    await upsertChecklist(checklist);
  }, Promise.resolve());

  // TODO build extended description from checklist
  if (fullIssue.__migration < M_LISTS) {
    //changed = true;
    //fullIssue = await gh.issues.update(fullIssue.number, issue);
    //store.set(`card:${card.id}`, fullIssue);
    //console.log(fullIssue);
    //console.log(card);
    //console.log("TODO: add lists");
  }
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
  console.log("");

  console.log("###", board.cards[0].checklists[0].checkItems[0].name);
  await upsertChecklistItem(board.cards[0].checklists[0].checkItems[0]);

  console.log("##", board.cards[0].checklists[0].name);
  await upsertChecklist(board.cards[0].checklists[0]);

  console.log("#", board.cards[0].name);
  await upsertCard(board.cards[0]);

  console.log("");
  return;
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
