'use client'

import Image from 'next/image'

// BUG: Client components cannot be async — only Server Components can be async
export default async function HeroSection({ bannerUrl }: { bannerUrl: string }) {
  const config = await fetchHeroConfig()  // invalid: cannot await in client component

  return (
    <section className="hero">
      {/* BUG: <Image fill> without a sizes prop downloads the largest image regardless of viewport */}
      <Image
        src={bannerUrl}
        alt="Hero banner"
        fill
      />
      {/* BUG: Missing priority prop — this is above-the-fold LCP image, priority is required */}
      <Image
        src="/logo.png"
        alt="Logo"
        width={200}
        height={80}
      />
      {/* BUG: native <script> tag — should use next/script for loading strategy and optimization */}
      <script src="https://analytics.example.com/tracker.js"></script>
      <h1>{config.title}</h1>
    </section>
  )
}
