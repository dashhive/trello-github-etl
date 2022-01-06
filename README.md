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

GH.projects.getCustomFields();
GH.projects.add(issueOrPrNodeId);
GH.projects.setDashAmount(projectItemId, amount);
```

# Resources

- GitHub's REST API for Issues: https://docs.github.com/en/rest/reference/issues
- GitHub's GraphQL API for "Memexes" (Project Beta): \
  https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#adding-an-item-to-a-project
- How to GraphQL: https://graphql.org/learn/queries/
