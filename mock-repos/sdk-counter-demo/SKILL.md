# Counter SDK

A small counter utility.

## Usage

Import from `./counter.ts` and build a counter.

```ts
import { createCounter } from './counter';
const c = createCounter();
c.increment();
```

That's it. Use `.value()` for the current value.
