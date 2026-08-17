import { Header } from '@/components/Header'
import { HeroDemo } from '@/components/HeroDemo'
import { Footer } from '@/components/Footer'

export default function ExperimentPage() {
  return (
    <>
      <Header showSearch={false} />
      <main>
        <HeroDemo />
      </main>
      <Footer />
    </>
  )
}
