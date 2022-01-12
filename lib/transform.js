"use strict";

var Transform = module.exports;

let members = require("../members.json");

// capture bounty amount
// See tests/dash-parser-re.js for matching pattern
// (generally it's something like '(1.0 Dash)', with * spaces)
// ex: 'Some task (1 DASH)' = > '1'
Transform._dashAmountRe = /\s+\(\s*((\d+)?(\.\d+)?)\s*\Dash\s*\)\s*/i;

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
