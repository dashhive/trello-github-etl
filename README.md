# trello-github-etl

Export from Trello.

Transform and Parse.

Load to GitHub Issues + Project (Beta).

# QuickStart

If you've done this before, here's the high-level recap.

Otherwise read the **Setup** section.

```bash
npm ci --only=production

rsync -avhP example.env .env

vim .env

vim board.json
vim members.json

node ./etl.js
```

# Setup

## `board.json`

You'll need to get this from the relevant Trello board. For example:

- Go to <https://trello.com/b/FPJzDcok/dash-incubator-app>
- Click <kbd>... Show menu</kbd> (on the right, under account photo)
- Click <kbd>&lt;</kbd> (if present) at the top of the "More" menu
- Click <kbd>... More</kbd> (yes, this feels very redundant)
- Click <kbd>⤵️ Print &amp; Export</kbd>

The relevant boards JSON file will be nested under a `./boards/` directory in
the zip file. For example:

```bash
ls -lAh ~/Downloads/dash-trello-boards.zip
mkdir -p ~/Downloads/dash-trello-boards
pushd ~/Downloads/dash-trello-boards/
unzip ../dash-trello-boards.zip
find ~/Downloads/dash-trello-boards | grep '\.json$'
```

```txt
~/Downloads/dash-trello-boards/boards/dash_incubator_app/dash_incubator_app.json
```

**You should rename** that file to `board.json` in the project directory. For
example:

```bash
mv ~/Downloads/dash-trello-boards/boards/dash_incubator_app/dash_incubator_app.json \
    ./board.json
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
Etl.upsertChecklist(checklist);
Etl.upsertChecklistItem(item);
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
```

# Resources

- GitHub's REST API for Issues: https://docs.github.com/en/rest/reference/issues
- GitHub's GraphQL API for "Memexes" (Project Beta): \
  https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#adding-an-item-to-a-project
- How to GraphQL: https://graphql.org/learn/queries/
