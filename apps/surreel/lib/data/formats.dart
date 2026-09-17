import 'package:flutter/foundation.dart';

@immutable
class GuidedField {
  const GuidedField({
    required this.id,
    required this.label,
    required this.hint,
    this.required = false,
    this.maxLines = 3,
  });

  final String id;
  final String label;
  final String hint;
  final bool required;
  final int maxLines;
}

@immutable
class HypitFormat {
  const HypitFormat({
    required this.id,
    required this.title,
    required this.chip,
    required this.subtitle,
    required this.category,
    required this.image,
    required this.playbook,
    required this.crafts,
    required this.fields,
    this.aspectRatio = '9:16',
    this.duration = 20,
  });

  final String id;
  final String title;
  final String chip;
  final String subtitle;
  final String category;
  final String image;
  final String playbook;
  final List<String> crafts;
  final List<GuidedField> fields;
  final String aspectRatio;
  final int duration;
}

HypitFormat hypitFormat(String id) {
  for (final format in hypitFormats) {
    if (format.id == id) return format;
  }
  return hypitFormats.first;
}

String titleFromAnswers(HypitFormat format, Map<String, String> answers) {
  final primary = format.fields.isEmpty
      ? ''
      : (answers[format.fields.first.id] ?? '').trim();
  final first = primary.split(RegExp(r'[\n.!?]')).first.trim();
  if (first.isEmpty) return format.title;
  return first.length <= 80 ? first : first.substring(0, 80);
}

String composeHypitBrief({
  required HypitFormat format,
  required Map<String, String> answers,
  required String aspectRatio,
  required int duration,
  String? referenceUrl,
}) {
  final lines = <String>[
    'Produce this video with Hypit.',
    'Format: ${format.title}',
    'Playbook: ${format.playbook}',
    'Crafts: ${format.crafts.join(', ')}.',
    'Do not ask for facts already answered here.',
    '',
  ];
  for (final field in format.fields) {
    final value = answers[field.id]?.trim() ?? '';
    if (value.isEmpty) continue;
    lines.add('${field.label}: $value');
    lines.add('');
  }
  lines.add('Deliver a $duration-second $aspectRatio video.');
  final reference = referenceUrl?.trim() ?? '';
  if (reference.isNotEmpty) lines.add('Reference: $reference');
  return lines.join('\n').trim();
}

const hypitFormats = [
  HypitFormat(
    id: 'talking-head',
    title: 'Talking-head UGC',
    chip: 'Talking-head',
    subtitle: 'One person talks to camera',
    category: 'CREATOR',
    image: 'ugc',
    playbook: 'references/playbooks/formats/talking-head.md',
    crafts: [
      'image-direction',
      'voice-direction',
      'video-direction',
      'captions',
    ],
    fields: [
      GuidedField(
        id: 'say',
        label: 'What should they say?',
        hint:
            'The claim, lines, or story. Name the product or subject in the same answer.',
        required: true,
        maxLines: 5,
      ),
      GuidedField(
        id: 'who',
        label: 'Who is on camera?',
        hint: 'Look, age range, attitude. Leave blank for a fitting creator.',
        maxLines: 2,
      ),
      GuidedField(
        id: 'facts',
        label: 'What must be true?',
        hint: 'Names, prices, features. The agent will not invent claims.',
        maxLines: 3,
      ),
    ],
  ),
  HypitFormat(
    id: 'narration-led',
    title: 'Narration-led',
    chip: 'Narration',
    subtitle: 'Voiceover over product, screens, or graphics',
    category: 'PRODUCT',
    image: 'product',
    playbook: 'references/playbooks/formats/narration-led-demo.md',
    crafts: [
      'voice-direction',
      'voice-and-performance',
      'b-roll',
      'graphic-compositions',
    ],
    fields: [
      GuidedField(
        id: 'voice',
        label: 'What should we hear?',
        hint: 'The narration idea or the lines themselves.',
        required: true,
        maxLines: 5,
      ),
      GuidedField(
        id: 'picture',
        label: 'What should we see?',
        hint: 'Product, hands, screens, or motion graphics.',
        maxLines: 3,
      ),
      GuidedField(
        id: 'proof',
        label: 'What must be visibly true?',
        hint: 'Facts the pictures have to prove. No invented results.',
        maxLines: 3,
      ),
    ],
  ),
  HypitFormat(
    id: 'presenter-led',
    title: 'Presenter-led explainer',
    chip: 'Presenter-led',
    subtitle: 'A host plus demonstrations',
    category: 'MOTION',
    image: 'product',
    playbook: 'references/playbooks/formats/presenter-led-explainer.md',
    crafts: [
      'voice-and-performance',
      'image-direction',
      'video-direction',
      'graphic-compositions',
    ],
    aspectRatio: '16:9',
    duration: 30,
    fields: [
      GuidedField(
        id: 'idea',
        label: 'What are they explaining?',
        hint: 'One idea, in a sentence. Then the steps if you have them.',
        required: true,
        maxLines: 5,
      ),
      GuidedField(
        id: 'host',
        label: 'Who presents?',
        hint: 'Stance, look, energy.',
        maxLines: 2,
      ),
      GuidedField(
        id: 'demo',
        label: 'What demonstration carries it?',
        hint: 'The graphic, comparison, or walkthrough on screen.',
        maxLines: 3,
      ),
    ],
  ),
  HypitFormat(
    id: 'ranking',
    title: 'Ranking / listicle',
    chip: 'Ranking',
    subtitle: 'A list the board keeps honest',
    category: 'EDITORIAL',
    image: 'ugc',
    playbook: 'references/playbooks/formats/ranking-listicle.md',
    crafts: ['graphic-compositions', 'captions', 'voice-direction'],
    fields: [
      GuidedField(
        id: 'subject',
        label: 'What is being ranked?',
        hint: 'The category and the point of view.',
        required: true,
        maxLines: 4,
      ),
      GuidedField(
        id: 'items',
        label: 'The list',
        hint: 'Best first, or the reveal order. Include why.',
        maxLines: 4,
      ),
      GuidedField(
        id: 'host',
        label: 'Host attitude',
        hint: 'One-liner and energy.',
        maxLines: 2,
      ),
    ],
  ),
  HypitFormat(
    id: 'short-drama',
    title: 'Short drama',
    chip: 'Short drama',
    subtitle: 'Characters carry the story',
    category: 'CINEMATIC',
    image: 'cinematic',
    playbook: 'references/playbooks/formats/short-drama.md',
    crafts: [
      'image-direction',
      'video-direction',
      'voice-and-performance',
      'visual-continuity',
    ],
    aspectRatio: '16:9',
    duration: 30,
    fields: [
      GuidedField(
        id: 'story',
        label: 'The story in 2-3 beats',
        hint: 'Who wants what, what changes, where it lands.',
        required: true,
        maxLines: 5,
      ),
      GuidedField(
        id: 'world',
        label: 'Place, light, feeling',
        hint: 'The world we should recognize in the first shot.',
        maxLines: 3,
      ),
      GuidedField(
        id: 'payoff',
        label: 'The last image or line',
        hint: 'What the clip should leave behind.',
        maxLines: 2,
      ),
    ],
  ),
  HypitFormat(
    id: 'street-interview',
    title: 'Street interview',
    chip: 'Street interview',
    subtitle: 'A motivated encounter',
    category: 'CREATOR',
    image: 'ugc',
    playbook: 'references/playbooks/formats/street-interview.md',
    crafts: [
      'image-direction',
      'video-direction',
      'caption-tracking',
      'voice-and-performance',
    ],
    fields: [
      GuidedField(
        id: 'encounter',
        label: 'The setup and the question',
        hint: 'Where this happens, and what gets asked.',
        required: true,
        maxLines: 4,
      ),
      GuidedField(
        id: 'people',
        label: 'Interviewer and guest',
        hint: 'Who asks, who answers, how they feel about it.',
        maxLines: 2,
      ),
      GuidedField(
        id: 'reveal',
        label: 'What the clip lands on',
        hint: 'The line, object, or caption that closes it.',
        maxLines: 2,
      ),
    ],
  ),
  HypitFormat(
    id: 'podcast',
    title: 'Two-person podcast',
    chip: 'Podcast',
    subtitle: 'Complementary hosts, one conversation',
    category: 'MUSIC',
    image: 'music',
    playbook: 'references/playbooks/formats/two-person-podcast.md',
    crafts: [
      'image-direction',
      'voice-and-performance',
      'visual-continuity',
    ],
    duration: 30,
    fields: [
      GuidedField(
        id: 'topic',
        label: 'What are they talking about?',
        hint: 'The conversation, and any product on the table.',
        required: true,
        maxLines: 4,
      ),
      GuidedField(
        id: 'hosts',
        label: 'Who is talking?',
        hint: 'Two people and their relationship.',
        maxLines: 2,
      ),
      GuidedField(
        id: 'visual',
        label: 'Studio look',
        hint: 'Room, light, and whether a product stays in frame.',
        maxLines: 2,
      ),
    ],
  ),
];
