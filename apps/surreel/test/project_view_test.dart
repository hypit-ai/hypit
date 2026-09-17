import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:surreel/data/app_controller.dart';
import 'package:surreel/data/models.dart';
import 'package:surreel/data/surreel_api.dart';
import 'package:surreel/ui/design.dart';
import 'package:surreel/ui/project_view.dart';
import 'package:surreel/ui/video_preview.dart';

void main() {
  for (final width in [360.0, 1440.0]) {
    testWidgets('failed project can retry and stop at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _ProjectApi(_project('failed'));
      final controller = AppController(
        api: api,
        loadSettings: false,
        pollInterval: const Duration(days: 1),
      );
      addTearDown(() {
        controller.dispose();
        api.close();
      });
      controller.selectProject(api.project);
      await tester.pumpWidget(
        MaterialApp(
          theme: studioTheme(),
          home: Scaffold(
            body: ProjectView(controller: controller, onBack: () {}),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 250));

      expect(tester.takeException(), isNull);
      expect(
        find.text(
          'The video renderer could not find the required source file.',
        ),
        findsOneWidget,
      );
      final run = find.byKey(const ValueKey('project-run'));
      expect(tester.widget<FilledButton>(run).onPressed, isNotNull);
      await tester.ensureVisible(run);
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(run);
      await tester.pump(const Duration(milliseconds: 250));

      expect(api.prompts, [api.project.prompt]);
      expect(controller.selected?.status, 'running');
      expect(tester.widget<FilledButton>(run).onPressed, isNull);
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('project-revision')))
            .enabled,
        isFalse,
      );
      final stop = find.byKey(const ValueKey('project-stop'));
      await tester.ensureVisible(stop);
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(stop);
      await tester.pump(const Duration(milliseconds: 250));

      expect(api.cancelled, isTrue);
      expect(controller.selected?.status, 'cancelled');
      expect(find.text('Creation stopped'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'completed run with no export requires a revision and sends it unchanged',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = _ProjectApi(_project('completed'));
      final controller = AppController(
        api: api,
        loadSettings: false,
        pollInterval: const Duration(days: 1),
      );
      addTearDown(() {
        controller.dispose();
        api.close();
      });
      controller.selectProject(api.project);
      await tester.pumpWidget(
        MaterialApp(
          theme: studioTheme(),
          home: Scaffold(
            body: ProjectView(controller: controller, onBack: () {}),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Run finished. No video exported.'), findsOneWidget);
      final run = find.byKey(const ValueKey('project-run'));
      expect(tester.widget<FilledButton>(run).onPressed, isNull);

      final input = find.byKey(const ValueKey('project-revision'));
      await tester.ensureVisible(input);
      await tester.enterText(
        input,
        'Render and export the final video with captions.',
      );
      await tester.pump();
      expect(tester.widget<FilledButton>(run).onPressed, isNotNull);
      await tester.ensureVisible(run);
      await tester.tap(run);
      await tester.pump(const Duration(milliseconds: 250));
      expect(api.prompts, ['Render and export the final video with captions.']);
      expect(tester.takeException(), isNull);
      controller.clearSelection();
      await tester.pump();
    },
  );

  testWidgets('no video source never exposes playback controls', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: studioTheme(),
        home: const Scaffold(
          body: SizedBox(width: 320, child: VideoPreview(uri: null)),
        ),
      ),
    );
    expect(find.text('No video selected'), findsOneWidget);
    expect(find.byKey(const ValueKey('video-play')), findsNothing);
    expect(find.text('Open video file'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Linux offers the real external file and clears it when source changes',
    (tester) async {
      Widget preview(Uri? source) => MaterialApp(
        theme: studioTheme(),
        home: Scaffold(
          body: SizedBox(width: 320, child: VideoPreview(uri: source)),
        ),
      );
      await tester.pumpWidget(
        preview(
          Uri.parse('https://surreel.test/api/files/final.mp4?signature=kept'),
        ),
      );
      expect(find.text('Open video file'), findsOneWidget);
      expect(find.byKey(const ValueKey('video-play')), findsNothing);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(preview(null));
      expect(find.text('No video selected'), findsOneWidget);
      expect(find.text('Open video file'), findsNothing);
      expect(tester.takeException(), isNull);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.linux),
  );
}

Project _project(String status) => Project(
  id: 'project-1',
  title: 'A botanical skincare story with beautiful light and a very long project title',
  prompt: 'Create a warm botanical skincare film with elegant typography.',
  aspectRatio: '9:16',
  duration: 20,
  style: 'Product',
  status: status,
  createdAt: DateTime.utc(2026, 9, 16, 10),
  updatedAt: DateTime.utc(2026, 9, 16, 11),
  error: status == 'failed'
      ? 'The video renderer could not find the required source file.'
      : null,
  events: [
    AgentEvent(
      id: 'event-1',
      type: 'tool',
      message: 'Reviewing the project brief.\nPreparing the timeline.\nChecking caption placement.\nInspecting source files for the final video export.',
      createdAt: DateTime.utc(2026, 9, 16, 10, 15),
    ),
  ],
);

class _ProjectApi extends SurreelApi {
  _ProjectApi(this.project) : super(baseUrl: 'https://surreel.test');

  Project project;
  final prompts = <String>[];
  bool cancelled = false;

  @override
  Future<Project> getProject(String id) async => project;

  @override
  Future<Project> runProject(String id, {String? prompt}) async {
    prompts.add(prompt ?? '');
    return project = _project('running');
  }

  @override
  Future<Project> cancelProject(String id) async {
    cancelled = true;
    return project = _project('cancelled');
  }
}
