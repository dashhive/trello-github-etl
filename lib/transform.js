"use strict";

var Transform = module.exports;

let members = require("../members.json");
let memberlist = require("../board.json").members;

// capture bounty amount
// See tests/dash-parser-re.js for matching pattern
// (generally it's something like '(1.0 Dash)', with * spaces)
// ex: 'Some task (1 DASH)' = > '1'
Transform._dashAmountRe = /\s+\(\s*((\d+)?(\.\d+)?)\s*Dash\s*\)\s*/i;

// nix number prefix
// "1) do this" => 1
// "  2)  do that" => 2
// "b 3) do that" => ❌
// "4)do other" => ❌
Transform._indexRe = /^\s*(\d+\))\s+/i;

Transform.parseChecklistItem = function (item) {
  let m = item.name.match(Transform._indexRe);
  if (m) {
    item.name = item.name.replace(m[0], "").trim();
    // TODO save m[1] as metadata
  }

  m = item.name.match(Transform._dashAmountRe);
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
  words.forEach(function (w) {
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

  return item;
};

Transform.mapCardToIssue = function _cardToIssue(card) {
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
};

Transform.mapChecklistItemToIssue = function _checklistItemToIssue(
  item /*, labels*/
) {
  return {
    title: item._title,
    body: item._desc,
    assignees: [item.idMember]
      .map(function (id) {
        return members[id];
      })
      .filter(Boolean),
  };
};

/**
 * Turns a full Trello card into Markdown for an issue
 *
 * ```mkdn
 * Imported from <https://trello.com/c/xxxxxxxx/184-incubator-on-github>.
 *
 * > Bounty management, discussions, etc, co-located with our public repos.
 *
 * ## Specification
 *
 * - [x] #37
 * - [ ] #42
 * ```
 */
Transform.mapCardToIssueMkdn = function cardToIssueBody(cardWithIssues) {
  let checklists = cardWithIssues.checklists.map(mapChecklistToIssueMkdn);

  let checklistsList = checklists.join("\n");

  return [
    `Imported from <${cardWithIssues.url}>.`,
    `> ${cardWithIssues.desc}`,
    `${checklistsList}`,
  ].join("\n\n");
};

/**
 * Turns a Trello checklist (and its items) into Markdown for an issue
 *
 * ```mkdn
 * ## Specification
 *
 * - [x] #37
 * - [ ] #42
 * ```
 */
function mapChecklistToIssueMkdn(checklistWithIssues) {
  let tasks = checklistWithIssues.checkItems.map(function (checkItem) {
    //let issue = store.get(`checkItem:${checkItem.id}`);
    let issue = checkItem._issue;
    if (!issue) {
      console.warn("[warn]: should not have item without associated issue:");
      console.warn(checkItem);
      return "";
    }
    return mapCheckItemIssueToMkdn(issue);
  });

  let taskList = "";
  if (tasks) {
    taskList = tasks.join("\n") + "\n";
  }
  // TODO checklist.name should be a label
  //   - Concept
  //   - Specification
  //   - Production
  //   - QA
  return `## ${checklistWithIssues.name}\n\n${taskList}`;
}

/**
 * Return an trello-checklist-item/child-issue for a trello-card/parent-issue
 *
 * ```mkdn
 * - [x] #42
 * ```
 */
function mapCheckItemIssueToMkdn(issue) {
  let checked = " ";
  let closed = "closed" === issue.state;

  if (closed) {
    checked = "x";
  }
  return `- [${checked}] #${issue.number}`;
}

Transform.usernameToId = function (username) {
  if (!username) {
    return;
  } else {
    let ownerInfo = memberlist.find((m) =>
      m.username.includes(username.toLowerCase().slice(1))
    );
    return ownerInfo.id;
  }
};

Transform.idToUsername = function (id) {
  if (!id) {
    return;
  } else {
    let Username = memberlist.find((m) => m.id.includes(id)).username;
    return Username;
  }
};
