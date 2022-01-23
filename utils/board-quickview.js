"use strict";

let Transform = require("../lib/transform.js");

let board = require("../board.json");
board = Transform.trelloBoardUpgrade(board);

//let members = board.members;
let cards = board.cards;
//let checklists = board.checklists;

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
    if (card._inactive) {
      // skip closed card
      return;
    }

    actives.Columns[card._trelloCardType] = true;
    card._trelloCustomFields.forEach(function (customField) {
      actives["Custom Fields"][customField.name] = true;
    });

    card._trelloLabels.forEach(function (label) {
      actives.Labels[label] = true;
    });
    if (!card._trelloLabels) {
      card._trelloLabels.push("!Label");
    }

    if (!card._owner) {
      card._owner = "!Owner";
    } else {
      actives.Members[card._owner] = true;
    }

    if (!card._fallbackOwner || "!Fallback" === card._fallbackOwner) {
      card._fallbackOwner = "!Fallback";
      if (card._rawFallbackOwner) {
        actives["Typoed Members"][card._rawFallbackOwner] = true;
      }
    }

    console.info(
      "|",
      [
        card.id,
        "Card",
        card._trelloCardType,
        "-",
        card._owner,
        card._fallbackOwner || card._rawFallbackOwner + "*",
        "-",
        card._trelloLabels.join(", "),
      ].join("|"),
      "|"
    );

    card.checklists.forEach(function (checklist) {
      checklist.checkItems.forEach(function (item) {
        if ("completed" === item.state) {
          // skip completed tasks
          return;
        }

        actives.Checklists[item._trelloTaskType] = true;

        let member = "!Assigned";
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
            item._trelloTaskType,
            "-", //card._owner,
            "-", //card._fallbackOwner || card.__fallbackOwner + "*",
            item._assignee,
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
