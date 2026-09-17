import 'package:flutter/material.dart';

import '../data/formats.dart';
import 'design.dart';

class BriefTemplate {
  const BriefTemplate({
    required this.formatId,
    required this.title,
    required this.subtitle,
    required this.category,
    required this.image,
    required this.prompt,
    this.answers = const {},
    this.durationOverride,
    this.aspectOverride,
  });

  final String formatId;
  final String title;
  final String subtitle;
  final String category;
  final String image;
  final String prompt;
  final Map<String, String> answers;
  final int? durationOverride;
  final String? aspectOverride;

  HypitFormat get format => hypitFormat(formatId);
  String get style => format.title;
  int get duration => durationOverride ?? format.duration;
  String get aspectRatio => aspectOverride ?? format.aspectRatio;
}

const briefTemplates = [
  BriefTemplate(
    formatId: 'talking-head',
    title: 'A little more human.',
    subtitle: 'UGC talking-head',
    category: 'CREATOR',
    image: 'ugc',
    prompt:
        'A creator in a small apartment kitchen talks about Harbor Brew instant oat latte. They used to skip breakfast, show the tin, and make one cup. Warm window light, handheld framing, word-level captions. No health claims.',
    answers: {
      'who': 'A relaxed creator, warm and unpolished, speaking to a phone on the counter.',
      'facts': 'Harbor Brew instant oat latte. One tin. No health or performance claims.',
    },
  ),
  BriefTemplate(
    formatId: 'narration-led',
    title: 'Made to be noticed.',
    subtitle: 'Narration-led product film',
    category: 'PRODUCT',
    image: 'product',
    prompt:
        'A 20-second vertical product film for a botanical skincare serum. Soft directional light, macro textures, amber glass, slow confident movement. Open on an unexpected detail, reveal the bottle, end with an invitation to discover more. Elegant type. No unverified health claims.',
    answers: {
      'picture': 'Amber glass, serum texture, hands, and a quiet bathroom shelf.',
      'proof': 'The bottle, the texture, and the name on the label. No clinical results.',
    },
  ),
  BriefTemplate(
    formatId: 'short-drama',
    title: 'Go somewhere new.',
    subtitle: 'Short cinematic drama',
    category: 'CINEMATIC',
    image: 'cinematic',
    aspectOverride: '16:9',
    durationOverride: 30,
    prompt:
        'A 30-second cinematic travel film about leaving the familiar behind. An open desert road, vast landscapes, golden-hour light, and intimate details. Build from quiet anticipation to a sweeping final shot.',
    answers: {
      'world': 'Desert highway, golden hour, dust in the last light.',
      'payoff': 'The car becomes small in a wide last frame.',
    },
  ),
  BriefTemplate(
    formatId: 'podcast',
    title: 'Two voices. One room.',
    subtitle: 'Two-person podcast',
    category: 'MUSIC',
    image: 'music',
    durationOverride: 30,
    prompt:
        'Two friends at a small table talk about a new ceramic pour-over dripper. Complementary camera views, coffee-shop light, the product stays on the table.',
    answers: {
      'hosts': 'Two friends who cook together. Easy interruptions.',
      'visual': 'Small table, warm practicals, ceramic dripper between them.',
    },
  ),
  BriefTemplate(
    formatId: 'presenter-led',
    title: 'One idea. Every angle.',
    subtitle: 'Presenter-led explainer',
    category: 'MOTION',
    image: 'product',
    aspectOverride: '16:9',
    durationOverride: 30,
    prompt:
        'Explain how a creative idea becomes a finished video in three steps: describe, create, refine. A host plus evolving graphics. Clean dark background, expressive type, one idea per scene, a lime accent. Captions. Generate visuals locally.',
    answers: {
      'host': 'Calm, precise, a little dry.',
      'demo': 'Three graphic stages: brief, timeline, finished frame.',
    },
  ),
  BriefTemplate(
    formatId: 'ranking',
    title: 'The order of things.',
    subtitle: 'Ranking board',
    category: 'EDITORIAL',
    image: 'ugc',
    prompt:
        'Rank three desk lamps for late-night work: a cheap clamp light, a mid-range task lamp, and a nicer brass lamp. Host is dry and slightly mean. Vertical, captions, a persistent ranking board.',
    answers: {
      'items':
          '1. Brass lamp that actually aims. 2. Mid-range task lamp. 3. The clamp light everyone owns.',
      'host': 'Affectionate roast. Knows the subject too well.',
    },
  ),
  BriefTemplate(
    formatId: 'street-interview',
    title: 'Ask a stranger.',
    subtitle: 'Street interview',
    category: 'CREATOR',
    image: 'ugc',
    prompt:
        'A sidewalk interview about the last song that made someone stop walking. Interviewer has a handheld mic. Guest is surprised, then sincere. Land on the song title as a caption.',
    answers: {
      'people': 'A curious interviewer. A slightly startled guest.',
      'reveal': 'The song title, held as a caption.',
    },
  ),
];

class TemplateCard extends StatefulWidget {
  const TemplateCard({
    super.key,
    required this.template,
    required this.onTap,
    this.height = 260,
  });
  final BriefTemplate template;
  final VoidCallback onTap;
  final double height;
  @override
  State<TemplateCard> createState() => _TemplateCardState();
}

class _TemplateCardState extends State<TemplateCard> {
  bool _hovered = false;
  @override
  Widget build(BuildContext context) {
    final t = widget.template;
    final imageName = t.image;
    return Semantics(
      button: true,
      label: 'Use ${t.subtitle} format',
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Material(
            color: StudioColors.surface,
            child: InkWell(
              onTap: widget.onTap,
              child: SizedBox(
                height: widget.height,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AnimatedScale(
                      duration: StudioMotion.of(context, StudioMotion.short),
                      curve: StudioMotion.enter,
                      scale: _hovered ? 1.04 : 1,
                      child: Image.asset(
                        'assets/images/$imageName.jpg',
                        fit: BoxFit.cover,
                        alignment: t.image == 'ugc'
                            ? const Alignment(0, -0.5)
                            : Alignment.center,
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Color(0x22000000),
                            Color(0x11000000),
                            Color(0xE9000000),
                          ],
                          stops: [0, 0.35, 1],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 15,
                      right: 14,
                      child: AnimatedContainer(
                        duration: StudioMotion.of(context, StudioMotion.short),
                        curve: StudioMotion.enter,
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: _hovered
                              ? StudioColors.accent
                              : const Color(0x44000000),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.north_east_rounded,
                          color: _hovered ? Colors.black : Colors.white,
                          size: 16,
                        ),
                      ),
                    ),
                    Positioned(
                      left: 19,
                      right: 16,
                      bottom: 19,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            t.title,
                            style: const TextStyle(
                              fontFamily: 'SpaceGrotesk',
                              color: StudioColors.text,
                              fontSize: 25,
                              height: 1.05,
                              letterSpacing: -0.8,
                            ),
                          ),
                          const SizedBox(height: 9),
                          Text(
                            t.subtitle,
                            style: const TextStyle(
                              color: StudioColors.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
