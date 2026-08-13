# gteam-internal

`@apify/actor-utils/gteam-internal` is a separate export. Unlike the
top-level `safePushData`, it calls `Actor.pushData` / `Dataset.pushData`
directly instead of taking a `pushFn` — so `scripts/check-pushdata.mjs`
excludes this subfolder from its guard.

```ts
import { safePushData } from '@apify/actor-utils/gteam-internal';

// Plain push to the default dataset
await safePushData(item);

// Push + atomic charge for a pay-per-event Actor
const { chargeableWithinLimit } = await safePushData(item, { eventName: 'result-scraped' });

// Push to a named/aliased dataset (no atomic charge available for this case —
// charge separately with Actor.charge() if needed)
await safePushData(item, { alias: 'competitorAnalysis' });
```

Items that fail dataset schema-validation are repaired where possible and
dropped (with a logged error) otherwise, instead of failing the whole push —
see `pushDataWithSchemaRepair`. `apify` and `apify-client` are optional peer
dependencies, needed only if you use this subpath.

Its test suite mocks `apify`/`apify-client` with Vitest's `vi.mock`, and runs
as part of the same `npm test` as everything else.
