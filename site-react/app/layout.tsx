import type { Metadata } from 'next'
import { SiteProvider } from '@/components/SiteContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Narratage',
  description: 'A high-level video language for developers. Address with words, not timecodes.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteProvider>{children}</SiteProvider>
      </body>
    </html>
  )
}
