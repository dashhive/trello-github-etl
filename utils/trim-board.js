"use strict";

let process = require("process");
let fs = require("fs");

function usage() {
  console.log(`Usage: node ./util/trim-board.js <BOARD_JSON> <MAX> <OUT_JSON>`);
  console.log(``);
  console.log(
    `Example: node ./util/trim-board.js ./board.json 5 ./trimmed-board.json`
  );
  console.log(``);
}
async function fetchBoard() {
  let boardFile = process.argv[2];
  let maxCards = parseInt(process.argv[3], 10);
  let trimmedFile = process.argv[4];

  if (isNaN(maxCards)) {
    console.error(`MAX is not a valid integer!`);
    return null;
  }
  if (maxCards <= 0) {
    console.error(`MAX must be a positive non-zero integer`);
    return null;
  }

  console.log(``);
  console.log(`-- Opening: "${boardFile}"`);
  console.log(``);
  let board = await fs.readFileSync(boardFile, {
    encoding: "utf8",
    flags: "r",
  });
  board = board.toString();
  try {
    console.log(`-- Parsing board...`);
    board = JSON.parse(board);
    console.log(`-- Board parsed`);
    return { maxCards, board, trimmedFile };
  } catch (e) {
    console.error(`-- Failed to parse ${boardFile}: `, e);
    return null;
  }
}

function extractCards(board, maxCards) {
  let memberIDSet = {};
  let cardIDSet = {};
  let cardSubset = [];
  let cardCounter = 0;
  for (let i = 0; i < board.cards.length && cardCounter < maxCards; i += 1) {
    cardSubset.push(board.cards[i]);
    cardIDSet[board.cards[i].id] = 1;
    for (let userID of board.cards[i].idMembers) {
      memberIDSet[userID] = 1;
    }
    cardCounter += 1;
  }
  if (cardCounter !== maxCards) {
    console.warn(
      `Extracted ${cardCounter} entries. You specified ${maxCards}.`
    );
  }
  let cardIDList = Object.keys(cardIDSet);

  console.log(`-- Extracted ${cardIDList.length} card(s)`);
  return { cardIDList, cardSubset, memberIDList: Object.keys(memberIDSet) };
}
function extractMembers(board, memberIDList) {
  let memberSubset = [];
  for (let member of board.members) {
    if (-1 !== memberIDList.indexOf(member.id)) {
      memberSubset.push(member);
    }
  }
  console.log(`-- Extracted ${memberSubset.length} member(s)`);
  return memberSubset;
}

function extractChecklists(board, cardIDList) {
  let checklistSubset = [];
  for (let checklist of board.checklists) {
    if (-1 !== cardIDList.indexOf(checklist.idCard)) {
      checklistSubset.push(checklist);
    }
  }
  return checklistSubset;
}
function extractActions(board, cardIDList) {
  let actionSubset = [];
  for (let action of board.actions) {
    if (typeof action.data?.card?.id === "undefined") {
      continue;
    }
    if (-1 !== cardIDList.indexOf(action.data.card.id)) {
      actionSubset.push(action);
    }
  }
  return actionSubset;
}
async function writeBoardToFile(board, trimmedFile) {
  let content = JSON.stringify(board);
  await fs.writeFileSync(trimmedFile, content, {
    encoding: "utf8",
    mode: 0o664,
    flag: "w",
  });
  console.log(`-- Wrote "${trimmedFile}"`);
}
async function main() {
  if (process.argv.length < 5) {
    usage();
    return;
  }
  let obj = await fetchBoard();
  if (!obj) {
    return;
  }
  let { maxCards, board, trimmedFile } = obj;

  let { cardSubset, memberIDList, cardIDList } = extractCards(board, maxCards);
  board.cards = cardSubset;

  board.members = extractMembers(board, memberIDList);

  board.checklist = extractChecklists(board, cardIDList);

  console.log(`-- Extracted ${board.checklist.length} related checklist(s)`);

  board.actions = extractActions(board, cardIDList);

  console.log(`-- Extracted ${board.actions.length} related action(s)`);

  await writeBoardToFile(board, trimmedFile);
  console.log(`-- Wrote "${trimmedFile}"`);
  console.log(`-- Done.`);
}

main();
