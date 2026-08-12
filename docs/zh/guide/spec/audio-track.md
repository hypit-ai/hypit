---
title: SVML Audio Track 作者面
description: 通用官方 Audio Track 包的已实现预发布合同，含自描述作者 Surface 与精确采样域 lowering。
---

# SVML Audio Track 作者面

状态：通用官方 Audio Track 包的已实现预发布合同，包含它的自描述作者 Surface、精确的采样域 lowering，以及
本地 / 远端执行见证。它还不是冻结的公开 ABI。

## 目的

`@narratage/audio-track` 让作者把已经选定并归一化的音频素材放入 ProgramSpace。音乐、音效、额外口播和源
音频都是普通的同级项。这个包不拥有任何有特权的基础泳道，Composition 通过既有的
[`AudioTrack`](./track-composition.md) 终端合同来混合它的结果。

这是一个视频领域的作者包，不是 Core 原语、Runtime 服务或 Provider。分工如下：

```text
explicit media source ─> inspect/select/normalize ─> SynchronizedMedia
                                                        │
Narrative points / ProgramSpace ─> temporal window ─────┼─> Audio Track Program
source trim ─> occupancy ─> level/fades ────────────────┘          │
                                                                   ▼
                                                              AudioTrack
                                                                   │
                                                                   ▼
                                                       audio plan -> Provider
```

Core 看到的是固定的图输入和一个输出 Record。它不知道 clip、bus、音乐、语音、循环、淡变或混音。

## 1. 输入的事实

每个音频条目都通过显式的图边获得素材。第一个实现应当消费来自 `@narratage/media` 的 `SynchronizedMedia`，
并要求它归一化后的音频成员：

- 48 kHz；
- 立体声；
- 有符号 16 位 PCM WAV；
- 精确的采样帧数；
- 保留原始电平。

仅仅含有 AAC 的 MP4 不是音频条目。作者图必须显式地检视容器、选择一条音频流并做归一化。同理，一个生成出来
的语音文件不会仅因为里面有人声就变成 `SpeechAudioBasis`。

Audio Track 的 lowerer 可以从归一化后的采样帧数推导终端 Artifact 的时长。它不得把源身份、Narrative 摘要、
provider 名称或其他血缘信息拷贝进 clip。这些关系仍然由图边和 Derivation 承载。

不要仅仅为了缩短一条边就引入新的公开 `AudioMaterial` Type。如果将来确有多个互不相关的包需要一个一等的
规范音频值，那个聚焦的 intrinsic Type 应当放在 `@narratage/media`；它仍然不属于 Core，也不属于某个大杂烩
式的 contracts 包。

## 2. 作者 Program

这个包拥有一个任意长度的独立条目集合。在概念上每个条目具有：

```ts
type AudioItemProgram = {
  readonly id: string;
  readonly source: SynchronizedMediaInput;
  readonly temporal: TemporalBinding;
  readonly trim?: AudioSourceTrim;
  readonly occupancy: AudioOccupancy;
  readonly mix: AudioItemMix;
};
```

这些都是包级别的关注点。它们不是 Core Operation 或终端 `AudioTrack` 合同上的新字段。

示意性的作者 Surface 可以保持紧凑：

```xml
<audio:Track id="mix" space={speech.space}>
  <audio:Clip
    source={music.media}
    during={program}
    playback="loop"
    gain={0.28}
    fade-in="800ms"
    fade-out="1200ms"
  />

  <audio:Clip
    source={impact.media}
    at={story.moment.reveal}
    for="420ms"
    playback="once"
  />
</audio:Track>
```

这种写法只是示意，不是冻结的 Surface。`during`、`at` 和 `for` 必须 lower 到共享的点表达式与窗口投影代数；
它们不能创建第二套时间引擎。

## 3. 时间放置

音频使用与 [`track-authoring.md`](./track-authoring.md) 相同的规则：

1. 定位 Selection、Moment 或 Program 点；
2. 展开 `one` 或 `each` occurrence；
3. 投影出一个有方向的候选窗口；
4. 与 ProgramSpace 求交并校验；
5. 应用音频的源 trim 与 occupancy；
6. 把目标放置与源采样一起 lower 到精确的 48 kHz 采样域。

音频条目相互独立。重叠的投影窗口会混合；它们绝不会按书写顺序被裁剪、被自动拼接、被去重，也不会被当成互斥的
备选方案。多个 Audio Track 值的行为，与一个 Audio Track 里多个重叠条目完全相同。

ProgramSpace 的帧边界由媒体管线已经拥有的那一条确定性规则转换为 48 kHz 采样边界。作者包不得再实现另一条
秒到采样的取整路径。

## 4. 源 trim

源 trim 定义 occupancy 之前的有效固有区间。它是精确归一化采样域内的一个显式起点和可选终点。面向作者的秒或
帧只被量化一次到采样边界。

lowerer 拒绝：

- 负值或越出源范围的边界；
- 不大于起点的终点；
- 空的有效区间；
- 不可用的音频成员；
- 对源时长的第二种包内私有解释。

源 trim 不是目标时间。移动目标窗口绝不会悄悄改变作者声明的是哪一段源区域，除非所选的 occupancy 策略显式地
对它做了对齐或重定时。

## 5. 音频 occupancy

音频有它自己诚实的 occupancy 词汇。它不得复用视觉领域那种“把一个采样永远保持住”的虚构。

```ts
type AudioOccupancy =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | {
      readonly mode: "stretch";
      readonly minRate: number;
      readonly maxRate: number;
      readonly pitch: "preserve";
    };
```

法则如下：

| 策略 | 有效源短于窗口 | 有效源长于窗口 |
|---|---|---|
| `once/start` | 在开头播放，随后静音 | 播放源头部并在窗口结束处截断 |
| `once/end` | 先静音，然后播放到结尾 | 播放源尾部并在窗口结束处结束 |
| `loop/start` | 从源头部相位开始重复 | 播放源头部并截断 |
| `loop/end` | 选择相位使源尾部与窗口结束对齐 | 播放源尾部 |
| `stretch` | 放慢以铺满整个窗口 | 加快以铺满整个窗口 |

`once` 取代了旧的含混的 `native` / `finish` 行为。尾部对齐不是倒放。`loop/end` 改变的是循环相位，它不会反转
采样。`stretch` 保持音高，必须停留在作者声明的速率界限内，并且宁可失败也不会悄悄用更快的速率再截断。旧的
`fit_base` 规则——最多加速 1.1 倍然后把剩下的悄悄切掉——被废弃。

显式的静音由该区间上不存在 clip 来表示。当被填充的静音字节本身有意义时，给文件补静音是一次独立的媒体变换。

## 6. 电平与淡变

第一版作者合同只需要三个正交控制：

- 非负的线性 `gain`；
- 在可听的已渲染区间上生效的 `fadeIn`；
- 在可听的已渲染区间上生效的 `fadeOut`。

零增益就是显式的静音。UI 或 recipe 可以暴露分贝，但换算到终端线性增益是确定性的，并且由包拥有。淡变时长
必须非负，不能超过可听区间，也不能偷偷扩张目标窗口。

不存在任何隐式的响度归一化、限幅器、压缩器、sidechain 闪避、交叉淡变或自动铺底音乐行为。这些都是合理的
未来音频处理或混音 Program，但它们必须消费显式输入，并让自己的行为对作者可见。Runtime 或 Provider 不得把
它们当作环境偏好加进来。

原来的终端 `bus: speech | music | sfx | source` 标签已被移除。它对渲染没有任何影响，因此也不承载任何诚实的
含义。将来的混音路由合同必须有明确的消费者和图行为；仅仅把一个 clip 命名为 `music` 不能导致闪避。

## 7. Lowering 与执行

确定性的作者包把每个实现出来的条目 lower 成一个普通的终端 `AudioClip`：

- 来自时间投影的精确目标 `{ startSample, endSampleExclusive }`；
- 来自归一化输入的规范 WAV Artifact；
- 来自 trim / occupancy 的精确源采样区间、循环相位和播放速率；
- 来自呈现的保持音高意图、线性增益和精确的采样级淡变。

Composition 会针对显式连接的 ProgramSpace 校验 Audio Track。随后媒体管线把所有同级 Audio Track 编译成一份
内容寻址的 `AudioProgramPlan`。本地 FFmpeg、Lambda 或另一个 Provider 执行的是同一份 plan；Provider 的部署
位置不能重新解释这次混音。

即使包内拥有很多 clip，它也只发出一个 `AudioTrack`。那是一个作者组件的输出，不是有特权的泳道。天然同时拥有
一次视觉命中和一次声音命中的包，可以从一个 Fragment 发出同级的 `VisualTrack` 和 `AudioTrack` 输出，而 Film
通过普通的边接收两者。

## 8. 旧系统迁移审计

保留：

- 任意音频输入；
- Program 全长、Selection、Moment 和绝对放置；
- 重叠的音乐 / 音效 / 人声贡献；
- 逐条目的增益与淡变；
- 单次播放、循环，以及有界的保持音高拉伸；
- 显式的源 trim 和起点 / 终点对齐。

废弃：

- 把动态编号端口当作保存下来的作者事实；
- 音频上的 `z_index`；
- 藏在节点执行器里的隐式全长时间；
- 按配置行优先级做的裁剪；
- `fit_base` 及其“先加速再静默截断”的行为；
- 音频的 `fill: freeze`；
- 自动提取视频里恰好含有的任何音频；
- 无实际作用的 bus 标签和隐藏的母带处理。

## 9. 实现与验收

共享的 Temporal 包和冻结前的终端 Audio 候选实现现已完成，且没有引入 Core 分支、Provider 家族分支或有特权的
Film 泳道：

1. **已实现：** 加入 `@narratage/audio-track` 作者包和自描述 Surface；
2. **已实现：** 消费显式归一化的 `SynchronizedMedia` 输入；
3. **已实现：** 采样级精确的 trim 和全部 occupancy 法则；
4. **已实现：** lower 到同级的终端 `AudioTrack`；
5. **已实现：** 针对任意条目数量以及 Selection / Moment 的 `one` / `each` 的图测试；
6. **已实现：** 针对更短 / 相等 / 更长的源、两种对齐、循环、拉伸界限和淡变的采样级测试；
7. **已实现：** 两个重叠条目与两个同级 Audio Track 产出相同的计划混音事实；
8. **已实现：** 本地 FFmpeg 与远端 Lambda Provider 收到完全相同的内容寻址 `AudioProgramPlan`；真实 FFmpeg
   见证还会逐采样检查精确的循环相位。

如果加入这个包需要 Core 分支、Film 音频家族、新队列、SVML 中出现 Provider 名称或一条隐藏的 Base 音频规则，
那么这次迁移就是不完整的。
