import 'package:flutter/foundation.dart';

import 'models.dart';

@immutable
class SocialTarget {
  const SocialTarget({
    required this.id,
    required this.label,
    required this.composeUrl,
  });

  final String id;
  final String label;
  final String composeUrl;

  Uri launchUri(String caption) {
    final uri = Uri.parse(composeUrl);
    if (id == 'x') {
      return uri.replace(queryParameters: {'text': caption});
    }
    return uri;
  }
}

const socialTargets = [
  SocialTarget(
    id: 'tiktok',
    label: 'TikTok',
    composeUrl: 'https://www.tiktok.com/upload',
  ),
  SocialTarget(
    id: 'instagram',
    label: 'Instagram',
    composeUrl: 'https://www.instagram.com/',
  ),
  SocialTarget(
    id: 'youtube',
    label: 'YouTube',
    composeUrl: 'https://studio.youtube.com',
  ),
  SocialTarget(
    id: 'x',
    label: 'X',
    composeUrl: 'https://x.com/compose/post',
  ),
];

SocialTarget socialTarget(String id) => socialTargets.firstWhere(
  (item) => item.id == id,
  orElse: () => socialTargets.first,
);

String socialCaption(Project project) {
  final firstLine = project.prompt
      .split('\n')
      .map((line) => line.trim())
      .firstWhere((line) => line.isNotEmpty, orElse: () => project.title);
  if (firstLine == project.title) return project.title;
  return '${project.title}\n\n$firstLine';
}
