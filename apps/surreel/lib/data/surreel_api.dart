import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

class SurreelApiException implements Exception {
  const SurreelApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class SurreelApi {
  SurreelApi({
    String? baseUrl,
    String token = '',
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
  }) : _baseUri = _parseBaseUrl(baseUrl ?? defaultBaseUrl),
       token = token.trim(),
       _client = client ?? http.Client(),
       _ownsClient = client == null;

  static String get defaultBaseUrl {
    const configured = String.fromEnvironment('SURREEL_API_URL');
    if (configured.isNotEmpty) return configured;
    return kIsWeb ? Uri.base.origin : 'http://127.0.0.1:8787';
  }

  final Uri _baseUri;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;

  /// The optional service credential lives in memory for this app session.
  final String token;

  String get baseUrl => _baseUri.toString();

  Future<Map<String, dynamic>> health() => _request('GET', ['health']);

  Future<List<Project>> listProjects() async {
    final json = await _request('GET', ['projects']);
    final projects = json['projects'];
    if (projects is! List) {
      throw const SurreelApiException(
        'The service returned an invalid project list.',
      );
    }
    return _decodeModel(
      () => List.unmodifiable(
        projects.map((project) {
          if (project is! Map<String, dynamic>) {
            throw const FormatException('Invalid project.');
          }
          return Project.fromJson(project);
        }),
      ),
    );
  }

  Future<Project> createProject({
    required String prompt,
    required String aspectRatio,
    required int duration,
    required String style,
    String? title,
    String? format,
    String? referenceUrl,
  }) async => _project(
    await _request(
      'POST',
      ['projects'],
      body: {
        'prompt': prompt.trim(),
        'aspectRatio': aspectRatio,
        'duration': duration,
        'style': style,
        if (title != null && title.trim().isNotEmpty) 'title': title.trim(),
        if (format != null && format.trim().isNotEmpty) 'format': format.trim(),
        if (referenceUrl != null && referenceUrl.trim().isNotEmpty)
          'referenceUrl': referenceUrl.trim(),
      },
    ),
  );

  Future<Project> getProject(String id) async =>
      _project(await _request('GET', ['projects', id]));

  Future<Project> runProject(String id, {String? prompt}) async => _project(
    await _request(
      'POST',
      ['projects', id, 'runs'],
      body: {
        if (prompt != null && prompt.trim().isNotEmpty) 'prompt': prompt.trim(),
      },
    ),
  );

  Future<Project> cancelProject(String id) async =>
      _project(await _request('POST', ['projects', id, 'cancel'], body: {}));

  Future<Project> patchProject(
    String id, {
    String? review,
    List<String>? destinations,
  }) async => _project(
    await _request(
      'PATCH',
      ['projects', id],
      body: {
        'review': ?review,
        'destinations': ?destinations,
      },
    ),
  );

  /// Signed artifact query parameters are supplied by the service and preserved.
  Uri artifactUri(String url) {
    final reference = Uri.tryParse(url);
    if (reference == null) {
      throw const SurreelApiException(
        'The service returned an invalid artifact URL.',
      );
    }
    final base = _baseUri.replace(path: '${_baseUri.path}/');
    // The server emits /api paths without knowing its reverse-proxy prefix.
    final serverPath =
        !reference.hasScheme &&
        !reference.hasAuthority &&
        reference.path.startsWith('/api/');
    final uri = base.resolveUri(
      serverPath
          ? reference.replace(path: reference.path.substring(1))
          : reference,
    );
    if (!const ['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      throw const SurreelApiException(
        'The service returned an invalid artifact URL.',
      );
    }
    return uri;
  }

  Uri _endpoint(List<String> segments) => _baseUri.replace(
    pathSegments: [
      ..._baseUri.pathSegments.where((segment) => segment.isNotEmpty),
      'api',
      ...segments,
    ],
  );

  Future<Map<String, dynamic>> _request(
    String method,
    List<String> path, {
    Map<String, dynamic>? body,
  }) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
    late final http.Response response;
    try {
      final request = switch (method) {
        'GET' => _client.get(_endpoint(path), headers: headers),
        'PATCH' => _client.patch(
          _endpoint(path),
          headers: headers,
          body: jsonEncode(body),
        ),
        _ => _client.post(
          _endpoint(path),
          headers: headers,
          body: jsonEncode(body),
        ),
      };
      response = await request.timeout(timeout);
    } on TimeoutException {
      throw const SurreelApiException(
        'The Surreel service took too long to respond. Try again.',
      );
    } on http.ClientException {
      throw SurreelApiException(
        'Could not connect to Surreel at $baseUrl. Check the service and connection settings.',
      );
    }

    Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        throw const SurreelApiException(
          'The service returned an invalid JSON response.',
        );
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? message;
      if (decoded is Map<String, dynamic>) {
        final error = decoded['error'];
        if (error is String) message = error;
        if (error is Map<String, dynamic> && error['message'] is String) {
          message = error['message'] as String;
        }
        if (message == null && decoded['message'] is String) {
          message = decoded['message'] as String;
        }
      }
      throw SurreelApiException(
        message?.trim().isNotEmpty == true
            ? message!
            : 'Surreel could not complete this request (HTTP ${response.statusCode}).',
        statusCode: response.statusCode,
      );
    }
    if (decoded is! Map<String, dynamic>) {
      throw const SurreelApiException(
        'The service returned an invalid response.',
      );
    }
    return decoded;
  }

  Project _project(Map<String, dynamic> json) => _decodeModel(() {
    final project = json['project'];
    if (project is! Map<String, dynamic>) {
      throw const FormatException('Missing project.');
    }
    return Project.fromJson(project);
  });

  T _decodeModel<T>(T Function() decode) {
    try {
      return decode();
    } on FormatException {
      throw const SurreelApiException(
        'The service returned invalid project data.',
      );
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }

  static Uri _parseBaseUrl(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        !const ['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw const FormatException(
        'Enter an HTTP or HTTPS service URL, without credentials, query parameters, or a fragment.',
      );
    }
    return uri.replace(path: uri.path.replaceFirst(RegExp(r'/+$'), ''));
  }
}
