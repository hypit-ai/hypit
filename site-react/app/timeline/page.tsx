'use client'

import { Header } from '@/components/Header'
import { Timeline } from '@/components/Timeline'

export default function TimelinePage() {
  return (
    <>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px var(--pad) 96px' }}>
        <Timeline />
      </main>
    </>
  )
}
