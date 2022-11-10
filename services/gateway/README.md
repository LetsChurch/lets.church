# Gateway

A GraphQL gateway service.

> **Matthew 7:13-14 ESV**  
> “Enter by the narrow gate. For the gate is wide and the way is easy that leads to destruction, and those who enter by it are many. [14] For the gate is narrow and the way is hard that leads to life, and those who find it are few.

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
