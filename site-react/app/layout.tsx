import type { Metadata } from 'next'
import { SiteProvider } from '@/components/SiteContext'
import { SearchProvider } from '@/components/SearchProvider'
import { getSearchIndex } from '@/lib/search-index'
import './globals.css'

export const metadata: Metadata = {
  title: 'Narratage',
  description: 'A language and system for AI agents to create video. Built to kill Adobe.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Built here, at build time; the client receives it as a serialised prop.
  const searchIndex = getSearchIndex()

  return (
    <html lang="en">
      <body>
        <SiteProvider>
          <SearchProvider index={searchIndex}>{children}</SearchProvider>
        </SiteProvider>
      </body>
    </html>
  )
}
