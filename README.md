# trello-github-etl

Export from Trello.

Transform and Parse.

Load to GitHub Issues + Project (Beta).

# Watch the Video

[![Dash ETL Quickstart Screen Shot 2022-01-12 at 3 13 36 AM](https://user-images.githubusercontent.com/122831/149121467-1b8d0a29-2a7d-4c76-83ee-bb582173d5bf.jpg)](https://youtu.be/7GbBRw1JA2Q?t=15464)

19-minute Walkthrough [4:17:44 - 4:36:35](https://youtu.be/7GbBRw1JA2Q?t=15464):

- <https://youtu.be/7GbBRw1JA2Q?t=15464>

Original Q&A Walkthrough
[3:20:25 - 3:50:05](https://youtu.be/7GbBRw1JA2Q?t=12025)

- <https://youtu.be/7GbBRw1JA2Q?t=12025>

# QuickStart

If you've done this before, here's the high-level recap.

Otherwise read the **Setup** section.

You'll need

- a **GitHub Personal Access Token**: <https://github.com/settings/tokens>
- Node.js: https://webinstall.dev/node

```bash
git clone https://github.com/dashtesting/trello-github-etl
pushd ./trello-github-etl/
```

```bash
npm ci --only=production
```

```bash
rsync -avhP example.env .env

vim .env
```

```bash
vim board.json
vim members.json
vim trello-fields.json
```

```bash
node ./etl.js
```

# Setup

## `.env`

### `GITHUB_TOKEN`

See <https://github.com/settings/tokens>. \
The permissions that need to be checked for the token can be found at the top of
the .env file

### `GITHUB_PROJECT`

The Project Number (used to get the Project Node ID) can be found in the URL of
the project. For example:

- <https://github.com/orgs/dashtesting/projects/2/views/1>

Here the project number is `2`.

### `GITHUB_DASH_FIELD`

Get the GraphQL field NodeID using the provided util. For example:

```bash
node utils/get-github-project-fields.js
```

```txt
"MDE2OlByb2plY3ROZXh0RmllbGQ5NDA2NjY=": "Labels"
"MDE2OlByb2plY3ROZXh0RmllbGQ5NTE0NTg=": "Dash"
"MDE2OlByb2plY3ROZXh0RmllbGQxMDM4NzYy": "Issue Type"
"MDE2OlByb2plY3ROZXh0RmllbGQxMDM4NzYz": "Trello Type"
"MDE2OlByb2plY3ROZXh0RmllbGQxMDM4Nzc0": "Task Type"
"MDE2OlByb2plY3ROZXh0RmllbGQxMDQwNDc4": "Fallback Owner"
```

Here the Dash Field ID is `MDE2OlByb2plY3ROZXh0RmllbGQ5NTE0NTg=`.

## `board.json`

You'll need to get this from the relevant Trello board. For example:

- Go to <https://trello.com/b/FPJzDcok/dash-incubator-app>
- Click <kbd>... Show menu</kbd> (on the right, under account photo)
- Click <kbd>&lt;</kbd> (if present) at the top of the "More" menu
- Click <kbd>... More</kbd> (yes, this feels very redundant)
- Click <kbd>⤵️ Print &amp; Export</kbd>

```txt
~/Downloads/FPJzDcok.json
```

**You should rename** that file to `board.json` in the project directory. For
example:

```bash
mv ~/Downloads/FPJzDcok.json ./board.json
```

## `members.json`

You'll need to create this file by hand... sort of...

You can get the Trello user list from one of the included utils:

```bash
node ./utils/get-member-info.js
```

```txt
"51ba022b569488283d000181": "trello:coolaj86,"             // coolaj86
"57e58ebcdb59d360ac33b82f": "trello:riongull,"             // riongull
```

But you'll need to map between Trello usernames and GitHub usernames by hand
because there's really no magic to do that for you... :)

```json5
{
  // "    trello-user-id   ": "github-username",
  "57e58ebcdb59d360ac33b82f": "riongull",
  "51ba022b569488283d000181": "coolaj86",
}
```

## `trello-fields.json`

This file also needs to be created by hand. It's used for mapping a custom field
name to custom field id.

Custom fields are located at in the trello JSON object at board.customFields

````json5
{
  // "name of custom field : "id number of custom field",
  "secondaryAdmin" : "5ff85abd2b962872d01fe3bf",
}

# API

```js
// Generic Usage
let Etl = require("./etl.js");
let board = require("./board.json");

board.cards.reduce(async function (promise, card) {
  await promise;
  let changed = await Etl.upsertCard(card);
  if (changed) {
    await sleep(SLEEP);
  }
}, Promise.resolve());
```

```js
let Etl = require("./etl.js");

Etl.upsertCard(card);
Etl.upsertChecklist(card, checklist);
Etl.upsertChecklistItem(card, item);
```

```js
let GH = require("./lib/gh.js");

GH.issues.create({ title, body, assignments });
GH.issues.update(number, { title, body, assignments, state });

GH.projects.getCustomFields();
GH.projects.add(issueOrPrNodeId);
GH.projects.setDashAmount(projectItemId, amount);
```

```js
let Transform = require("./lib/transform.js");

Transform.parseChecklistItem(item);

Transform.mapCardToIssue(card);
Transform.mapChecklistItemToIssue(item);

// Note: cardWithIssues = addIssuesToCardChecklistItems(card);
Transform.mapCardToIssueMkdn(cardWithIssues);
Transform.trelloIdToUsername(id);
Transform.trelloUsernameToId(username);
```

# Resources

- GitHub's REST API for Issues: https://docs.github.com/en/rest/reference/issues
- GitHub's GraphQL API for "Memexes" (Project Beta): \
  https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#adding-an-item-to-a-project
- How to GraphQL: https://graphql.org/learn/queries/

## JSON Examples

- `board.cards[x]`
- `board.checklists[x]`

### `board.cards[x]`

```json5
{
  id: "614cee94c40be9391717fc4e",
  address: null,
  checkItemStates: null,
  closed: false,
  coordinates: null,
  creationMethod: null,
  dateLastActivity: "2022-01-12T05:35:00.228Z",
  desc: "**Value Proposition**\nBounty management, discussions, on-boarding/training, document storage, and other Incubator work and workflows on the industry-leading platform for developers, co-located with our Incubator-funded public repos.",
  descData: {
    emoji: {},
  },
  dueReminder: null,
  idBoard: "5e35713d369d4a775484d0b4",
  idLabels: ["5ec9333fcc5a3231f90c4023"],
  idList: "5f592342886341245a9827a0",
  idMembersVoted: [],
  idShort: 184,
  idAttachmentCover: null,
  locationName: null,
  manualCoverAttachment: false,
  name: "Incubator on GitHub",
  pos: 1024,
  shortLink: "m8w82CvE",
  isTemplate: false,
  cardRole: null,
  badges: {
    attachmentsByType: {
      trello: {
        board: 0,
        card: 0,
      },
    },
    location: false,
    votes: 0,
    viewingMemberVoted: false,
    subscribed: false,
    fogbugz: "",
    checkItems: 18,
    checkItemsChecked: 16,
    checkItemsEarliestDue: "2022-01-13T01:00:00.000Z",
    comments: 50,
    attachments: 0,
    description: true,
    due: null,
    dueComplete: false,
    start: null,
  },
  dueComplete: false,
  due: null,
  idChecklists: [
    "614ceec0993f871f55e0cd38",
    "614e5e606bdd82239974875b",
    "61573e6c0ce52a184268be26",
    "615c6fffd5b4158e086a3234",
  ],
  idMembers: ["59ceb948feac14253a312881", "57e58ebcdb59d360ac33b82f"],
  labels: [
    {
      id: "5ec9333fcc5a3231f90c4023",
      idBoard: "5e35713d369d4a775484d0b4",
      name: "Meta",
      color: "pink",
    },
  ],
  limits: {
    attachments: {
      perCard: {
        status: "ok",
        disableAt: 1000,
        warnAt: 800,
      },
    },
    checklists: {
      perCard: {
        status: "ok",
        disableAt: 500,
        warnAt: 400,
      },
    },
    stickers: {
      perCard: {
        status: "ok",
        disableAt: 70,
        warnAt: 56,
      },
    },
  },
  shortUrl: "https://trello.com/c/m8w82CvE",
  start: null,
  subscribed: false,
  url: "https://trello.com/c/m8w82CvE/184-incubator-on-github",
  cover: {
    idAttachment: null,
    color: null,
    idUploadedBackground: null,
    size: "normal",
    brightness: "dark",
    idPlugin: null,
  },
  attachments: [],
  pluginData: [],
  customFieldItems: [
    {
      id: "6179da95ff04bf2d23bdc864",
      value: {
        text: "riongull",
      },
      idCustomField: "5ff85abd2b962872d01fe3bf",
      idModel: "614cee94c40be9391717fc4e",
      modelType: "card",
    },
    {
      id: "614cef06ce2b394a0fc52c3e",
      value: {
        text: "https://trello.com/c/6XAuy9DW/94-request-new-concept#comment-614ce5673031a4043ef3d479",
      },
      idCustomField: "5fb2deb8cb3c7e36cb8614aa",
      idModel: "614cee94c40be9391717fc4e",
      modelType: "card",
    },
    {
      id: "614ceef478d7c92b0f16879f",
      value: {
        checked: "true",
      },
      idCustomField: "5fad5f1b8db2260cdda1ffed",
      idModel: "614cee94c40be9391717fc4e",
      modelType: "card",
    },
  ],
}
```

### `board.checklists[x]`

```json5
{
  id: "614ceec0993f871f55e0cd38",
  name: "Concept",
  idCard: "614cee94c40be9391717fc4e",
  pos: 16384,
  creationMethod: null,
  idBoard: "5e35713d369d4a775484d0b4",
  limits: {
    checkItems: {
      perChecklist: {
        status: "ok",
        disableAt: 200,
        warnAt: 160,
      },
    },
  },
  checkItems: [
    {
      idChecklist: "614ceec0993f871f55e0cd38",
      state: "complete",
      id: "614ceec0993f871f55e0cd39",
      name: "1) Valid new concept accepted by an incubator admin (0.5 Dash)",
      nameData: {
        emoji: {},
      },
      pos: 16384,
      due: null,
      idMember: "57e58ebcdb59d360ac33b82f",
    },
  ],
}
```
````
