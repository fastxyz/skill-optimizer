import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My App',
  description: 'A sample Next.js application',
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
}

export default async function Home({
  searchParams,
}: {
  searchParams: { query?: string; page?: string }
}) {
  const query = searchParams.query ?? ''
  const page = searchParams.page ?? '1'

  return (
    <main>
      <h1>Search Results</h1>
      <p>Query: {query}</p>
      <p>Page: {page}</p>
    </main>
  )
}
