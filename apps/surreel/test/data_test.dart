import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:surreel/data/app_controller.dart';
import 'package:surreel/data/formats.dart';
import 'package:surreel/data/models.dart';
import 'package:surreel/data/surreel_api.dart';

void main() {
  test('composeHypitBrief names the playbook and keeps answered facts', () {
    final format = hypitFormat('talking-head');
    final brief = composeHypitBrief(
      format: format,
      answers: {
        'say': 'Harbor Brew is the oat latte I actually finish.',
        'who': 'A kitchen creator.',
      },
      aspectRatio: '9:16',
      duration: 20,
    );
    expect(brief, contains(format.playbook));
    expect(brief, contains('Harbor Brew is the oat latte I actually finish.'));
    expect(brief, contains('Do not ask for facts already answered here.'));
    expect(brief, contains('Deliver a 20-second 9:16 video.'));
    expect(brief, isNot(contains('What must be true?')));
    expect(
      titleFromAnswers(format, {
        'say': 'Harbor Brew is the oat latte I actually finish.',
      }),
      'Harbor Brew is the oat latte I actually finish',
    );
  });

  group('SurreelApi', () {
    test(
      'sends the server contract, bearer token, and encoded path segments',
      () async {
        final requests = <http.Request>[];
        final api = SurreelApi(
          baseUrl: 'https://surreel.example/studio/',
          token: ' session-token ',
          client: MockClient((request) async {
            requests.add(request);
            return _json({'project': _projectJson()});
          }),
        );

        final result = await api.createProject(
          prompt: ' A cinematic launch film ',
          aspectRatio: '16:9',
          duration: 30,
          style: 'Talking-head UGC',
          format: ' talking-head ',
          title: ' Launch ',
          referenceUrl: ' https://example.com/reference ',
        );
        await api.getProject('id with/slash');
        await api.runProject('p1', prompt: ' Warm lighting ');
        await api.cancelProject('p1');
        await api.patchProject(
          'p1',
          review: 'sent',
          destinations: const ['tiktok'],
        );

        expect(result.id, 'p1');
        expect(requests.first.method, 'POST');
        expect(
          requests.first.url.toString(),
          'https://surreel.example/studio/api/projects',
        );
        expect(requests.first.headers['Authorization'], 'Bearer session-token');
        expect(
          requests.first.headers['Content-Type'],
          contains('application/json'),
        );
        expect(jsonDecode(requests.first.body), {
          'prompt': 'A cinematic launch film',
          'aspectRatio': '16:9',
          'duration': 30,
          'style': 'Talking-head UGC',
          'format': 'talking-head',
          'title': 'Launch',
          'referenceUrl': 'https://example.com/reference',
        });
        expect(requests[1].url.pathSegments.last, 'id with/slash');
        expect(requests[1].url.toString(), contains('id%20with%2Fslash'));
        expect(requests[2].url.path, '/studio/api/projects/p1/runs');
        expect(jsonDecode(requests[2].body), {'prompt': 'Warm lighting'});
        expect(requests[3].url.path, '/studio/api/projects/p1/cancel');
        expect(jsonDecode(requests[3].body), isEmpty);
        expect(requests[4].method, 'PATCH');
        expect(requests[4].url.path, '/studio/api/projects/p1');
        expect(jsonDecode(requests[4].body), {
          'review': 'sent',
          'destinations': ['tiktok'],
        });
      },
    );

    test(
      'decodes event and artifact collections without inventing results',
      () async {
        final data = _projectJson(status: 'completed');
        data['events'] = [
          {
            'id': 'e1',
            'type': 'message',
            'message': 'Rendering café scene',
            'createdAt': '2026-09-16T10:00:01.000Z',
          },
        ];
        data['artifacts'] = [
          {
            'id': 'a1',
            'name': 'film.mp4',
            'url': '/api/projects/p1/artifacts/a1?access=a%2Bb',
            'mimeType': 'video/mp4',
          },
        ];
        final api = SurreelApi(
          baseUrl: 'http://127.0.0.1:8787',
          client: MockClient(
            (_) async => _json({
              'projects': [data],
            }),
          ),
        );
        final projects = await api.listProjects();
        expect(projects.single.events.single.message, 'Rendering café scene');
        expect(projects.single.video?.name, 'film.mp4');
        expect(projects.single.isActive, isFalse);
        expect(projects.single.isCompleted, isTrue);
        expect(projects.single.inReview, isTrue);
        expect(() => projects.add(projects.single), throwsUnsupportedError);
        expect(() => projects.single.events.clear(), throwsUnsupportedError);
        expect(
          api.artifactUri(projects.single.video!.url).toString(),
          'http://127.0.0.1:8787/api/projects/p1/artifacts/a1?access=a%2Bb',
        );
      },
    );

    test('resolves signed artifacts under a configured service prefix', () {
      final api = SurreelApi(baseUrl: 'https://example.com/surreel');
      addTearDown(api.close);
      const path = '/api/projects/p1/artifacts/a1?access=a%2Bb%2Fc&expires=123';
      expect(
        api.artifactUri(path).toString(),
        'https://example.com/surreel$path',
      );
      expect(
        api.artifactUri(path.substring(1)).toString(),
        'https://example.com/surreel$path',
      );
      const external = 'https://media.example/film.mp4?signature=abc%2Bdef%2F';
      expect(api.artifactUri(external).toString(), external);
      expect(
        () => api.artifactUri('https://user:password@example.com/film.mp4'),
        throwsA(isA<SurreelApiException>()),
      );
    });

    test('preserves service error text and HTTP status', () async {
      final api = SurreelApi(
        client: MockClient(
          (_) async => _json({
            'error': 'Sign in to Codegraff before starting a run.',
          }, status: 503),
        ),
      );
      await expectLater(
        api.runProject('p1'),
        throwsA(
          isA<SurreelApiException>()
              .having((error) => error.statusCode, 'status', 503)
              .having(
                (error) => error.message,
                'message',
                'Sign in to Codegraff before starting a run.',
              ),
        ),
      );
    });

    test(
      'reports malformed success data and non-JSON server failures',
      () async {
        final responses = <http.Response>[
          _json({
            'project': {'id': 'incomplete'},
          }),
          http.Response('<html>Bad gateway</html>', 502),
          http.Response('not JSON', 200),
        ];
        final api = SurreelApi(
          client: MockClient((_) async => responses.removeAt(0)),
        );
        await expectLater(
          api.getProject('p1'),
          throwsA(
            isA<SurreelApiException>().having(
              (error) => error.message,
              'message',
              'The service returned invalid project data.',
            ),
          ),
        );
        await expectLater(
          api.health(),
          throwsA(
            isA<SurreelApiException>().having(
              (error) => error.statusCode,
              'status',
              502,
            ),
          ),
        );
        await expectLater(
          api.health(),
          throwsA(
            isA<SurreelApiException>().having(
              (error) => error.message,
              'message',
              contains('invalid JSON'),
            ),
          ),
        );
      },
    );

    test('bounds request time and rejects unsafe connection URLs', () async {
      final pending = Completer<http.Response>();
      final api = SurreelApi(
        timeout: const Duration(milliseconds: 10),
        client: MockClient((_) => pending.future),
      );
      await expectLater(
        api.health(),
        throwsA(
          isA<SurreelApiException>().having(
            (error) => error.message,
            'message',
            contains('too long'),
          ),
        ),
      );
      pending.complete(_json({'status': 'ok'}));
      for (final url in [
        'javascript:alert(1)',
        'https://user:password@example.com',
        'https://example.com?token=secret',
      ]) {
        expect(() => SurreelApi(baseUrl: url), throwsFormatException);
      }
      expect(
        () => api.artifactUri('file:///private/movie.mp4'),
        throwsA(isA<SurreelApiException>()),
      );
    });
  });

  group('AppController', () {
    test('initializes from real service health and project list', () async {
      final controller = _controller(
        MockClient(
          (request) async => switch (request.url.path) {
            '/api/health' => _json({'status': 'ok', 'agentAvailable': true}),
            '/api/projects' => _json({
              'projects': [_projectJson()],
            }),
            _ => _json({'error': 'Not found'}, status: 404),
          },
        ),
      );
      addTearDown(controller.dispose);
      await controller.initialize();
      expect(controller.projects.single.id, 'p1');
      expect(controller.connected, isTrue);
      expect(controller.agentAvailable, isTrue);
      expect(controller.loading, isFalse);
      expect(controller.selected, isNull);
      expect(controller.error, isNull);
    });

    test('keeps the saved draft when starting Codegraff fails', () async {
      final paths = <String>[];
      final controller = _controller(
        MockClient((request) async {
          paths.add(request.url.path);
          if (request.url.path.endsWith('/runs')) {
            return _json({
              'error': 'Codegraff needs authentication.',
            }, status: 503);
          }
          return _json({'project': _projectJson()});
        }),
      );
      addTearDown(controller.dispose);
      await controller.createAndRun('A launch film', '16:9', 30, 'Cinematic');
      expect(paths, ['/api/projects', '/api/projects/p1/runs']);
      expect(controller.selected?.status, 'draft');
      expect(controller.projects.single.id, 'p1');
      expect(controller.error, 'Codegraff needs authentication.');
      expect(controller.busy, isFalse);
    });

    test('a missing project does not mark the studio disconnected', () async {
      final controller = _controller(
        MockClient((request) async {
          if (request.url.path.endsWith('/health')) {
            return _json({'status': 'ok', 'agentAvailable': true});
          }
          if (request.url.path == '/api/projects') {
            return _json({
              'projects': [_projectJson()],
            });
          }
          return _json({'error': 'Project not found.'}, status: 404);
        }),
      );
      addTearDown(controller.dispose);
      await controller.initialize();
      expect(controller.connected, isTrue);
      controller.selectProject(Project.fromJson(_projectJson(id: 'missing')));
      await controller.refreshSelected();
      expect(controller.connected, isTrue);
      expect(controller.error, 'Project not found.');
    });

    test('a slow response cannot replace a newer project selection', () async {
      final first = Completer<http.Response>();
      final second = Completer<http.Response>();
      final controller = _controller(
        MockClient((request) {
          return request.url.path.endsWith('/first')
              ? first.future
              : second.future;
        }),
      );
      addTearDown(controller.dispose);
      controller.selectProject(Project.fromJson(_projectJson(id: 'first')));
      final firstRead = controller.refreshSelected();
      controller.selectProject(Project.fromJson(_projectJson(id: 'second')));
      final secondRead = controller.refreshSelected();
      second.complete(
        _json({'project': _projectJson(id: 'second', status: 'completed')}),
      );
      await secondRead;
      first.complete(
        _json({'project': _projectJson(id: 'first', status: 'failed')}),
      );
      await firstRead;
      expect(controller.selected?.id, 'second');
      expect(controller.selected?.status, 'completed');
      expect(controller.error, isNull);
    });

    test('cancellation wins over a response already in flight', () async {
      final pending = Completer<http.Response>();
      final controller = _controller(
        MockClient((request) async {
          if (request.method == 'GET') return pending.future;
          return _json({'project': _projectJson(status: 'cancelled')});
        }),
      );
      addTearDown(controller.dispose);
      controller.selectProject(
        Project.fromJson(_projectJson(status: 'running')),
      );
      final refresh = controller.refreshSelected();
      await controller.cancel();
      pending.complete(
        _json({
          'project': _projectJson(
            status: 'running',
            updatedAt: '2026-09-17T10:00:01.000Z',
          ),
        }),
      );
      await refresh;
      expect(controller.selected?.status, 'cancelled');
      expect(controller.projects.single.status, 'cancelled');
      expect(controller.busy, isFalse);
    });

    test('a second enqueue starts while the first create is still in flight', () async {
      final firstCreate = Completer<http.Response>();
      final firstStarted = Completer<void>();
      var creates = 0;
      final controller = _controller(
        MockClient((request) async {
          if (request.url.path == '/api/projects' && request.method == 'POST') {
            creates += 1;
            if (creates == 1) {
              firstStarted.complete();
              return firstCreate.future;
            }
            return _json({'project': _projectJson(id: 'p2')});
          }
          if (request.url.path.endsWith('/runs')) {
            final id = request.url.pathSegments[request.url.pathSegments.length - 2];
            return _json({'project': _projectJson(id: id, status: 'running')});
          }
          return _json({'error': 'Not found'}, status: 404);
        }),
      );
      addTearDown(controller.dispose);
      final first = controller.createAndRun(
        'First film',
        '9:16',
        20,
        'Talking-head UGC',
      );
      await firstStarted.future;
      await controller.createAndRun(
        'Second film',
        '9:16',
        20,
        'Talking-head UGC',
      );
      firstCreate.complete(_json({'project': _projectJson(id: 'p1')}));
      await first;
      expect(creates, 2);
      expect(controller.projects.map((project) => project.id).toSet(), {
        'p1',
        'p2',
      });
      expect(controller.busy, isFalse);
    });

    test('setReview patches the finished video', () async {
      final requests = <http.Request>[];
      final controller = _controller(
        MockClient((request) async {
          requests.add(request);
          return _json({
            'project': {
              ..._projectJson(status: 'completed'),
              'review': 'approved',
              'artifacts': [
                {
                  'id': 'a1',
                  'name': 'film.mp4',
                  'url': '/api/projects/p1/artifacts/a1',
                  'mimeType': 'video/mp4',
                },
              ],
            },
          });
        }),
      );
      addTearDown(controller.dispose);
      await controller.setReview(
        Project.fromJson(_projectJson(status: 'completed')),
        'approved',
      );
      expect(requests.single.method, 'PATCH');
      expect(controller.projects.single.isApproved, isTrue);
    });

    test(
      'a project list requested before creation cannot erase the new run',
      () async {
        final list = Completer<http.Response>();
        final listStarted = Completer<void>();
        final controller = _controller(
          MockClient((request) async {
            if (request.url.path.endsWith('/health')) {
              return _json({'status': 'ok'});
            }
            if (request.method == 'GET') {
              listStarted.complete();
              return list.future;
            }
            return _json({
              'project': _projectJson(
                status: request.url.path.endsWith('/runs')
                    ? 'running'
                    : 'draft',
              ),
            });
          }),
        );
        addTearDown(controller.dispose);
        final loading = controller.loadProjects();
        await listStarted.future;
        await controller.createAndRun('A launch film', '16:9', 30, 'Cinematic');
        list.complete(_json({'projects': []}));
        await loading;
        expect(controller.selected?.status, 'running');
        expect(controller.projects.single.id, 'p1');
        expect(controller.loading, isFalse);
      },
    );

    test(
      'an older list response cannot regress a project refreshed meanwhile',
      () async {
        final list = Completer<http.Response>();
        final listStarted = Completer<void>();
        final controller = _controller(
          MockClient((request) async {
            if (request.url.path.endsWith('/health')) {
              return _json({'status': 'ok'});
            }
            if (request.url.path == '/api/projects') {
              listStarted.complete();
              return list.future;
            }
            return _json({
              'project': _projectJson(
                status: 'completed',
                updatedAt: '2026-09-16T10:00:02.000Z',
              ),
            });
          }),
        );
        addTearDown(controller.dispose);
        final loading = controller.loadProjects();
        await listStarted.future;
        controller.selectProject(
          Project.fromJson(_projectJson(status: 'running')),
        );
        await controller.refreshSelected();
        list.complete(
          _json({
            'projects': [_projectJson(status: 'running')],
          }),
        );
        await loading;
        expect(controller.projects.single.status, 'completed');
        expect(controller.selected?.status, 'completed');
      },
    );

    testWidgets('polls without overlap and stops after a terminal status', (
      tester,
    ) async {
      final responses = [
        Completer<http.Response>(),
        Completer<http.Response>(),
      ];
      var requests = 0;
      final controller = _controller(
        MockClient((_) => responses[requests++].future),
        pollInterval: const Duration(milliseconds: 1500),
      );
      controller.selectProject(
        Project.fromJson(_projectJson(status: 'running')),
      );
      await tester.pump(const Duration(seconds: 8));
      expect(requests, 1);
      responses[0].complete(
        _json({'project': _projectJson(status: 'running')}),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1500));
      expect(requests, 2);
      await tester.pump(const Duration(seconds: 8));
      expect(requests, 2);
      responses[1].complete(
        _json({'project': _projectJson(status: 'completed')}),
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 8));
      expect(requests, 2);
      expect(controller.selected?.status, 'completed');
      controller.dispose();
    });

    test(
      'disposing during a request suppresses notifications and results',
      () async {
        final pending = Completer<http.Response>();
        final controller = _controller(MockClient((_) => pending.future));
        var notifications = 0;
        controller.addListener(() => notifications++);
        controller.selectProject(Project.fromJson(_projectJson()));
        final refresh = controller.refreshSelected();
        final beforeDispose = notifications;
        controller.dispose();
        pending.complete(_json({'project': _projectJson(status: 'completed')}));
        await refresh;
        expect(notifications, beforeDispose);
      },
    );
  });
}

AppController _controller(
  http.Client client, {
  Duration pollInterval = const Duration(hours: 1),
}) => AppController(
  api: SurreelApi(baseUrl: 'http://127.0.0.1:8787', client: client),
  loadSettings: false,
  pollInterval: pollInterval,
);

http.Response _json(Object body, {int status = 200}) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Map<String, dynamic> _projectJson({
  String id = 'p1',
  String status = 'draft',
  String updatedAt = '2026-09-16T10:00:01.000Z',
}) => {
  'id': id,
  'title': 'Launch film',
  'prompt': 'A cinematic launch film',
  'aspectRatio': '16:9',
  'duration': 30,
  'style': 'Cinematic',
  'status': status,
  'createdAt': '2026-09-16T10:00:00.000Z',
  'updatedAt': updatedAt,
  'events': [],
  'artifacts': [],
};
