# trello-github-etl

In case AJ dies in a bus accident \
(thankfully AJ doesn't ride buses)

Rion did a zip export from the "Show menu..." menu of
<https://trello.com/b/FPJzDcok/dash-incubator-app>.

I called that `board.json`.

```bash
npm ci --only=production

rsync -avhP example.env .env

vim .env

node etl.js
```

# API

```js
let GH = require("./lib/gh.js");

GH.issues.create({ title, body, assignments });
GH.issues.update(number, { title, body, assignments, state });

GH.projects.add(issueOrPrNodeId);
```
