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
  return {
    title: item._title,
    body: item._desc,
    assignees: [item.idMember]
      .map(function (id) {
        return members[id];
      })
      .filter(Boolean),
  };
}

async function upsertChecklistItem(item) {
  // TODO: make optional
  if ("complete" === item.state) {
    // don't import completed items
    return;
  }

  // nix number prefix
  // "1) do this" => 1
  // "  2)  do that" => 2
  // "b 3) do that" => ❌
  // "4)do other" => ❌
  let indexRe = /^\s*(\d+\))\s+/i;
  let m = item.name.match(indexRe);
  if (m) {
    item.name = item.name.replace(m[0], "").trim();
    // TODO save m[1] as metadata
  }

  // capture bounty amount
  // See tests/dash-parser-re.js for matching pattern
  // (generally it's something like '(1.0 Dash)', with * spaces)
  // ex: 'Some task (1 DASH)' = > '1'
  let dashRe = /\s+\(\s*((\d+)?(\.\d+)?)\s*\Dash\s*\)\s*/i;
  m = item.name.match(dashRe);
  if (m) {
    let whole = m[0];
    let amount = m[1];

    item.name = item.name.replace(whole, "").trim();
    // TODO add to custom field
    item._amount = amount;
  }

  // make 50 chars title and the rest body
  let words = item.name.split(/\s/);
  item._title = "";
  item._desc = "";
  words.forEach(function (w, i) {
    if (item._desc) {
      item._desc += `${w} `;
      return;
    }

    if (item._title.length < 50) {
      item._title += `${w} `;
      return;
    }

    item._title = item._title.trim() + "...";
    item._desc += `${w} `;
  });
  item._desc = item._desc.trim();

  if (item._amount) {
    if (item._desc) {
      item._desc += "\n\n";
    }
    item._desc += `Bounty: ${item._amount} Dash`;
  }

  console.info(`    [Task ${item.id}]`, JSON.stringify(item._title, null, 2));
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
