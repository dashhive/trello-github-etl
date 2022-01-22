"use strict";

let Transform = require("../lib/transform.js");

let board = require("../board.json");
board = Transform.trelloBoardUpgrade(board);

//let members = board.members;
let cards = board.cards;
//let checklists = board.checklists;

let trelloFields = require("../trello-fields.json");

function grabDirtyFallbackOwner(card) {
  let fallbackOwnerField = card.customFieldItems.find(function (field) {
    return field.idCustomField === trelloFields.secondaryAdmin;
  });

  let fallbackOwner = fallbackOwnerField?.value?.text?.replace(/^@/, "");
  return fallbackOwner;

  /*
  let fallbackOwnerId = "";
  if (fallbackOwner) {
    fallbackOwnerId = Transform.trelloUsernameToId(fallbackOwner);
  }

  return fallbackOwnerId;
  */
}

console.info("");
console.info("Trello board stuff...");
console.info("");

console.info("Columns (a.k.a. lists, a.k.a. Trello Types):");
board.lists.forEach(function (list) {
  console.info(`    ${list.name}`);
});
console.info("");

console.info("Labels ('Meta' vs 'Paused', 'Completed':");
board.labels.forEach(function (label) {
  console.info(`    ${label.name}`);
});
console.info("");

let actives = {
  Members: {},
  "Typoed Members": {},
  Columns: {},
  Labels: {},
  "Custom Fields": {},
  Checklists: {},
};

console.info(
  `| Trello ID | Issue Type | Card Type | Task Type | Owner | Owner 2 | Assignee | Labels |`
);
console.info(
  `| --------- | ---------- | --------- | --------- | ----- | ------- | -------- | ------ |`
);
cards
  //
  //.slice(70, 80)
  //
  .forEach(function (card) {
    if (card.closed) {
      // skip closed card
      return;
    }

    let list = board.lists.find(function (list) {
      return list.id === card.idList;
    });
    card._trelloCardType = list.name;
    actives.Columns[card._trelloCardType] = true;

    card.customFieldItems.forEach(function (field) {
      let customField = board.customFields.find(function (cf) {
        return field.idCustomField === cf.id;
      });
      actives["Custom Fields"][customField.name] = true;
    });

    let labels = card.labels.map(function (label) {
      actives.Labels[label.name] = true;
      return label.name;
    });
    if (!labels.length) {
      labels.push("! No Label");
    }

    // Set Owner & Fallback Owner
    card._members = card.idMembers.map(function (id) {
      return Transform.trelloIdToUsername(id);
    });
    card.__fallbackOwner = grabDirtyFallbackOwner(card);
    card._owner = card._members.find(function (m) {
      // "riongull".match("samkirby") // null
      // "samkirby22".match("samkirby") // ["samkirby22", "samkirby"]
      if (!card.__fallbackOwner) {
        return true;
      }
      return !m.toLowerCase().match(card.__fallbackOwner.toLowerCase());
    });
    if (!card._owner) {
      card._owner = "! No Owner";
    } else {
      actives.Members[card._owner] = true;
    }

    // Set "clean" Fallback Owner
    if (card.__fallbackOwner) {
      card._fallbackOwner = card._members.find(function (m) {
        // protect against similar names
        // [ "sam", "samkirby" ]
        if (card._owner) {
          if (m.toLowerCase() === card._owner.toLowerCase()) {
            return false;
          }
        }

        // TODO  distinguish between perfect and similar matches?
        return m.toLowerCase().match(card.__fallbackOwner.toLowerCase());
      });
      if (card._fallbackOwner) {
        actives.Members[card._fallbackOwner] = true;
      } else {
        actives["Typoed Members"][card.__fallbackOwner] = true;
      }
    }
    if (!card._fallbackOwner) {
      card._fallbackOwner = "! No Fallback Owner";
    }

    console.info(
      "|",
      [
        card.id,
        "Card",
        card._trelloCardType,
        "-",
        card._owner,
        card._fallbackOwner || card.__fallbackOwner + "*",
        "-",
        labels.join(", "),
      ].join("|"),
      "|"
    );

    card.checklists.forEach(function (checklist) {
      checklist.checkItems.forEach(function (item) {
        if ("completed" === item.state) {
          // skip completed tasks
          return;
        }

        let taskType = checklist.name.replace(/\s*Tasks?\s*/, "") + " Task";
        actives.Checklists[taskType] = true;

        let member = "! Not Assigned";
        if (item.idMember) {
          member = Transform.trelloIdToUsername(item.idMember);
          if (!member) {
            console.warn(
              `XXXX couldn't translate ${item.idMember} to member name`
            );
          }
          actives.Members[member] = true;
        }

        console.info(
          "|",
          [
            item.id,
            "Task",
            "-", //card._trelloCardType,
            taskType,
            "-", //card._owner,
            "-", //card._fallbackOwner || card.__fallbackOwner + "*",
            member,
            "-", //labels.join(", ")
          ].join("|"),
          "|"
        );
      });
    });
  });

console.info("");
console.info("");

Object.keys(actives).forEach(function (category) {
  console.info(`## Active ${category}`);
  console.info("");
  let group = actives[category];
  Object.keys(group)
    .sort()
    .forEach(function (name) {
      console.info(`- ${name}`);
    });
  console.info("");
});

console.info("");
