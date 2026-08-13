'use client'

import Link from 'next/link'
import { useSite } from './SiteContext'
import styles from './Footer.module.css'

export function Footer() {
  const { t } = useSite()

  return (
    <footer className={styles.footer} id="foot">
      <div className={styles.grid}>
        <div className={styles.col}>
          <h4>{t('Docs', '文档')}</h4>
          <ul>
            <li><Link href="/guide/quick-start">{t('Quick start', '快速开始')}</Link></li>
            <li><Link href="/guide/develop">{t('Develop', '开发')}</Link></li>
            {/* Listed but not linked yet — no Playground page exists. */}
            <li><span className={styles.pending}>{t('Playground', 'Playground')}</span></li>
          </ul>
        </div>

        <div className={styles.col}>
          <h4>{t('Project', '项目')}</h4>
          <ul>
            <li><a href="https://github.com/yw2675/narratage" target="_blank" rel="noopener noreferrer">{t('Repository', '代码仓库')}</a></li>
            <li><a href="https://github.com/yw2675/narratage/releases" target="_blank" rel="noopener noreferrer">{t('Changelog', '更新日志')}</a></li>
            <li><a href="https://github.com/yw2675/narratage/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">{t('Licence', '开源协议')}</a></li>
          </ul>
        </div>

        <div className={styles.col}>
          <h4>{t('Community', '社区')}</h4>
          <ul>
            <li><a href="https://discord.gg/cWQ92BaKV" target="_blank" rel="noopener noreferrer">Discord</a></li>
            <li><a href="https://github.com/yw2675/narratage/discussions" target="_blank" rel="noopener noreferrer">{t('Discussions', '讨论区')}</a></li>
          </ul>
        </div>

        <div className={`${styles.col} ${styles.about}`}>
          <h4>Narratage</h4>
          <p>
            {t(
              'A high-level video language for developers. Address with words, not timecodes.',
              '面向开发者的高层视频语言。用词语定位，而不是时间码。'
            )}
          </p>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>
          <a
            href="https://github.com/yw2675/narratage/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Apache-2.0 with conditions', 'Apache-2.0 附加条款')}
          </a>
        </span>
        <span>
          {t(
            'Built with ffmpeg. Not affiliated with the ffmpeg project.',
            '基于 ffmpeg 构建，与 ffmpeg 项目无隶属关系。'
          )}
        </span>
      </div>
    </footer>
  )
}
