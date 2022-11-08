# πρόσκαιρος ([G4340](https://www.blueletterbible.org/lexicon/g4340/kjv/tr/0-1/)) (pros'-kahee-ros)

[Temporal] Workflows, Activities, and Client

## Understanding [Temporal] (High Level)

- Workflows can coordinate activities, receive signals, and respond to queries.
- Workflows run in V8 isolates and cannot use any node APIs.
- Activities run in worker processes (standard node process, can use node APIs).
- Workflows should use [Temporal] APIs and coordinate activities, anything that
  produces a side effect should be done in activities. Workflows do not import
  or use activities directly, they are proxied for the purpose of scheduling.
- Only activity types are imported into workflows.
- Clients schedule workflows to run. While workflow functions are passed
  directly to the client, it is never called by the client. It is only used for
  type inference and for getting the name of a workflow for scheduling.
- Workers run workflows and activities. In development, Temporal uses Webpack
  to bundle workflow code for running inside V8 isolates.

[Temporal]: https://temporal.io "Less plumbing, more coding"
