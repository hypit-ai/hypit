import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';
import 'surreel_api.dart';

class AppController extends ChangeNotifier {
  AppController({
    SurreelApi? api,
    this.loadSettings = true,
    this.pollInterval = const Duration(milliseconds: 1500),
  }) : _api = api ?? SurreelApi(),
       _ownsApi = api == null;

  static const baseUrlPreferenceKey = 'surreel.serviceBaseUrl';

  SurreelApi _api;
  bool _ownsApi;
  final bool loadSettings;
  final Duration pollInterval;
  List<Project> _projects = const [];
  Project? _selected;
  bool _busy = false;
  bool _loading = false;
  bool _connected = false;
  bool _disposed = false;
  String? _error;
  Map<String, dynamic> _healthInfo = const {};
  int _connectionVersion = 0;
  int _selectionVersion = 0;
  int _selectedReadVersion = 0;
  int _listVersion = 0;
  int _mutationVersion = 0;
  Timer? _pollTimer;
  Future<void>? _initialization;
  Future<void>? _refresh;
  String? _refreshKey;

  SurreelApi get api => _api;
  List<Project> get projects => _projects;
  Project? get selected => _selected;
  bool get busy => _busy;
  bool get loading => _loading;
  bool get connected => _connected;
  String? get error => _error;
  Map<String, dynamic> get healthInfo => _healthInfo;
  bool get agentAvailable => _healthInfo['agentAvailable'] == true;

  Future<void> initialize() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    final connection = _connectionVersion;
    _loading = true;
    _notify();
    if (loadSettings && _ownsApi) {
      try {
        final preferences = await SharedPreferences.getInstance();
        if (!_currentConnection(connection)) return;
        final saved = preferences.getString(baseUrlPreferenceKey);
        if (saved != null && saved.trim().isNotEmpty) {
          final replacement = SurreelApi(baseUrl: saved);
          _api.close();
          _api = replacement;
        }
      } catch (_) {
        // Storage can be unavailable in private browsing. The service remains usable.
      }
    }
    if (_currentConnection(connection)) await loadProjects();
  }

  Future<void> loadProjects({bool silent = false}) async {
    if (_disposed || _busy) return;
    final connection = _connectionVersion;
    final request = ++_listVersion;
    final service = _api;
    if (!silent) {
      _loading = true;
      _error = null;
      _notify();
    }
    try {
      final health = await service.health();
      if (!_currentList(connection, request)) return;
      _healthInfo = Map.unmodifiable(health);
      final result = await service.listProjects();
      if (!_currentList(connection, request)) return;
      final previous = {for (final project in _projects) project.id: project};
      final incoming = {for (final project in result) project.id: project};
      _projects = _sort([
        ...result.map((project) {
          final existing = previous[project.id];
          return existing != null &&
                  existing.updatedAt.isAfter(project.updatedAt)
              ? existing
              : project;
        }),
        ...previous.values.where((project) => !incoming.containsKey(project.id)),
      ]);
      final selected = _selected;
      if (selected != null) {
        for (final project in _projects) {
          if (project.id == selected.id &&
              !project.updatedAt.isBefore(selected.updatedAt)) {
            _selected = project;
            break;
          }
        }
      }
      _connected = true;
      _error = null;
    } catch (exception) {
      if (!_currentList(connection, request)) return;
      if (!silent) {
        _connected = false;
        _error = _message(exception);
      }
    } finally {
      if (_currentList(connection, request)) {
        _loading = false;
        _notify();
        _schedulePoll();
      }
    }
  }

  Future<void> createAndRun(
    String prompt,
    String aspectRatio,
    int duration,
    String style, {
    String? referenceUrl,
    String? format,
    String? title,
  }) async {
    if (_disposed) return;
    if (prompt.trim().isEmpty) {
      _error = 'Describe the video you want to create.';
      _notify();
      return;
    }
    final connection = _connectionVersion;
    final selection = _selectionVersion;
    final service = _api;
    _error = null;
    _loading = false;
    _listVersion++;
    _notify();
    try {
      final draft = await service.createProject(
        prompt: prompt,
        aspectRatio: aspectRatio,
        duration: duration,
        style: style,
        format: format,
        title: title,
        referenceUrl: referenceUrl,
      );
      if (!_currentConnection(connection)) return;
      _upsert(draft);
      _connected = true;
      if (selection == _selectionVersion) _selected = draft;
      _notify();
      final running = await service.runProject(draft.id);
      if (!_currentConnection(connection)) return;
      _upsert(running);
      if (selection == _selectionVersion) _selected = running;
    } catch (exception) {
      if (_currentConnection(connection)) _error = _message(exception);
    } finally {
      if (_currentConnection(connection)) {
        _notify();
        _schedulePoll();
      }
    }
  }

  Future<void> setReview(
    Project project,
    String review, {
    List<String>? destinations,
  }) async {
    if (_disposed) return;
    _error = null;
    _notify();
    try {
      final result = await _api.patchProject(
        project.id,
        review: review,
        destinations: destinations,
      );
      _upsert(result, force: true);
      if (_selected?.id == project.id) _selected = result;
      _connected = true;
    } catch (exception) {
      _error = _message(exception);
    } finally {
      _notify();
    }
  }

  void selectProject(Project project) {
    if (_disposed) return;
    _invalidateSelectionReads();
    _selectionVersion++;
    _selected = _upsert(project);
    _error = null;
    _notify();
    unawaited(refreshSelected());
  }

  Future<void> refreshSelected() {
    final project = _selected;
    if (_disposed || project == null || _busy) return Future.value();
    final key = '$_connectionVersion:$_selectionVersion:${project.id}';
    if (_refreshKey == key && _refresh != null) return _refresh!;
    final request = ++_selectedReadVersion;
    final future = _fetchSelected(
      _api,
      project.id,
      _connectionVersion,
      _selectionVersion,
      request,
      key,
    );
    _refresh = future;
    _refreshKey = key;
    return future;
  }

  Future<void> _fetchSelected(
    SurreelApi service,
    String id,
    int connection,
    int selection,
    int request,
    String key,
  ) async {
    try {
      final project = await service.getProject(id);
      if (!_currentSelection(connection, selection, request, id)) return;
      _selected = _upsert(project);
      _connected = true;
      _error = null;
      _notify();
    } catch (exception) {
      if (!_currentSelection(connection, selection, request, id)) return;
      _error = _message(exception);
      // A single project read can fail while the studio is still reachable.
      _notify();
    } finally {
      if (_refreshKey == key && request == _selectedReadVersion) {
        _refresh = null;
        _refreshKey = null;
      }
      if (_currentSelection(connection, selection, request, id)) {
        _schedulePoll();
      }
    }
  }

  Future<void> rerun(String prompt) async {
    final project = _selected;
    if (_disposed || _busy || project == null || project.isActive) return;
    final operation = _startMutation();
    final connection = _connectionVersion;
    final selection = _selectionVersion;
    try {
      final result = await _api.runProject(project.id, prompt: prompt);
      if (!_currentMutation(connection, operation)) return;
      _upsert(result);
      _connected = true;
      if (selection == _selectionVersion && _selected?.id == project.id) {
        _selected = result;
      }
    } catch (exception) {
      if (_currentMutation(connection, operation)) _error = _message(exception);
    } finally {
      _finishMutation(connection, operation);
    }
  }

  Future<void> cancel() async {
    final project = _selected;
    if (_disposed || _busy || project == null || !project.isActive) return;
    final operation = _startMutation();
    final connection = _connectionVersion;
    final selection = _selectionVersion;
    try {
      final result = await _api.cancelProject(project.id);
      if (!_currentMutation(connection, operation)) return;
      _upsert(result);
      _connected = true;
      if (selection == _selectionVersion && _selected?.id == project.id) {
        _selected = result;
      }
    } catch (exception) {
      if (_currentMutation(connection, operation)) _error = _message(exception);
    } finally {
      _finishMutation(connection, operation);
    }
  }

  Future<void> configureConnection(String baseUrl, String token) async {
    if (_disposed) return;
    late final SurreelApi replacement;
    try {
      replacement = SurreelApi(baseUrl: baseUrl, token: token);
    } on FormatException catch (exception) {
      _error = exception.message;
      _notify();
      return;
    }
    _connectionVersion++;
    _selectionVersion++;
    _listVersion++;
    _mutationVersion++;
    _invalidateSelectionReads();
    if (_ownsApi) _api.close();
    _api = replacement;
    _ownsApi = true;
    _projects = const [];
    _selected = null;
    _healthInfo = const {};
    _connected = false;
    _busy = false;
    _loading = true;
    _error = null;
    _notify();
    final connection = _connectionVersion;
    if (loadSettings) {
      try {
        final preferences = await SharedPreferences.getInstance();
        if (!_currentConnection(connection)) return;
        await preferences.setString(baseUrlPreferenceKey, replacement.baseUrl);
      } catch (_) {
        // Connection settings still work for this session without local storage.
      }
    }
    if (_currentConnection(connection)) await loadProjects();
  }

  void clearError() {
    if (_disposed || _error == null) return;
    _error = null;
    _notify();
  }

  void clearSelection() {
    if (_disposed) return;
    _selectionVersion++;
    _invalidateSelectionReads();
    _selected = null;
    _error = null;
    _notify();
  }

  int _startMutation() {
    _busy = true;
    _error = null;
    _listVersion++;
    _loading = false;
    _invalidateSelectionReads();
    _notify();
    return ++_mutationVersion;
  }

  void _finishMutation(int connection, int operation) {
    if (!_currentMutation(connection, operation)) return;
    _busy = false;
    _notify();
    _schedulePoll();
  }

  Project _upsert(Project project, {bool force = false}) {
    final index = _projects.indexWhere((item) => item.id == project.id);
    if (!force &&
        index >= 0 &&
        _projects[index].updatedAt.isAfter(project.updatedAt)) {
      return _projects[index];
    }
    _projects = _sort([
      for (final existing in _projects)
        if (existing.id != project.id) existing,
      project,
    ]);
    return project;
  }

  List<Project> _sort(Iterable<Project> projects) => List.unmodifiable(
    projects.toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt)),
  );

  void _invalidateSelectionReads() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _selectedReadVersion++;
    _refresh = null;
    _refreshKey = null;
  }

  void _schedulePoll() {
    _pollTimer?.cancel();
    _pollTimer = null;
    if (_disposed || _busy) return;
    final actives = _projects.where((item) => item.isActive).length;
    final watching =
        _selected?.isActive == true || actives > 1 || (actives == 1 && _selected != null);
    if (!watching) return;
    _pollTimer = Timer(pollInterval, () {
      _pollTimer = null;
      unawaited(_pollPipeline());
    });
  }

  Future<void> _pollPipeline() async {
    if (_selected?.isActive == true) await refreshSelected();
    if (_projects.any((item) => item.isActive && item.id != _selected?.id)) {
      await loadProjects(silent: true);
    }
  }

  bool _currentConnection(int connection) =>
      !_disposed && connection == _connectionVersion;

  bool _currentList(int connection, int request) =>
      _currentConnection(connection) && request == _listVersion;

  bool _currentMutation(int connection, int operation) =>
      _currentConnection(connection) && operation == _mutationVersion;

  bool _currentSelection(
    int connection,
    int selection,
    int request,
    String id,
  ) =>
      _currentConnection(connection) &&
      selection == _selectionVersion &&
      request == _selectedReadVersion &&
      _selected?.id == id;

  String _message(Object exception) => switch (exception) {
    SurreelApiException(:final message) => message,
    FormatException(:final message) => message,
    _ => 'Something went wrong while contacting Surreel. Try again.',
  };

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _connectionVersion++;
    _invalidateSelectionReads();
    if (_ownsApi) _api.close();
    super.dispose();
  }
}
