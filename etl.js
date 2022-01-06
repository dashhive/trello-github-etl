"use strict";

const M_CREATED = 0;
const M_LISTS = 1; // oops, skipped 1 (literally)
//const M_COMMENTS = 4;
const SLEEP = 3000;

let Storage = require("dom-storage");
let localStorage = new Storage("./db.json", { strict: true, ws: "  " });
let JsonStorage = require("json-storage").JsonStorage;
let store = JsonStorage.create(localStorage, "trello-gh-projects", {
  stringify: true,
});

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

function checklistItemToIssue(item /*, labels*/) {
  let task = item.name.trim();
  let body = "";

  // See tests/dash-parser-re.js for matching pattern
  // (generally it's something like '(1.0 Dash)', with * spaces)
  let dashRe = /(\s+\(\s*((\d+)?(\.\d+)?)\s*\Dash\s*\)\s*)/i;
  let m = task.match(dashRe);
  if (m) {
    let whole = m[1];
    let money = m[2];

    task = task.replace(whole, "").trim();
    // TODO add to custom field
    body = `Bounty: ${money} Dash`;
  }

  return {
    title: task,
    body: body,
    assignees: [item.idMember]
      .map(function (id) {
        return members[id];
      })
      .filter(Boolean),
  };
}

async function upsertChecklistItem(item) {
  console.info("    [Task]", item.name, item.id);
  let changed = false;
  let fullIssue = store.get(`checkItem:${item.id}`);
  let issue = checklistItemToIssue(item);

  console.info(`    [Task.body] ${issue.body}`);

  if (!fullIssue) {
    changed = true;
    fullIssue = await gh.issues.create(issue);
    store.set(`checkItem:${item.id}`, fullIssue);
  }
  if (!fullIssue.__migration) {
    fullIssue.__migration = M_CREATED;
  }

  if ("complete" === item.state && "closed" !== fullIssue.state) {
    changed = true;
    let m = fullIssue.__migration;
    fullIssue = await gh.issues.update(fullIssue.number, { state: "closed" });
    fullIssue.__migration = m;
    store.set(`checkItem:${item.id}`, fullIssue);
  }

  return changed;
}

async function upsertCard(card) {
  console.info("[Bounty]", card.name);
  let changed = false;
  let fullIssue = store.get(`card:${card.id}`);
  let issue = cardToIssue(card);

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
