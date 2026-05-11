# Next.js v14 → v15 Upgrade Guide (Vendored Reference)

This is a vendored snapshot of the key v14→v15 breaking changes and migration steps.

---

## 1. Package Version

Update `next` in `package.json`:

```bash
npm install next@15 react@19 react-dom@19
```

If you cannot run npm, manually update the version field:
```json
"next": "^15.0.0"
```

---

## 2. Async Request APIs (BREAKING)

In v15, the following APIs are **asynchronous** and must be awaited. Previously they were synchronous.

### `cookies()` and `headers()`

```tsx
// v14 (synchronous — now broken in v15)
import { cookies, headers } from 'next/headers'
const cookieStore = cookies()
const headersList = headers()

// v15 (async — must await)
import { cookies, headers } from 'next/headers'
const cookieStore = await cookies()
const headersList = await headers()
```

### `params` and `searchParams` in Page/Layout components

```tsx
// v14 (synchronous — now broken in v15)
export default function Page({ params }: { params: { id: string } }) {
  const id = params.id
  return <div>{id}</div>
}

// v15 (async — must await)
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <div>{id}</div>
}
```

Same pattern applies to `searchParams`:

```tsx
// v14
export default function Page({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q
}

// v15
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
}
```

### Automated codemod

The official codemod handles most async-request-api changes:

```bash
npx @next/codemod@canary next-async-request-api .
```

Or use the upgrade CLI (runs multiple codemods):

```bash
npx @next/codemod@canary upgrade
```

---

## 3. `draftMode()` is now async

```tsx
// v14
import { draftMode } from 'next/headers'
const { isEnabled } = draftMode()

// v15
import { draftMode } from 'next/headers'
const { isEnabled } = await draftMode()
```

---

## 4. Fetch Caching Changes

In v15, `fetch()` requests are **no longer cached by default**.

```tsx
// v14: cached by default (equivalent to cache: 'force-cache')
const res = await fetch('https://api.example.com/data')

// v15: NOT cached by default (equivalent to cache: 'no-store')
// To opt in to caching:
const res = await fetch('https://api.example.com/data', { cache: 'force-cache' })
```

---

## 5. TypeScript: Updated `PageProps` and `LayoutProps`

With async params/searchParams, TypeScript types change:

```tsx
// v14
type Props = {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

// v15
type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}
```

---

## 6. Viewport Metadata (if not yet updated from v13)

If you are still using `viewport` inside the `metadata` export, move it to a separate `viewport` export:

```tsx
// Deprecated in v13.4, removed in v15
export const metadata: Metadata = {
  title: 'My App',
  viewport: { width: 'device-width', initialScale: 1 },
}

// v15-compatible
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'My App',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}
```

---

## Summary Checklist

- [ ] Update `next` package to v15 in `package.json`
- [ ] Await `cookies()` and `headers()` in all Server Components, Route Handlers, Middleware
- [ ] Make `params` a `Promise<{...}>` and `await params` in pages/layouts
- [ ] Make `searchParams` a `Promise<{...}>` and `await searchParams` in pages
- [ ] Await `draftMode()` if used
- [ ] Review any `fetch()` calls that relied on default caching
- [ ] Move `viewport` out of `metadata` export if present
- [ ] Run `npm run build` to surface remaining type errors
