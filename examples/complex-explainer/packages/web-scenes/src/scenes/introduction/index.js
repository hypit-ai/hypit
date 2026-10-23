import { intro_styles } from "./styles.js";
import { intro_animation } from "./animation.js";
import { scene } from "../../shared/scene.js";
import { requireBeats } from "../../shared/beats.js";
export function renderIntro(t, c, w, font, o, events, m) {
  requireBeats(events, [
    "language",
    "install",
    "codex",
    "claude",
    "thirty",
    "examples",
    "face",
    "product",
  ]);
  const b = Object.fromEntries(events.map((e) => [e.name, e.at.frame - w.span.startFrame])),
    count = w.span.endFrameExclusive - w.span.startFrame;
  const video = (media, start, end) => ({
    media,
    start,
    end: Math.min(count, end + 12),
    backdrop: {},
  });
  const entries = {
    page: video(m.page, 0, b.language),
    code: video(m.code, b.language, b.install),
    readme: video(m.readme, b.install, b.thirty),
    codex: { image: m.codex },
    claude: { image: m.claude },
  };
  for (const [n, i] of [
    ["ranking", 0],
    ["podcast", 1],
    ["interview", 2],
  ]) {
    entries["ref-" + n] = video(m["reference-" + n], b.examples, count);
    entries["own-" + n] = video(m["hypit-" + n], b.face, count);
    entries["ref-" + n].backdrop = n === "interview" ? {} : false;
    entries["own-" + n].backdrop = n === "interview" ? {} : false;
    if (n === "interview") entries["ref-" + n].end = b.face + 18;
  }
  const cards = ["ranking", "podcast", "interview"]
    .map(
      (n, i) =>
        `<div class="card card-${i}"><div class="original">{{ref-${n}}}</div><div class="target">{{own-${n}}}</div><div class="swap-sweep"></div></div>`,
    )
    .join("");
  const terminal = `
<time:Timeline id="program" clock="{clock}" end="host.end">
  <time:Window id="host" from="start" for="{host.extent}" />
</time:Timeline>

<visual:Track timeline="{program.timeline}">
  <visual:Clip id="host" media="{host.media}" during="{program.host}"
    frame="{portrait.frame}" fit="cover" />
</visual:Track>

<ranking:Board timeline="{program.timeline}">
  <ranking:Reveal at="{story.moment.first}" image="{product}" tier="S" />
</ranking:Board>

<caption:Track timeline="{program.timeline}" document="{story.caption}">
  <caption:Use style="{headline}" />
</caption:Track>

<film:Film timeline="{program.timeline}">
  <film:Track id="presenter" source="{presenter.visual}" />
  <film:Track id="board" source="{board.visual}" />
</film:Film>`;
  return scene(
    t,
    c,
    w,
    font,
    o,
    `
<div class="mesh"></div><div class="heading"><b>Hypit</b><small>开源视频复刻框架</small></div
><div class="stage"
  ><div class="phase" data-p="0"><div class="screen">{{page}}</div></div
  ><div class="phase" data-p="1"><div class="screen">{{code}}</div></div
  ><div class="phase" data-p="2"
    ><div class="screen">{{readme}}</div><div class="app app-codex">{{codex}}</div
    ><div class="app app-claude">{{claude}}</div></div
  ><div class="phase terminal" data-p="3"
    ><div class="terminal-bar"><i></i><i></i><i></i><span>main.svml</span></div
    ><pre></pre><div class="cursor"></div></div
  ><div class="phase gallery" data-p="4">${cards}</div></div
>`,
    intro_styles,
    intro_animation,
    events,
    entries,
    { terminal },
  );
}
