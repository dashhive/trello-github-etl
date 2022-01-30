"use strict";

var Transform = module.exports;

let members = require("../members.json");
let trelloBoard = require("../board.json");
let trelloFields = require("../trello-fields.json");

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

Transform.trelloUsernameToId = function (username) {
  if (!username) {
    return;
  }

  username = username.toLowerCase().replace(/^@/, "");
  let ownerInfo = trelloBoard.members.find(function (member) {
    // allow partial / imperfect matches
    // ex: 'johndoe' should match 'johndoe80'
    return member.username.toLowerCase().includes(username);
  });

  // it's possible for the owner to not exist because the
  // custom field is arbitrary text and can therefore have a typo
  if (!ownerInfo) {
    console.warn(
      `[warn] could not find '${username}' among trello board members`
    );
    return;
  }

  return ownerInfo.id;
};

Transform.trelloIdToUsername = function (id) {
  if (!id) {
    return;
  }
  let member = trelloBoard.members.find(function (member) {
    return member.id === id;
  });
  return member.username;
};

Transform.trelloBoardUpgrade = function (board) {
  // transform between the old trello board.json style and the new version
  let cardsMap = {};

  board.cards.forEach(function (card) {
    cardsMap[card.id] = card;
    // the new format doesn't have checklists
    if (!card.checklists) {
      card.checklists = [];
      card._newChecklists = true;
    }
  });

  if (board.checklists) {
    board.checklists.forEach(function (checklist) {
      let card = cardsMap[checklist.idCard];
      if (card._newChecklists) {
        card.checklists.push(checklist);
      }
    });
  }

  board.cards.forEach(function (card) {
    // sort checklists by Trello sort order
    card.checklists.sort(function (a, b) {
      return a.pos - b.pos;
    });
  });

  cardsMap = null;

  return board;
};

Transform.customizeTrelloCard = function (card, includeInactive) {
  // adds _inactive, _trelloCardType, _trelloCustomFields,
  // _trelloLabels, _owner, _fallbackOwner
  card._inactive = card.closed || false;
  if (card._inactive && !includeInactive) {
    // skip closed card
    return;
  }

  card._trelloCardType = Transform._getCardColumn(card);
  card._trelloCustomFields = Transform._getCardCustomFields(card);
  card._trelloLabels = Transform._getCardLabels(card);
  if (!card._trelloLabels.length) {
    card._trelloLabels.push("!Label");
  }

  let owners = Transform._getCardOwners(card);
  card._owner = owners[0] || "!Owner";
  card._fallbackOwner = owners[1] || "!Fallback";

  card.checklists.forEach(function (checklist) {
    checklist.checkItems.forEach(function (item) {
      item._inactive = "complete" === item.state;
      if (item._inactive && !includeInactive) {
        // skip completed tasks
        return;
      }

      // adds _amount, _title, _desc
      item = Transform.parseChecklistItem(item);

      item._trelloTaskType =
        checklist.name.replace(/\s*Tasks?\s*/, "") + " Task";

      item._assignee = "!Assigned";
      if (item.idMember) {
        item._assignee = Transform.trelloIdToUsername(item.idMember);
      }
    });
  });

  return card;
};

Transform._getCardColumn = function (card) {
  let list = trelloBoard.lists.find(function (list) {
    return list.id === card.idList;
  });
  return list.name;
};

Transform._getCardCustomFields = function (card) {
  return card.customFieldItems.map(function (field) {
    let customField = trelloBoard.customFields.find(function (cf) {
      return field.idCustomField === cf.id;
    });
    return customField.name;
  });
};

Transform._getCardLabels = function (card) {
  let labels = card.labels.map(function (label) {
    return label.name;
  });
  return labels.sort();
};

// Sorry, because this matches loosely, it needs a lot of weird state
Transform._getCardOwners = function (card) {
  let _owner;
  let _rawFallbackOwner;
  let _fallbackOwner;

  // Set Owner & Fallback Owner
  let _members = card.idMembers.map(function (id) {
    return Transform.trelloIdToUsername(id);
  });

  let fallbackOwnerField = card.customFieldItems.find(function (field) {
    return field.idCustomField === trelloFields.secondaryAdmin;
  });
  _rawFallbackOwner = fallbackOwnerField?.value?.text?.replace(/^@/, "");

  _owner = _members.find(function (m) {
    // "riongull".match("samkirby") // null
    // "samkirby22".match("samkirby") // ["samkirby22", "samkirby"]
    if (!_rawFallbackOwner) {
      return true;
    }
    return !m.toLowerCase().match(_rawFallbackOwner.toLowerCase());
  });

  // Set "clean" Fallback Owner
  if (_rawFallbackOwner) {
    _fallbackOwner = _members.find(function (m) {
      // protect against similar names
      // [ "sam", "samkirby" ]
      if (_owner) {
        if (m.toLowerCase() === _owner.toLowerCase()) {
          return false;
        }
      }

      // TODO  distinguish between perfect and similar matches?
      return m.toLowerCase().match(_rawFallbackOwner.toLowerCase());
    });
    if (!_fallbackOwner) {
      // if there is a perfect match in the full member list,
      // use that - it may be that the member wasn't associated with the board
      _fallbackOwner = trelloBoard.members.find(function (member) {
        return member.username.toLowerCase() === _rawFallbackOwner.toLowerCase();
      });
    }
  }
  if (_owner === _fallbackOwner) {
    _fallbackOwner = undefined;
    _rawFallbackOwner = undefined;
  }

  return [_owner, _fallbackOwner, _rawFallbackOwner];
};
