# Atlas load-test dataset

The database contains 1,000 synthetic `LOADTEST-*` entries for measuring the Explorer and API under a larger result set. These are not real heritage records and have no images or citations.

To re-run the idempotent seed:

```bash
npm run seed:loadtest
```

By default, load-test entries are excluded from the public records API. Open the local Explorer with `?loadTest=1` to include them while testing:

```text
http://127.0.0.1:5182/explorer?loadTest=1
```

The `loadTest=1` API option is implemented only in the local Express server. The deployed API continues to hide these records. To remove the test rows later, delete records whose `slug` starts with `loadtest-sample-` from the `heritageentries` collection in the `heritage_atlas` database.
