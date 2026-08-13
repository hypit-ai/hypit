'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSite } from './SiteContext'
import styles from './Hero.module.css'

export function Hero() {
  const { t } = useSite()

  return (
    <section className={styles.hero}>
      <div className={styles.meta}>
        <span className={styles.label}>{t('Open source', '开源项目')}</span>
        <span className="rule tickR" />
      </div>

      <div className={styles.wrap}>
        <Image
          className={`${styles.img} ${styles.land}`}
          src="/hero-landscape.png"
          alt=""
          width={77}
          height={50}
          priority
        />
        <Image
          className={`${styles.img} ${styles.woman}`}
          src="/hero-woman.png"
          alt=""
          width={206}
          height={258}
          priority
        />

        <svg className={styles.wordmark} viewBox="0 0 1200 268" role="img" aria-label="Narratage">
          <text
            x="0"
            y="252"
            fontFamily="Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif"
            fontSize="268"
            textLength="1200"
            lengthAdjust="spacingAndGlyphs"
          >
            <tspan className={styles.wInk}>NARRA</tspan>
            <tspan className={styles.wRed}>TAGE</tspan>
          </text>
        </svg>

        <div className={`rule tickL ${styles.heroRule}`} />

        <p className={styles.tag}>
          {t(
            'A high-level video language for developers.',
            '面向开发者的高层视频语言。'
          )}
        </p>
        <p className={styles.sub}>
          {t('Address with words, not timecodes.', '用词语定位，而不是时间码。')}
        </p>

        <div className={styles.cta}>
          <Link href="/guide/quick-start" className={`${styles.btn} ${styles.solid}`}>
            <span>{t('Get started', '开始使用')}</span>
            <svg className={styles.arw} width="17" height="12" viewBox="0 0 18 13" fill="none" aria-hidden>
              <path
                d="M0 6.5h16M11 1l5.5 5.5L11 12"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <a
            className={`${styles.btn} ${styles.ghost}`}
            href="https://github.com/yw2675/narratage"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('View on GitHub', '在 GitHub 查看')}
          </a>
        </div>
      </div>
    </section>
  )
}
