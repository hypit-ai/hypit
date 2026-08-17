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

        <p className={styles.tag}>
          {t(
            'A language and system for AI agents to create video.',
            '一套让 AI agent 创作视频的语言与系统。'
          )}
        </p>
        <p className={styles.sub}>
          {t('Built to kill Adobe.', '为终结 Adobe 而生。')}
        </p>

        <div className={styles.cta}>
          <Link href="/guide/quick-start" className={`${styles.btn} ${styles.solid}`}>
            <span>{t('Get started', '开始使用')}</span>
            <svg className={styles.arw} width="15" height="11" viewBox="0 0 18 13" fill="none" aria-hidden>
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
            href="https://github.com/hypit-ai/narratage"
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
