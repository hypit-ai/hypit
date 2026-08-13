'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { Timeline } from '@/components/Timeline'
import { useSite } from '@/components/SiteContext'
import styles from './page.module.css'

/* The page reads its own computed tokens, so a value shown here can never
   drift from what globals.css actually defines. */
function useTokenValue(token: string) {
  const [value, setValue] = useState('')
  useEffect(() => {
    const read = () =>
      setValue(getComputedStyle(document.documentElement).getPropertyValue(token).trim())
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', read)
    return () => {
      observer.disconnect()
      query.removeEventListener('change', read)
    }
  }, [token])
  return value
}

function Swatch({ token, use }: { token: string; use: string }) {
  const value = useTokenValue(token)
  return (
    <div className={styles.swatch}>
      <span className={styles.chip} style={{ background: `var(${token})` }} />
      <code className={styles.swatchToken}>{token}</code>
      <code className={styles.swatchValue}>{value || '—'}</code>
      <span className={styles.swatchUse}>{use}</span>
    </div>
  )
}

const SECTIONS = [
  { id: 'colour', en: 'Colour', zh: '色彩' },
  { id: 'type', en: 'Typography', zh: '字体' },
  { id: 'space', en: 'Space & layout', zh: '间距与布局' },
  { id: 'line', en: 'Line & surface', zh: '线条与面' },
  { id: 'controls', en: 'Controls', zh: '控件' },
  { id: 'code', en: 'Code', zh: '代码' },
  { id: 'timeline', en: 'Timeline', zh: '时间轴' },
  { id: 'motion', en: 'Motion & focus', zh: '动效与焦点' },
]

export default function DesignSystem() {
  const { t, lang } = useSite()
  const label = (en: string, zh: string) => (lang === 'en' ? en : zh)

  return (
    <>
      <Header />
      <main className={styles.page}>
        <header className={styles.masthead}>
          <div className="rule" />
          <h1 className={styles.title}>{t('Design system', '设计系统')}</h1>
          <p className={styles.lede}>
            {t(
              'Every value below is read live from the running stylesheet, so this page cannot drift from the code. Switch the theme in the header to see both palettes resolve.',
              '下列每个数值都从运行中的样式表实时读取，因此本页不会与代码脱节。用页首的开关切换主题，可看到两套色板各自解析。',
            )}
          </p>
        </header>

        <nav className={styles.jump} aria-label={t('Sections', '章节')}>
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {label(section.en, section.zh)}
            </a>
          ))}
        </nav>

        {/* ---------------------------------------------------------- colour */}
        <section id="colour" className={styles.section}>
          <h2 className={styles.h2}>{t('Colour', '色彩')}</h2>
          <p className={styles.note}>
            {t(
              'Eight tokens carry the whole interface. Crimson is the only accent — it marks the current item, the focus ring and every interactive hover, and nothing else competes with it.',
              '整个界面由八个 token 支撑。Crimson 是唯一的强调色——用于当前项、焦点环与所有交互悬停，不设第二个强调色与之竞争。',
            )}
          </p>

          <div className={styles.swatches}>
            <Swatch token="--paper" use={t('Page ground', '页面底色')} />
            <Swatch token="--paper-2" use={t('Raised panels, code, cards', '面板、代码块、卡片')} />
            <Swatch token="--ink" use={t('Body text, headings', '正文与标题')} />
            <Swatch token="--muted" use={t('Secondary text, labels', '次要文字、标签')} />
            <Swatch token="--crimson" use={t('Accent: active, focus, hover', '强调：激活、焦点、悬停')} />
            <Swatch token="--crimson-soft" use={t('Accent fills at 10–13% alpha', '强调色填充，10–13% 透明度')} />
            <Swatch token="--rule" use={t('Dividers, borders', '分隔线、边框')} />
            <Swatch token="--rule-soft" use={t('Quieter rails and hairlines', '更弱的轨线与发丝线')} />
          </div>

          <h3 className={styles.h3}>{t('Terminal', '终端')}</h3>
          <p className={styles.note}>
            {t(
              'The terminal keeps its own ground in both themes: a command block should read as a different surface from the page, not as a lighter card.',
              '终端在两种主题下都保持自己的底色：命令块应当读作与页面不同的介质，而不是一张更浅的卡片。',
            )}
          </p>
          <div className={styles.swatches}>
            <Swatch token="--term-bg" use={t('Terminal ground', '终端底色')} />
            <Swatch token="--term-ink" use={t('Terminal text', '终端文字')} />
            <Swatch token="--term-flag" use={t('Flags and arguments', '参数与标志')} />
          </div>

          <h3 className={styles.h3}>{t('Track hues', '轨道色相')}</h3>
          <p className={styles.note}>
            {t(
              'Demos and timelines need to tell four track kinds apart. These sit outside the token set because they encode data, not interface state — they are chosen to stay distinguishable on paper without turning into a rainbow.',
              'Demo 与时间轴需要区分四类轨道。这几个色值不在 token 集合内，因为它们编码的是数据而非界面状态——取值以在纸感底色上可区分为准，同时避免变成彩虹。',
            )}
          </p>
          <div className={styles.trackHues}>
            <span className={styles.hue} style={{ '--h': 'var(--crimson)' } as React.CSSProperties}>
              {t('Speech', '口播')}
            </span>
            <span className={styles.hue} style={{ '--h': '#8a6d1f' } as React.CSSProperties}>
              B-roll
            </span>
            <span className={styles.hue} style={{ '--h': '#3f6d55' } as React.CSSProperties}>
              {t('Captions', '字幕')}
            </span>
            <span className={styles.hue} style={{ '--h': '#6b6280' } as React.CSSProperties}>
              {t('Audio', '音频')}
            </span>
          </div>
        </section>

        {/* ------------------------------------------------------------ type */}
        <section id="type" className={styles.section}>
          <h2 className={styles.h2}>{t('Typography', '字体')}</h2>
          <p className={styles.note}>
            {t(
              'One family throughout: the system monospace stack. It is the identity, not a fallback — a language about addressing video with words deserves a face that looks like source. Ligatures are off so operators read as typed.',
              '全站只用一种字族：系统等宽字体栈。这是识别特征而非降级方案——一门用词语定位视频的语言，理应用看起来像源码的字体。连字已关闭，使运算符保持键入时的样子。',
            )}
          </p>

          <div className={styles.typeScale}>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>clamp(28px, 3.4vw, 40px) · 700</span>
              <span className={styles.typeH1}>Address with words</span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>clamp(19px, 2.2vw, 24px) · 700</span>
              <span className={styles.typeH2}>Selections and Moments</span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>clamp(15px, 1.6vw, 17px) · 700</span>
              <span className={styles.typeH3}>Role cues</span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>14px · 1.65</span>
              <span className={styles.typeBody}>
                {t(
                  'Body copy runs at the browser default line height of 1.65 and holds to roughly 82 characters at most.',
                  '正文行高 1.65，单行最多约 82 个字符。',
                )}
              </span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>13px · 1.85</span>
              <span className={styles.typeProse}>
                {t(
                  'Documentation prose sits slightly smaller and looser, because a long page of monospace needs more leading than an interface does.',
                  '文档正文略小、行距更松，因为整页等宽字比界面文字需要更多行距。',
                )}
              </span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>12.5px</span>
              <span className={styles.typeCode}>&lt;MARA&gt; @beat At 2:13 A.M. @/beat</span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>11px · 0.16em · uppercase</span>
              <span className={styles.typeLabel}>Get started</span>
            </div>
            <div className={styles.typeRow}>
              <span className={styles.typeSpec}>10.5px</span>
              <span className={styles.typeMeta}>{t('Captions and metadata', '说明与元信息')}</span>
            </div>
          </div>

          <p className={styles.note}>
            {t(
              'Headings carry negative tracking to close the gaps monospace leaves; the h1 also takes a −0.055em text-indent, because a monospace glyph’s left side bearing otherwise makes large text look inset from the column edge.',
              '标题使用负字距以收紧等宽字留下的空隙；h1 另设 −0.055em 的负缩进，否则等宽字形的左侧边距会让大字看起来从栏边内缩。',
            )}
          </p>
        </section>

        {/* ----------------------------------------------------------- space */}
        <section id="space" className={styles.section}>
          <h2 className={styles.h2}>{t('Space & layout', '间距与布局')}</h2>

          <div className={styles.specTable}>
            <div className={styles.specRow}>
              <code>--pad</code>
              <code>clamp(20px, 4vw, 56px)</code>
              <span>{t('Page gutter, fluid across breakpoints', '页面边距，随断点流动')}</span>
            </div>
            <div className={styles.specRow}>
              <code>--nav-h</code>
              <code>74px</code>
              <span>{t('Header height; anchors offset by it', '页首高度；锚点按此偏移')}</span>
            </div>
            <div className={styles.specRow}>
              <code>{t('Docs grid', '文档栅格')}</code>
              <code>21% · 1fr · 20%</code>
              <span>{t('Sidebar, prose, table of contents', '侧栏、正文、目录')}</span>
            </div>
            <div className={styles.specRow}>
              <code>{t('Prose measure', '正文行宽')}</code>
              <code>min(100%, 82ch)</code>
              <span>{t('Fills the column, capped for reading', '撑满栏宽，上限保证可读')}</span>
            </div>
          </div>

          <p className={styles.note}>
            {t(
              'Sibling groups are laid out with flex or grid and gap, never with per-element margins — collapsing margins are the usual source of spacing that looks right in one place and doubles in another.',
              '同级元素使用 flex 或 grid 加 gap 排布，不用逐元素 margin——外边距塌陷是「一处正常、另一处翻倍」这类间距问题的常见来源。',
            )}
          </p>
        </section>

        {/* ------------------------------------------------------------ line */}
        <section id="line" className={styles.section}>
          <h2 className={styles.h2}>{t('Line & surface', '线条与面')}</h2>
          <p className={styles.note}>
            {t(
              'The hairline rule carries alignment ticks at both ends, like a measuring mark on paper. It opens major sections.',
              '发丝线两端带对准刻度，如同纸上的测量标记。它用于开启主要章节。',
            )}
          </p>

          <div className={styles.ruleDemo}>
            <div className="rule" />
            <code className={styles.ruleCode}>.rule</code>
            <div className="rule tickR" />
            <code className={styles.ruleCode}>.rule.tickR</code>
          </div>

          <h3 className={styles.h3}>{t('Rails', '轨线')}</h3>
          <p className={styles.note}>
            {t(
              'Navigation lists run a continuous 2px rail in --rule-soft; the current item repaints its own segment in crimson. The line is one object with a lit segment, not a set of separate marks.',
              '导航列表内嵌一条 2px 的连续轨线（--rule-soft），当前项在同一位置以 crimson 重绘自己那一段。这是一条带高亮段的线，而非若干独立标记。',
            )}
          </p>
          <ul className={styles.railDemo}>
            <li>
              <span>Overview</span>
            </li>
            <li data-current="">
              <span>Script</span>
            </li>
            <li>
              <span>SVS stylesheet</span>
            </li>
          </ul>

          <h3 className={styles.h3}>{t('Grain', '纸纹')}</h3>
          <p className={styles.note}>
            {t(
              'A fixed fractal-noise layer sits over the whole page — multiply at 42% in light, overlay at 22% in dark. It is what keeps a flat cream from reading as flat.',
              '整页覆盖一层固定的分形噪点——浅色下 multiply 42%，深色下 overlay 22%。正是它让一片平铺的米色不显得死板。',
            )}
          </p>
        </section>

        {/* -------------------------------------------------------- controls */}
        <section id="controls" className={styles.section}>
          <h2 className={styles.h2}>{t('Controls', '控件')}</h2>

          <h3 className={styles.h3}>{t('Links', '链接')}</h3>
          <div className={styles.row}>
            <a className={styles.navLink} href="#controls">
              {t('Nav link', '导航链接')}
            </a>
            <a className={styles.navLink} href="#controls" aria-current="page">
              {t('Current', '当前项')}
            </a>
            <a className={styles.proseLink} href="#controls">
              {t('Prose link', '正文链接')}
            </a>
            <span className={styles.pending}>{t('Not linked yet', '尚未接入')}</span>
          </div>
          <p className={styles.note}>
            {t(
              'Nav links grow an underline from the left on hover. An entry with no destination yet is dimmed and drops the underline — it should not invite a click it cannot answer.',
              '导航链接在悬停时从左侧长出下划线。尚无目标的条目会调暗并取消下划线——它不应邀请一次无法回应的点击。',
            )}
          </p>

          <h3 className={styles.h3}>{t('Buttons', '按钮')}</h3>
          <div className={styles.row}>
            <button type="button" className={styles.btn}>
              {t('Icon button', '图标按钮')}
            </button>
            <button type="button" className={styles.btnRound} aria-label={t('Play', '播放')}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 1l9 5-9 5z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" className={styles.btnGhost}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {t('Copy', '复制')}
            </button>
          </div>

          <h3 className={styles.h3}>{t('Cards', '卡片')}</h3>
          <div className={styles.cards}>
            <a className={styles.card} href="#controls">
              <span className={styles.cardTitle}>{t('Run source & build', 'Run Source 与 Build')}</span>
              <span className={styles.cardMeta}>‹ {t('Previous', '上一页')}</span>
            </a>
            <a className={`${styles.card} ${styles.cardNext}`} href="#controls">
              <span className={styles.cardTitle}>{t('Package architecture', '包架构')}</span>
              <span className={styles.cardMeta}>{t('Next', '下一页')} ›</span>
            </a>
          </div>
        </section>

        {/* ------------------------------------------------------------ code */}
        <section id="code" className={styles.section}>
          <h2 className={styles.h2}>{t('Code', '代码')}</h2>
          <p className={styles.note}>
            {t(
              'Inline code is tinted rather than boxed, so it does not punch holes in a paragraph. Blocks sit on --paper-2 with a hairline border and reveal a copy button on hover.',
              '行内代码用底色着色而非加框，以免在段落中打洞。代码块置于 --paper-2 上并加发丝边框，悬停时显现复制按钮。',
            )}
          </p>

          <p className={styles.proseSample}>
            {t('A Selection covers the words between ', '一个 Selection 覆盖 ')}
            <code className={styles.inlineCode}>@mystery</code>
            {t(' and ', ' 与 ')}
            <code className={styles.inlineCode}>@/mystery</code>
            {t('.', ' 之间的词。')}
          </p>

          <div className={styles.codeBlock}>
            <pre>
              <code>
                {'<script id="story">\n'}
                {'  <opening>\n'}
                {'    <MARA> '}
                <span className={styles.marker}>@mystery</span>
                {' Every billboard told the same story. '}
                <span className={styles.marker}>@/mystery</span>
                {'\n  </opening>\n'}
                {'</script>'}
              </code>
            </pre>
          </div>
          <p className={styles.note}>
            {t(
              'Semantic markers get their own treatment on top of syntax highlighting: crimson on a soft fill, bold. They are the one thing a reader must be able to find at a glance.',
              '语义标记在语法高亮之上另有处理：crimson 配柔和填充，加粗。它们是读者必须一眼找到的东西。',
            )}
          </p>

          <div className={styles.terminal}>
            <pre>
              <code>
                {'node --run narratage -- check main.svml '}
                <span className={styles.flag}>--package-lock</span>
                {' svml.packages.lock'}
              </code>
            </pre>
          </div>
        </section>

        {/* -------------------------------------------------------- timeline */}
        <section id="timeline" className={styles.section}>
          <h2 className={styles.h2}>{t('Timeline', '时间轴')}</h2>
          <p className={styles.note}>
            {t(
              'The multi-track timeline is the system applied to data: four track hues, the crimson playhead, tabular figures on the ruler. Its clips are read from a real demo’s timing, not mocked.',
              '多轨时间轴是这套系统在数据上的应用：四种轨道色相、crimson 播放头、刻度尺使用表格数字。其片段读自真实 demo 的时间数据，而非模拟。',
            )}
          </p>
          <Timeline />
        </section>

        {/* ---------------------------------------------------------- motion */}
        <section id="motion" className={styles.section}>
          <h2 className={styles.h2}>{t('Motion & focus', '动效与焦点')}</h2>

          <div className={styles.specTable}>
            <div className={styles.specRow}>
              <code>0.16s ease</code>
              <code>{t('Colour, border', '颜色、边框')}</code>
              <span>{t('Hover feedback on controls', '控件悬停反馈')}</span>
            </div>
            <div className={styles.specRow}>
              <code>0.22s ease</code>
              <code>{t('Underline, segment fill', '下划线、区段填充')}</code>
              <span>{t('State changes that travel a distance', '需要位移的状态变化')}</span>
            </div>
            <div className={styles.specRow}>
              <code>0.5s cubic-bezier(.3,.8,.35,1)</code>
              <code>transform</code>
              <span>{t('Carousel travel', '轮播位移')}</span>
            </div>
            <div className={styles.specRow}>
              <code>{t('Focus ring', '焦点环')}</code>
              <code>2px --crimson · 3px offset</code>
              <span>{t('Never removed, only shaped', '从不移除，只作造型')}</span>
            </div>
          </div>

          <p className={styles.note}>
            {t(
              'Animation earns its place or it is cut. Under prefers-reduced-motion the carousel drops its transition and smooth scrolling turns off — no motion is left running that a reader asked not to see.',
              '动效要么有理由存在，要么删掉。在 prefers-reduced-motion 下，轮播取消过渡、平滑滚动关闭——不保留任何读者已表示不愿看到的运动。',
            )}
          </p>

          <p className={styles.note}>
            {t(
              'Animation loops that run every frame — the demos, this timeline — keep their state in refs and write to element style directly. Sixty state updates a second would stall React, so per-frame values never become state.',
              '逐帧运行的动画循环——各个 demo 与本时间轴——将状态保存在 ref 中并直接写入元素样式。每秒六十次状态更新会拖垮 React，因此逐帧数值绝不进入 state。',
            )}
          </p>
        </section>
      </main>
    </>
  )
}
