import 'package:flutter/foundation.dart';

@immutable
class AgentEvent {
  const AgentEvent({
    required this.id,
    required this.type,
    required this.message,
    required this.createdAt,
  });

  factory AgentEvent.fromJson(Map<String, dynamic> json) => AgentEvent(
    id: _requiredString(json, 'id'),
    type: _requiredString(json, 'type'),
    message: _requiredString(json, 'message'),
    createdAt: _requiredDate(json, 'createdAt'),
  );

  final String id;
  final String type;
  final String message;
  final DateTime createdAt;
}

@immutable
class VideoArtifact {
  const VideoArtifact({
    required this.id,
    required this.name,
    required this.url,
    required this.mimeType,
  });

  factory VideoArtifact.fromJson(Map<String, dynamic> json) => VideoArtifact(
    id: _requiredString(json, 'id'),
    name: _requiredString(json, 'name'),
    url: _requiredString(json, 'url'),
    mimeType: _requiredString(json, 'mimeType'),
  );

  final String id;
  final String name;
  final String url;
  final String mimeType;

  bool get isVideo => mimeType.startsWith('video/');
  bool get isImage => mimeType.startsWith('image/');
}

@immutable
class Project {
  Project({
    required this.id,
    required this.title,
    required this.prompt,
    required this.aspectRatio,
    required this.duration,
    required this.style,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.format,
    this.referenceUrl,
    List<AgentEvent> events = const [],
    List<VideoArtifact> artifacts = const [],
    this.error,
    this.review,
    List<String> destinations = const [],
  }) : events = List.unmodifiable(events),
       artifacts = List.unmodifiable(artifacts),
       destinations = List.unmodifiable(destinations);

  factory Project.fromJson(Map<String, dynamic> json) {
    final duration = json['duration'];
    if (duration is! num || duration != duration.roundToDouble()) {
      throw const FormatException('Project duration must be an integer.');
    }
    return Project(
      id: _requiredString(json, 'id'),
      title: _requiredString(json, 'title'),
      prompt: _requiredString(json, 'prompt'),
      aspectRatio: _requiredString(json, 'aspectRatio'),
      duration: duration.toInt(),
      style: _requiredString(json, 'style'),
      format: _optionalString(json, 'format'),
      referenceUrl: _optionalString(json, 'referenceUrl'),
      status: _requiredString(json, 'status'),
      createdAt: _requiredDate(json, 'createdAt'),
      updatedAt: _requiredDate(json, 'updatedAt'),
      events: _objects(json, 'events').map(AgentEvent.fromJson).toList(),
      artifacts: _objects(
        json,
        'artifacts',
      ).map(VideoArtifact.fromJson).toList(),
      error: _optionalString(json, 'error'),
      review: _optionalString(json, 'review') ??
          (_requiredString(json, 'status') == 'completed' ? 'inbox' : null),
      destinations: _strings(json, 'destinations'),
    );
  }

  final String id;
  final String title;
  final String prompt;
  final String aspectRatio;
  final int duration;
  final String style;
  final String? format;
  final String? referenceUrl;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<AgentEvent> events;
  final List<VideoArtifact> artifacts;
  final String? error;
  final String? review;
  final List<String> destinations;

  bool get isActive => status == 'queued' || status == 'running';
  bool get isCompleted => status == 'completed';
  bool get inReview =>
      isCompleted && video != null && (review == null || review == 'inbox');
  bool get isApproved => review == 'approved';
  bool get isSent => review == 'sent';

  String get statusLabel => switch (status) {
    'draft' => 'Draft',
    'queued' => 'Queued',
    'running' => 'Creating',
    'completed' => 'Ready',
    'failed' => 'Needs attention',
    'cancelled' => 'Cancelled',
    _ => status,
  };

  VideoArtifact? get video {
    for (final artifact in artifacts.reversed) {
      if (artifact.isVideo) return artifact;
    }
    return null;
  }
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String) throw FormatException('Missing or invalid $key.');
  return value;
}

String? _optionalString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value == null) return null;
  return _requiredString(json, key);
}

DateTime _requiredDate(Map<String, dynamic> json, String key) {
  final value = DateTime.tryParse(_requiredString(json, key));
  if (value == null) throw FormatException('Invalid $key timestamp.');
  return value;
}

List<String> _strings(Map<String, dynamic> json, String key) {
  final values = json[key];
  if (values == null) return const [];
  if (values is! List) throw FormatException('Invalid $key list.');
  return [
    for (final value in values)
      if (value is String) value,
  ];
}

Iterable<Map<String, dynamic>> _objects(
  Map<String, dynamic> json,
  String key,
) sync* {
  final values = json[key];
  if (values == null) return;
  if (values is! List) throw FormatException('Invalid $key list.');
  for (final value in values) {
    if (value is! Map<String, dynamic>) {
      throw FormatException('Invalid item in $key.');
    }
    yield value;
  }
}
