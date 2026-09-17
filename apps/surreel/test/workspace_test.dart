import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:surreel/data/app_controller.dart';
import 'package:surreel/data/formats.dart';
import 'package:surreel/data/surreel_api.dart';
import 'package:surreel/main.dart';
import 'package:surreel/ui/design.dart';
import 'package:surreel/ui/project_view.dart';
import 'package:surreel/ui/templates.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    // Layout checks use the shipped fonts rather than the test-only Ahem font.
    for (final family in ['DMSans', 'SpaceGrotesk']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/$family.ttf'))).load();
    }
  });

  testWidgets(
    'mobile workspace fits 390 by 844 and supports all navigation pages',
    (tester) async {
      await _mount(tester, size: const Size(390, 844));
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byKey(const Key('brief-input')), findsOneWidget);
      expect(find.byTooltip('Getting started'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Getting started'));
      await _frames(tester);
      expect(find.text('From an idea to a first take.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Let’s make something'));
      await _frames(tester);
      await tester.tap(find.text('Studio online'));
      await _frames(tester);
      expect(find.text('Studio address'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Cancel'));
      await _frames(tester);
      for (final page in ['Review', 'Socials', 'Formats', 'Queue']) {
        await _navigate(tester, page, mobile: true);
        expect(
          tester.takeException(),
          isNull,
          reason: '$page should fit the mobile viewport',
        );
      }
      final create = find.byKey(const Key('create-video'));
      final button = tester.widget<FilledButton>(create);
      expect(button.onPressed, isNull);
      final createBox = tester.getRect(create);
      expect(createBox.height, greaterThanOrEqualTo(44));
      expect(createBox.top, greaterThan(500));
      expect(createBox.bottom, lessThanOrEqualTo(844));
    },
  );

  testWidgets('desktop workspace fits 1440 by 900 and rejects an empty brief', (
    tester,
  ) async {
    await _mount(tester);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Personal workspace'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('create-video')))
          .onPressed,
      isNull,
    );
    await tester.enterText(find.byKey(const Key('brief-input')), '  \n  ');
    await tester.pump();
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('create-video')))
          .onPressed,
      isNull,
    );
    await _navigate(tester, 'Formats');
    expect(find.byType(TemplateCard), findsNWidgets(briefTemplates.length));
    expect(tester.takeException(), isNull);
  });

  testWidgets('short desktop windows keep the full sidebar reachable', (
    tester,
  ) async {
    await _mount(tester, size: const Size(1280, 600));
    expect(tester.takeException(), isNull);
    final account = find.text('Personal workspace');
    await tester.ensureVisible(account);
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(tester.getBottomRight(account).dy, lessThanOrEqualTo(600));
  });

  testWidgets('choosing a template fills the brief and its format settings', (
    tester,
  ) async {
    await _mount(tester);
    await _navigate(tester, 'Formats');
    final template = briefTemplates.firstWhere(
      (item) => item.category == 'MOTION',
    );
    final card = find.widgetWithText(TemplateCard, template.title);
    await tester.ensureVisible(card);
    await tester.tap(card);
    await _frames(tester);

    final brief = tester.widget<TextField>(
      find.byKey(const Key('brief-input')),
    );
    expect(brief.controller?.text, template.prompt);
    expect(
      tester
          .widget<DropdownButton<String>>(find.byType(DropdownButton<String>))
          .value,
      template.aspectRatio,
    );
    expect(
      tester
          .widget<DropdownButton<int>>(find.byType(DropdownButton<int>))
          .value,
      template.duration,
    );
    expect(
      tester
          .widget<FormatChip>(find.byKey(Key('format-${template.formatId}')))
          .selected,
      isTrue,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const Key('create-video')))
          .onPressed,
      isNotNull,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'submission queues the chosen brief without leaving the pipeline',
    (tester) async {
      final writes = <http.Request>[];
      Map<String, dynamic>? saved;
      final controller = await _mount(
        tester,
        handler: (request) async {
          if (request.method == 'POST') {
            writes.add(request);
            if (request.url.path == '/api/projects') {
              saved = _project(
                id: 'actual-project',
                title: 'Moonlit launch',
                config: jsonDecode(request.body) as Map<String, dynamic>,
              );
              return _json({'project': saved}, status: 201);
            }
            return _json({
              'project': {...saved!, 'status': 'queued'},
            }, status: 202);
          }
          return _defaultResponse(request);
        },
      );
      const prompt = 'A moonlit product launch with soft blue lighting.';
      final format = hypitFormat('talking-head');
      await tester.enterText(find.byKey(const Key('brief-input')), prompt);
      await _chooseDropdown(
        tester,
        find.byType(DropdownButton<String>),
        '1:1',
      );
      await _chooseDropdown(tester, find.byType(DropdownButton<int>), '45 sec');
      final create = find.byKey(const Key('create-video'));
      await tester.ensureVisible(create);
      await tester.tap(create);
      await _frames(tester);

      expect(writes.map((request) => request.url.path), [
        '/api/projects',
        '/api/projects/actual-project/runs',
      ]);
      expect(jsonDecode(writes.first.body), {
        'prompt': composeHypitBrief(
          format: format,
          answers: {'say': prompt},
          aspectRatio: '1:1',
          duration: 45,
        ),
        'aspectRatio': '1:1',
        'duration': 45,
        'style': format.title,
        'format': format.id,
        'title': titleFromAnswers(format, {'say': prompt}),
      });
      expect(controller.selected?.id, 'actual-project');
      expect(controller.selected?.status, 'queued');
      expect(find.byType(ProjectView), findsNothing);
      expect(find.byKey(const Key('brief-input')), findsOneWidget);
      expect(
        find.text(titleFromAnswers(format, {'say': prompt})),
        findsWidgets,
      );
      expect(find.text('Queued'), findsWidgets);
      expect(tester.takeException(), isNull);
      tester.view.physicalSize = const Size(390, 844);
      await _frames(tester);
      expect(find.byType(ProjectView), findsNothing);
      expect(find.byKey(const Key('create-video')), findsOneWidget);
      expect(
        tester.takeException(),
        isNull,
        reason: 'The queue should still fit a phone after enqueue.',
      );
      controller.clearSelection();
      await tester.pump();
    },
  );

  testWidgets('project search and status filters compose and can be cleared', (
    tester,
  ) async {
    await _mount(
      tester,
      projects: [
        _project(id: 'complete', title: 'Mercury serum', status: 'completed'),
        _project(id: 'active', title: 'Moonlit album', status: 'running'),
        _project(id: 'draft', title: 'Mercury concept'),
      ],
    );
    await _navigate(tester, 'Queue');
    expect(find.bySemanticsLabel(RegExp(r'^Queue$')), findsWidgets);
    expect(find.text('Mercury serum'), findsOneWidget);
    expect(find.text('Moonlit album'), findsOneWidget);
    expect(find.text('Mercury concept'), findsOneWidget);
    final search = find.byKey(const Key('project-search'));
    await tester.enterText(search, 'mercury');
    await tester.pump();
    expect(find.text('Moonlit album'), findsNothing);
    await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Completed'));
    await tester.tap(find.widgetWithText(ChoiceChip, 'Completed'));
    await _frames(tester);
    expect(find.text('Mercury serum'), findsOneWidget);
    expect(find.text('Mercury concept'), findsNothing);
    await tester.enterText(search, 'no matching project');
    await tester.pump();
    expect(find.text('No projects match this view.'), findsOneWidget);
    await tester.tap(find.text('Clear filters'));
    await _frames(tester);
    expect(tester.widget<TextField>(search).controller?.text, isEmpty);
    expect(find.text('Mercury serum'), findsOneWidget);
    expect(find.text('Moonlit album'), findsOneWidget);
    expect(find.text('Mercury concept'), findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'In progress'));
    await tester.tap(find.widgetWithText(ChoiceChip, 'In progress'));
    await _frames(tester);
    expect(find.text('Moonlit album'), findsOneWidget);
    expect(find.text('Mercury serum'), findsNothing);
    expect(find.text('Mercury concept'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'service failures appear with an empty project list and no fabricated outputs',
    (tester) async {
      final controller = await _mount(
        tester,
        size: const Size(390, 844),
        handler: (_) async => _json({
          'error': 'The studio is offline. Start the service and reconnect.',
        }, status: 503),
      );
      expect(
        find.text('The studio is offline. Start the service and reconnect.'),
        findsOneWidget,
      );
      expect(controller.connected, isFalse);
      expect(controller.projects, isEmpty);
      await _navigate(tester, 'Queue', mobile: true);
      expect(find.text('Your first film starts here.'), findsOneWidget);
      expect(find.byType(ProjectView), findsNothing);
      await _navigate(tester, 'Socials', mobile: true);
      expect(find.text('Make something worth keeping.'), findsOneWidget);
      expect(find.byTooltip('Open output'), findsNothing);
      expect(controller.projects, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('review keep sends an approve patch and moves the film to socials', (
    tester,
  ) async {
    final writes = <http.Request>[];
    await _mount(
      tester,
      projects: [
        _project(
          id: 'ready-film',
          title: 'Harbor brew',
          status: 'completed',
          config: {
            'review': 'inbox',
            'artifacts': [
              {
                'id': 'a1',
                'name': 'film.mp4',
                'url': '/api/projects/ready-film/artifacts/a1',
                'mimeType': 'video/mp4',
              },
            ],
          },
        ),
      ],
      handler: (request) async {
        if (request.method == 'PATCH') {
          writes.add(request);
          return _json({
            'project': _project(
              id: 'ready-film',
              title: 'Harbor brew',
              status: 'completed',
              config: {
                'review': 'approved',
                'artifacts': [
                  {
                    'id': 'a1',
                    'name': 'film.mp4',
                    'url': '/api/projects/ready-film/artifacts/a1',
                    'mimeType': 'video/mp4',
                  },
                ],
              },
            ),
          });
        }
        return _defaultResponse(
          request,
          projects: [
            _project(
              id: 'ready-film',
              title: 'Harbor brew',
              status: 'completed',
              config: {
                'review': writes.isEmpty ? 'inbox' : 'approved',
                'artifacts': [
                  {
                    'id': 'a1',
                    'name': 'film.mp4',
                    'url': '/api/projects/ready-film/artifacts/a1',
                    'mimeType': 'video/mp4',
                  },
                ],
              },
            ),
          ],
        );
      },
    );
    await _navigate(tester, 'Review');
    expect(find.text('Harbor brew'), findsWidgets);
    await tester.tap(find.byKey(const Key('keep-review')));
    await tester.pump(const Duration(milliseconds: 200));
    await _frames(tester);
    expect(writes.single.method, 'PATCH');
    expect(jsonDecode(writes.single.body), {'review': 'approved'});
    await _navigate(tester, 'Socials');
    expect(find.text('Harbor brew'), findsOneWidget);
    expect(find.byKey(const Key('send-ready-film')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Future<AppController> _mount(
  WidgetTester tester, {
  Size size = const Size(1440, 900),
  List<Map<String, dynamic>> projects = const [],
  Future<http.Response> Function(http.Request)? handler,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  final client = MockClient(
    handler ?? (request) async => _defaultResponse(request, projects: projects),
  );
  final controller = AppController(
    api: SurreelApi(baseUrl: 'http://127.0.0.1:8787', client: client),
    loadSettings: false,
    pollInterval: const Duration(hours: 1),
  );
  addTearDown(() async {
    controller.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    client.close();
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(SurreelApp(controller: controller));
  await _frames(tester);
  return controller;
}

Future<void> _frames(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
  await tester.pump(const Duration(milliseconds: 200));
}

Future<void> _navigate(
  WidgetTester tester,
  String label, {
  bool mobile = false,
}) async {
  final target = mobile
      ? find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        )
      : find.text(label).first;
  await tester.tap(target);
  await _frames(tester);
}

Future<void> _chooseDropdown(
  WidgetTester tester,
  Finder dropdown,
  String value,
) async {
  await tester.ensureVisible(dropdown);
  await tester.tap(dropdown);
  await _frames(tester);
  await tester.tap(find.text(value).last);
  await _frames(tester);
}

http.Response _defaultResponse(
  http.Request request, {
  List<Map<String, dynamic>> projects = const [],
}) {
  if (request.url.path.endsWith('/health')) {
    return _json({'status': 'ok', 'agentAvailable': true});
  }
  return _json({'projects': projects});
}

http.Response _json(Object body, {int status = 200}) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Map<String, dynamic> _project({
  String id = 'project-1',
  String title = 'A new film',
  String status = 'draft',
  Map<String, dynamic> config = const {},
}) => {
  'id': id,
  'title': title,
  'prompt': 'A thoughtful launch film',
  'aspectRatio': '9:16',
  'duration': 20,
  'style': 'Cinematic',
  'createdAt': '2026-09-16T10:00:00.000Z',
  'updatedAt': '2026-09-16T10:00:01.000Z',
  'events': [],
  'artifacts': [],
  ...config,
  'status': status,
};
