import { nleLinearTimeMapping, type NleMediaItem, type NlePictureLayout, type NleProcess } from "@hypit/nle";
import {
  Component, Composition, Item, Media, SharedValue, Track, Transition, componentItem, defineComposition, jsx, mediaItem,
  projectSourceInstant, projectSourceRange, seconds,
} from "@hypit/nle/authoring";
import {
  addExactTemporalValues as add, compareExactTemporalValues as compare, subtractExactTemporalValues as subtract,
  type ExactTemporalValue as Time,
} from "@hypit/temporal/algebra";
import { groups } from "./broll.js";
import { captionStyle, revealFlash, titleStyle } from "./look.js";
import { speech, type Cue, type Speech, type Take } from "./speech.js";

export const project = { id: "ranking-jensen", name: "Ranking the best person Jensen ever dated", rootComposition: "main" };
const subjects = [
  { take: "wife", label: "My wife", tier: "d" },
  { take: "trump", label: "Trump", tier: "b" },
  { take: "kimberly", label: "Kimberly", tier: "c" },
  { take: "alice", label: "Alice", tier: "a" },
  { take: "jacket", label: "My jacket", tier: "s" },
] as const;
const zero = seconds("0"), frames = (n: number): Time => ({ ticks: String(n), timeBase: { numerator: 1, denominator: 24 } });
const fill: NlePictureLayout = { x: 0, y: 0, width: 720, height: 1280, fit: "fill" };
const asset = (name: string) => ({ path: `media/${name}/${name}.media.json` });
const pictureEffect = (symbol: string) => ({ package: "@hypit/picture-effects", symbol });
const rankingComponent = (symbol: string) => ({ package: "@hypit-example/ranking-football-components", symbol });
const captionComponent = { package: "@hypit/caption-fine", symbol: "fine" };
const audioGain = { package: "@hypit/audio-effects", symbol: "gain" };
const hold = (duration: Time) => nleLinearTimeMapping(duration, zero, { numerator: 0, denominator: 1 });
const captionDocument = "ranking-jensen.caption";
const music = asset("bgm-thank-you"), revealSound = asset("ranking-reveal-sfx");
export const mediaInputs = [...new Set([
  ...subjects.flatMap(({ take }) => [asset(`aroll-${take}`).path, asset(`icon-${take}`).path]),
  ...groups.flatMap(group => group.shots.map(shot => shot.media)), music.path, revealSound.path,
])];

type Inputs = ReadonlyMap<string, { readonly duration?: Time; readonly picture: boolean; readonly audio: boolean }>;
function extent(inputs: Inputs, path: string, signal: "audio" | "picture"): Time {
  const value = inputs.get(path);
  if (!value?.[signal] || value.duration === undefined) throw new Error(`Expected timed ${signal} in ${path}.`);
  return value.duration;
}

function process(id: string, operator: NleProcess["operator"], value: Readonly<Record<string, unknown>>,
  controlTime: NleProcess["controlTime"]): NleProcess {
  return { id, operator, parameters: { kind: "inline", value }, controlTime, enabled: true };
}

function transform(scale = 1, translateY = 0) {
  return { translateX: 0, translateY, scaleX: scale, scaleY: scale, rotationDegrees: 0, originX: 0.5, originY: 0.5 };
}
function filter(opacity: number) {
  return { opacity, blurRadius: 0, brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0 };
}
const treatment = { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
  shadows: [{ offsetX: 0, offsetY: 18, blurPx: 34, spreadPx: -8, color: "#000000D9" }] };
const point = (at: Time, state: Readonly<Record<string, unknown>>) => ({ at, state });
function motion(id: string, duration: Time, style: "pop" | "rise" | "wide" | "edge") {
  const full = nleLinearTimeMapping(duration);
  const entry = frames(style === "rise" ? 7 : 6);
  const exit = subtract(duration, frames(4)), last = subtract(duration, frames(1));
  const edge = (side: "start" | "end", duration: Time) => ({ edge: side, duration, controlDuration: duration });
  const keys = (name: string, symbol: string, interpolation: string, keyframes: readonly ReturnType<typeof point>[],
    control: NleProcess["controlTime"] = full) =>
    process(`${id}-${name}`, pictureEffect(symbol), { kind: "keyframes", keyframes, interpolation: { kind: interpolation } }, control);
  const startPose = style === "pop" ? transform(0.7) : style === "rise" ? transform(0.92, 80) : transform(0.9);
  const frame = process(`${id}-frame`, pictureEffect("frame"), { treatment }, full);
  const enter = keys("entry-transform", "transform", "ease-out", [point(zero, startPose), point(entry, transform())],
    style === "edge" ? edge("start", seconds("1/4")) : full);
  if (style === "edge") return [frame, enter, keys("exit-opacity", "filter", "ease-in",
    [point(zero, filter(1)), point(seconds("1/8"), filter(0))], edge("end", seconds("1/6")))];
  const opacity = keys("entry-opacity", "filter", "ease-out", [point(zero, filter(0)), point(entry, filter(1))]);
  const leave = style === "rise"
    ? keys("exit-transform", "transform", "ease-in", [point(zero, transform()), point(exit, transform()), point(last, transform(0.94))])
    : keys("exit-opacity", "filter", "ease-in", [point(zero, filter(1)), point(exit, filter(1)), point(last, filter(0))]);
  return style === "wide" ? [frame, enter, leave] : [frame, enter, opacity, leave];
}

function caption(take: Take, placement: NleMediaItem, [ordinal, cueStart, cueDuration, words]: Cue) {
  const cueId = `${captionDocument}:cue:${ordinal}`;
  const wordId = (unit: number) => `${captionDocument}:unit:${unit}:word:1`;
  const unitId = (unit: number) => `${captionDocument}:unit:${unit}`;
  const start = seconds(cueStart);
  const range = projectSourceRange({ start, end: add(start, seconds(cueDuration)) }, placement, cueId);
  return componentItem({
    id: `${take}-captions:${cueId}`, at: range.start, duration: subtract(range.end, range.start), component: captionComponent,
    picture: { layout: { ref: "caption-bottom" } }, valueBindings: [{ kind: "shared", slot: "style", ref: "caption-style:nvidia" }],
    parameters: { caption: { cueId, documentId: captionDocument, role: "HOST",
      units: words.map(([id, , , from, to]) => ({ id: unitId(id), wordIds: [wordId(id)], start: seconds(from), end: seconds(to) })),
      words: words.map(([id, text, separatorBefore]) => ({ id: wordId(id), unitId: unitId(id), text, separatorBefore, attributes: [] })),
    } },
  });
}

export default defineComposition((inputs: Inputs) => {
  let end = zero;
  const shots = new Map<Take, NleMediaItem>();
  for (const subject of subjects) {
    const id = `aroll-${subject.take}`;
    const source = asset(id);
    const duration = extent(inputs, source.path, "audio");
    const placement = mediaItem({ id: `${id}-use`, name: `${subject.label} A-roll`, asset: source, at: end, duration,
      picture: { layout: { ...fill, fit: "cover" } }, audio: {} });
    shots.set(subject.take, placement);
    end = add(end, duration);
  }
  const anchor = (take: Take, name: string) => {
    const { anchors }: Speech = speech[take];
    const instant = anchors[name];
    if (instant === undefined) throw new Error(`Jensen take ${take} has no anchor ${name}.`);
    return projectSourceInstant(seconds(instant), shots.get(take)!, `${take}:${name}`);
  };
  const entries = subjects.map(({ take, label, tier }) => {
    const shot = shots.get(take)!;
    return { id: take, label, tier, input: `subject.${take}`, preset: false,
      window: { start: anchor(take, "reveal"), end: add(shot.start, shot.duration) } };
  });
  const allBroll = groups.flatMap((group, groupIndex) => {
    const next = groups[groupIndex + 1];
    const groupEnd = next === undefined ? end : next.take === group.take
      ? anchor(next.take, next.shots[0]!.at) : shots.get(next.take)!.start;
    return group.shots.map((shot, index) => {
      const id = `broll-${group.id}-${shot.id}`;
      const at = anchor(group.take, shot.at);
      const following = group.shots[index + 1];
      const until = group.crossfadeFrames !== undefined && following !== undefined
        ? add(anchor(group.take, following.at), frames(group.crossfadeFrames)) : groupEnd;
      const duration = subtract(until, at);
      const loop = shot.loop === undefined ? undefined : seconds(shot.loop);
      if (loop && compare(loop, extent(inputs, shot.media, "picture")) > 0) throw new Error(`${id}: loop is longer than ${shot.media}.`);
      const sourceTime = loop ? nleLinearTimeMapping(duration, zero, { numerator: 1, denominator: 1 }, { start: zero, end: loop }) : hold(duration);
      return <Media id={id} name={`B-roll ${group.id}.${index + 1} · ${shot.id}`} asset={{ path: shot.media }} at={at}
        duration={duration} sourceTime={sourceTime} picture={{ layout: shot.layout, processes: motion(id, duration, shot.motion) }} />;
    });
  });

  const musicCut = seconds("37.4"), firstMusic = seconds("37.6"), secondMusic = subtract(end, musicCut), musicIn = seconds("49.9");
  const sample = seconds("1/48000");
  const gainPoint = (at: Time, gain: number) => ({ at, gain });
  const envelope = (id: string, duration: Time, keyframes: readonly ReturnType<typeof gainPoint>[]) => ({
    processes: [process(id, audioGain, { kind: "keyframes", keyframes, interpolation: { kind: "linear" } }, nleLinearTimeMapping(duration))],
  });
  if (compare(add(musicIn, secondMusic), extent(inputs, music.path, "audio")) > 0) throw new Error("The music asset cannot cover the second cue.");
  const soundDuration = extent(inputs, revealSound.path, "audio"), flashDuration = frames(9);

  return [
    <SharedValue value={{ id: "caption-style:nvidia", name: "nvidia",
      declaration: { kind: "component", component: captionComponent, slot: "style" }, value: captionStyle }} />,
    <SharedValue value={{ id: "caption-bottom", name: "Caption bottom",
      declaration: { kind: "nle", slot: "picture.layout" }, value: { x: 43, y: 653, width: 634, height: 230, fit: "fill" } }} />,
    <Composition id="main" name={project.name} width={fill.width} height={fill.height}>
      <Track id="performance" name="Jensen A-roll" kind="picture">{[...shots.values()].map(value => <Item value={value} />)}</Track>
      <Track id="music" name="Music bed" kind="audio">
        <Media id="thank-you-instrumental-opening" name="THANK YOU instrumental — opening" asset={music} at={zero} duration={firstMusic}
          audio={envelope("thank-you-opening-envelope", firstMusic,
            [gainPoint(zero, 0.14), gainPoint(musicCut, 0.14), gainPoint(subtract(firstMusic, sample), 0)])} />
        <Media id="thank-you-instrumental-return" name="THANK YOU instrumental — return" asset={music} at={musicCut} duration={secondMusic}
          sourceTime={nleLinearTimeMapping(secondMusic, musicIn)} audio={envelope("thank-you-return-envelope", secondMusic, [
            gainPoint(zero, 0), gainPoint({ ticks: "200000", timeBase: { numerator: 1, denominator: 1_000_000 } }, 0.14),
            gainPoint(subtract(secondMusic, seconds("0.6")), 0.14), gainPoint(subtract(secondMusic, sample), 0),
          ])} />
      </Track>
      <Track id="reveal-sfx" name="Tier reveal sound" kind="audio">
        {entries.map(({ id, label, window }) => <Media id={`${id}-tier-reveal-sfx`} name={`${label} tier reveal`}
          asset={revealSound} at={window.start} duration={soundDuration} audio={{
            processes: [process(`${id}-tier-reveal-gain`, audioGain, { kind: "constant", gain: 0.2 }, nleLinearTimeMapping(soundDuration))],
          }} />)}
      </Track>
      <Track id="ranking" name="Date ranking board" kind="picture">
        <Component id="jensen-date-tier-board" name="Jensen date tier list" at={zero} duration={end}
          component={rankingComponent("tier-board")} media={Object.fromEntries(entries.map(({ id, input }) => [input, asset(`icon-${id}`)]))}
          parameters={{ boardHeightRatio: 0.4, entryMotion: "pop-in-place", rows: [
            { id: "s", label: "S", color: "#ee5f52" }, { id: "a", label: "A", color: "#f0a04c" },
            { id: "b", label: "B", color: "#f0c84d" }, { id: "c", label: "C", color: "#ede356" }, { id: "d", label: "D", color: "#a6da7b" },
          ], entries }} picture={{ layout: fill }} />
      </Track>
      <Track id="broll" name="B-roll groups" kind="picture">{allBroll}</Track>
      <Track id="title" name="Title" kind="picture">
        <Component id="jensen-ranking-title" name={project.name} at={zero} duration={end} sourceTime={hold(end)}
          component={{ package: "@hypit/text-fine", symbol: "fine" }} parameters={titleStyle}
          picture={{ layout: { ...fill, y: 74, height: 94 } }} />
      </Track>
      <Track id="captions" name="Captions" kind="picture">
        {subjects.flatMap(({ take }) => speech[take].cues.map(cue => <Item value={caption(take, shots.get(take)!, cue)} />))}
      </Track>
      <Track id="reveal-flash" name="Tier reveal flash" kind="picture">
        {entries.map(({ id, label, window }) => <Component id={`${id}-tier-reveal-flash`} name={`${label} full-frame reveal flash`}
          at={window.start} duration={flashDuration} component={rankingComponent("reveal-flash")} parameters={revealFlash}
          picture={{ layout: fill }} />)}
      </Track>
      {groups.filter(group => group.crossfadeFrames !== undefined).map(group => <Transition value={{
        id: `broll-${group.id}-crossfade`, outgoing: `broll-${group.id}-${group.shots[0]!.id}`, incoming: `broll-${group.id}-${group.shots[1]!.id}`,
        operator: pictureEffect("transition"), parameters: { kind: "cross-dissolve", easing: "ease-in-out" },
      }} />)}
    </Composition>,
  ];
});
