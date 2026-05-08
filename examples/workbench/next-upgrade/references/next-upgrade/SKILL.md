# Upgrade Next.js - SKILL.md

**Name:** next-upgrade
**Description:** Upgrade Next.js to the latest version following official migration guides and codemods
**Argument Hint:** [target-version]

## Overview

This skill guides you through upgrading Next.js to the latest version by following official documentation and automated tools.

## Key Steps

1. **Identify Current Setup**: Examine `package.json` to determine your existing Next.js version and related dependencies like React and React DOM.

2. **Access Upgrade Documentation**: Read the vendored upgrade guide at `/work/references/next-upgrade/upgrade-guide.md`, which contains version-specific migration paths and codemod information for v14, v15, and v16 upgrades.

3. **Plan Migration Strategy**: For significant version jumps, perform incremental upgrades rather than jumping multiple versions at once.

4. **Apply Automated Transforms**: Use Next.js codemods to handle breaking changes automatically:
   - "Updates async Request APIs (v15)"
   - "Migrates geo/ip properties (v15)"
   - "Transforms dynamic imports (v15)"

5. **Install Updates**: Upgrade Next.js alongside peer dependencies using npm.

6. **Manual Review**: Consult upgrade guides for changes requiring manual intervention, covering APIs, configuration files, and removed features.

7. **Update Type Definitions**: Install latest TypeScript type packages if your project uses TypeScript.

8. **Validate Changes**: Run build and dev commands to verify functionality works correctly post-upgrade.

---

## v14 → v15 Breaking Changes: What to Look For

When reviewing code for v14→v15 migration, read each source file and check for
these **specific patterns**. These are the most-missed issues in manual reviews.

### `params` and `searchParams` are now async (v15 breaking change)

The most commonly overlooked change. **Read every Page and Layout component**
and check the prop type declaration, not just the usage.

```tsx
// BAD — v14 style, breaks in v15 with TypeScript errors and runtime warnings
export default async function Page({
  params,
}: {
  params: { id: string }         // ← WRONG: not a Promise
}) {
  const id = params.id           // ← WRONG: accessing directly without await
  return <div>{id}</div>
}

// GOOD — v15 style
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>  // ← Promise<> wrapper required
}) {
  const { id } = await params       // ← must await before accessing
  return <div>{id}</div>
}
```

Same pattern applies to `searchParams`:

```tsx
// BAD — v14 style
export default async function Page({
  searchParams,
}: {
  searchParams: { q?: string }        // ← WRONG
}) {
  const query = searchParams.q        // ← WRONG

// GOOD — v15 style
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>  // ← Promise<> wrapper required
}) {
  const { q } = await searchParams       // ← must await
```

### `cookies()` and `headers()` are now async (v15 breaking change)

```tsx
// BAD
const cookieStore = cookies()    // ← WRONG: synchronous
const headersList = headers()    // ← WRONG: synchronous

// GOOD
const cookieStore = await cookies()    // ← await required
const headersList = await headers()    // ← await required
```

### `viewport` must be a separate export (removed from `metadata`)

```tsx
// BAD
export const metadata: Metadata = {
  title: 'My App',
  viewport: { width: 'device-width' },  // ← WRONG: viewport inside metadata
}

// GOOD
export const metadata: Metadata = { title: 'My App' }
export const viewport: Viewport = { width: 'device-width' }  // ← separate export
```

### `package.json` version

Update `next` to `^15.0.0` and `react`/`react-dom` to `^19.0.0`.
