import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/app_controller.dart';
import '../data/formats.dart';
import '../data/models.dart';
import '../data/socials.dart';
import 'design.dart';
import 'project_view.dart';
import 'review_deck.dart';
import 'templates.dart';

class Workspace extends StatefulWidget {
  const Workspace({super.key, required this.controller});
  final AppController controller;
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  final _brief = TextEditingController();
  final _search = TextEditingController();
  final _briefFocus = FocusNode();
  final _scroll = ScrollController();
  int _page = 0;
  int _fromPage = 0;
  bool _detail = false;
  final Set<String> _sendTargets = {'tiktok'};
  String _aspect = '9:16';
  int _duration = 20;
  String _formatId = 'talking-head';
  final Map<String, TextEditingController> _answers = {};
  String? _reference;
  String _projectFilter = 'All projects';
  String _templateFilter = 'All formats';
  AppController get c => widget.controller;
  static const _pageNames = ['Queue', 'Review', 'Socials', 'Formats'];
  static const _navIcons = [
    Icons.queue_play_next_rounded,
    Icons.swipe_rounded,
    Icons.ios_share_rounded,
    Icons.grid_view_rounded,
  ];

  @override
  void initState() {
    super.initState();
    _brief.addListener(_changed);
    _search.addListener(_changed);
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _brief.dispose();
    for (final controller in _answers.values) {
      controller.dispose();
    }
    _search.dispose();
    _briefFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  HypitFormat get _format => hypitFormat(_formatId);

  TextEditingController _fieldController(GuidedField field, int index) {
    if (index == 0) return _brief;
    return _answers.putIfAbsent(field.id, () {
      final controller = TextEditingController();
      controller.addListener(_changed);
      return controller;
    });
  }

  Map<String, String> _currentAnswers() {
    final format = _format;
    return {
      for (var index = 0; index < format.fields.length; index++)
        format.fields[index].id: _fieldController(
          format.fields[index],
          index,
        ).text.trim(),
    };
  }

  bool get _ready => _brief.text.trim().isNotEmpty;

  void _selectFormat(String id) {
    final format = hypitFormat(id);
    setState(() {
      _formatId = id;
      _aspect = format.aspectRatio;
      _duration = format.duration;
    });
  }

  void _applyAnswers(Map<String, String> answers) {
    final format = hypitFormat(_formatId);
    for (var index = 0; index < format.fields.length; index++) {
      final field = format.fields[index];
      final value = answers[field.id];
      if (value == null || value.isEmpty) continue;
      if (index == 0) continue;
      _fieldController(field, index).text = value;
    }
  }

  void _navigate(int page) {
    c.clearSelection();
    setState(() {
      _page = page;
      _detail = false;
    });
    _toTop();
    if (page != 3) unawaited(c.loadProjects());
  }

  void _toTop() {
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _newVideo() {
    _brief.clear();
    for (final controller in _answers.values) {
      controller.clear();
    }
    _reference = null;
    _formatId = hypitFormats.first.id;
    _aspect = hypitFormats.first.aspectRatio;
    _duration = hypitFormats.first.duration;
    _navigate(0);
    _briefFocus.requestFocus();
  }

  void _useTemplate(BriefTemplate template) {
    c.clearSelection();
    setState(() {
      _page = 0;
      _detail = false;
      _formatId = template.formatId;
      _brief.text = template.prompt;
      _aspect = template.aspectRatio;
      _duration = template.duration;
    });
    _applyAnswers(template.answers);
    _toTop();
    _briefFocus.requestFocus();
  }

  Future<void> _create() async {
    if (!_ready) return;
    final format = _format;
    final answers = _currentAnswers();
    await c.createAndRun(
      composeHypitBrief(
        format: format,
        answers: answers,
        aspectRatio: _aspect,
        duration: _duration,
        referenceUrl: _reference,
      ),
      _aspect,
      _duration,
      format.title,
      format: format.id,
      title: titleFromAnswers(format, answers),
      referenceUrl: _reference,
    );
    if (!mounted) return;
    setState(() {
      _detail = false;
      _page = 0;
    });
    _toTop();
  }

  void _open(Project project) {
    c.selectProject(project);
    setState(() {
      _fromPage = _page;
      _detail = true;
    });
    _toTop();
  }

  List<Project> get _inbox =>
      c.projects.where((project) => project.inReview).toList();

  List<Project> get _outbox => c.projects
      .where((project) => project.isApproved || project.isSent)
      .toList();

  Future<void> _keep(Project project) => c.setReview(project, 'approved');

  Future<void> _skip(Project project) => c.setReview(project, 'rejected');

  Future<void> _send(Project project) async {
    final destinations = _sendTargets.toList();
    if (destinations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose at least one social app.')),
      );
      return;
    }
    final caption = socialCaption(project);
    await Clipboard.setData(ClipboardData(text: caption));
    await c.setReview(project, 'sent', destinations: destinations);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Caption copied. Opening the social app. You still post the video there.',
        ),
      ),
    );
    for (final id in destinations) {
      try {
        await launchUrl(
          socialTarget(id).launchUri(caption),
          mode: LaunchMode.externalApplication,
          webOnlyWindowName: '_blank',
        );
      } catch (_) {
        // The platform tab is a handoff. The kept video stays in Socials.
      }
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) {
      final wide = MediaQuery.sizeOf(context).width >= 1050;
      return Shortcuts(
        shortcuts: const {
          SingleActivator(LogicalKeyboardKey.enter, control: true):
              _CreateIntent(),
          SingleActivator(LogicalKeyboardKey.enter, meta: true):
              _CreateIntent(),
        },
        child: Actions(
          actions: {
            _CreateIntent: CallbackAction<_CreateIntent>(
              onInvoke: (_) {
                if (_page == 0 && !_detail) unawaited(_create());
                return null;
              },
            ),
          },
          child: Scaffold(
            backgroundColor: Colors.transparent,
            body: StudioCanvas(
              child: SafeArea(
              bottom: false,
              child: Row(
                children: [
                  if (wide) _sidebar(),
                  Expanded(
                    child: Column(
                      children: [
                        _topbar(wide),
                        if (c.error != null) _errorBanner(),
                        Expanded(
                          child: _detail && c.selected != null
                              ? ProjectView(
                                  controller: c,
                                  onBack: () => _navigate(_fromPage),
                                )
                              : _page == 1
                              ? Padding(
                                  padding: EdgeInsets.fromLTRB(
                                    wide ? StudioSpace.xl : StudioSpace.md,
                                    StudioSpace.lg,
                                    wide ? StudioSpace.xl : StudioSpace.md,
                                    StudioSpace.md,
                                  ),
                                  child: Align(
                                    alignment: Alignment.topCenter,
                                    child: ConstrainedBox(
                                      constraints: const BoxConstraints(
                                        maxWidth: 1210,
                                      ),
                                      child: _reviewPage(),
                                    ),
                                  ),
                                )
                              : _page == 0 && !wide
                              ? _compactQueue()
                              : SelectionArea(
                                  child: SingleChildScrollView(
                                    key: const PageStorageKey(
                                      'workspace-scroll',
                                    ),
                                    controller: _scroll,
                                    padding: EdgeInsets.fromLTRB(
                                      wide ? StudioSpace.xl : StudioSpace.md,
                                      StudioSpace.lg,
                                      wide ? StudioSpace.xl : StudioSpace.md,
                                      StudioSpace.xl,
                                    ),
                                    child: Align(
                                      alignment: Alignment.topCenter,
                                      child: ConstrainedBox(
                                        constraints: const BoxConstraints(
                                          maxWidth: 1210,
                                        ),
                                        child: switch (_page) {
                                          2 => _socials(),
                                          3 => _templates(),
                                          _ => _queuePage(embedCta: true),
                                        },
                                      ),
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              ),
            ),
            bottomNavigationBar: wide
                ? null
                : NavigationBar(
                    backgroundColor: StudioColors.sidebar,
                    indicatorColor: StudioColors.accent.withValues(alpha: 0.14),
                    height: 68,
                    labelBehavior:
                        NavigationDestinationLabelBehavior.alwaysShow,
                    selectedIndex: _page,
                    onDestinationSelected: _navigate,
                    destinations: [
                      for (var i = 0; i < _pageNames.length; i++)
                        NavigationDestination(
                          icon: Icon(_navIcons[i], size: 21),
                          selectedIcon: Icon(
                            _navIcons[i],
                            size: 21,
                            color: StudioColors.accent,
                          ),
                          label: _pageNames[i],
                        ),
                    ],
                  ),
          ),
        ),
      );
    },
  );

  Widget _sidebar() => Container(
    width: 220,
    color: StudioColors.sidebar,
    padding: const EdgeInsets.fromLTRB(16, 22, 16, 18),
    child: _sidebarScroll(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(left: 8), child: _wordmark()),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: PressScale(
              child: FilledButton.icon(
                onPressed: _newVideo,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New video'),
              ),
            ),
          ),
          const SizedBox(height: 22),
          for (var i = 0; i < _pageNames.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Material(
                color: _page == i ? StudioColors.elevated : Colors.transparent,
                borderRadius: BorderRadius.circular(StudioSpace.control),
                child: InkWell(
                  borderRadius: BorderRadius.circular(StudioSpace.control),
                  onTap: () => _navigate(i),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 11,
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _navIcons[i],
                          size: 18,
                          color: _page == i
                              ? StudioColors.accent
                              : StudioColors.muted,
                        ),
                        const SizedBox(width: 12),
                        Text(
                          _pageNames[i],
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: _page == i
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: _page == i
                                ? StudioColors.text
                                : StudioColors.muted,
                          ),
                        ),
                        if (_navCount(i) > 0) ...[
                          const Spacer(),
                          ExcludeSemantics(
                            child: Text(
                              _navCount(i).toString(),
                              style: const TextStyle(
                                fontSize: 11,
                                color: StudioColors.muted,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const Spacer(),
          _utilityButton(Icons.tune_rounded, 'Studio connection', _connection),
          _utilityButton(Icons.help_outline_rounded, 'Getting started', _help),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 16),
          const Row(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: StudioColors.elevated,
                child: Icon(
                  Icons.person_outline_rounded,
                  color: StudioColors.muted,
                  size: 17,
                ),
              ),
              SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Personal workspace',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    'This device',
                    style: TextStyle(fontSize: 10, color: StudioColors.muted),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ),
  );
  Widget _sidebarScroll(Widget child) => LayoutBuilder(
    builder: (context, constraints) => SingleChildScrollView(
      key: const ValueKey('sidebar-scroll'),
      primary: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: constraints.maxHeight),
        child: IntrinsicHeight(child: child),
      ),
    ),
  );
  Widget _utilityButton(IconData icon, String label, VoidCallback onTap) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 16, color: StudioColors.muted),
              const SizedBox(width: 11),
              Text(
                label,
                style: const TextStyle(fontSize: 11, color: StudioColors.muted),
              ),
            ],
          ),
        ),
      );
  Widget _wordmark({double size = 29}) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      SurreelMark(size: size),
      const SizedBox(width: 10),
      Text(
        'surreel',
        style: TextStyle(
          fontFamily: 'SpaceGrotesk',
          fontSize: size,
          fontWeight: FontWeight.w600,
          letterSpacing: -1.4,
        ),
      ),
    ],
  );
  Widget _topbar(bool wide) => Container(
    height: 64,
    padding: EdgeInsets.symmetric(
      horizontal: wide ? StudioSpace.xl : StudioSpace.md,
    ),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: StudioColors.border)),
    ),
    child: Row(
      children: [
        if (wide) ...[
          const Icon(
            Icons.space_dashboard_outlined,
            size: 17,
            color: StudioColors.muted,
          ),
          const SizedBox(width: 10),
          const Text(
            'Workspace',
            style: TextStyle(fontSize: 12, color: StudioColors.muted),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text('/', style: TextStyle(color: StudioColors.border)),
          ),
          Text(
            _detail ? 'Video project' : _pageNames[_page],
            style: const TextStyle(fontSize: 12),
          ),
        ] else
          _wordmark(size: 25),
        const Spacer(),
        Tooltip(
          message: c.connected
              ? 'Manage studio connection'
              : 'Connect your studio',
          child: InkWell(
            onTap: _connection,
            borderRadius: BorderRadius.circular(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: c.connected && c.agentAvailable
                          ? StudioColors.accent
                          : StudioColors.muted,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    c.loading
                        ? 'Connecting…'
                        : c.connected
                        ? (c.agentAvailable
                              ? 'Studio online'
                              : 'Agent unavailable')
                        : 'Connect studio',
                    style: const TextStyle(
                      fontSize: 11,
                      color: StudioColors.muted,
                    ),
                  ),
                ],
              ),
            ),
            ),
          ),
        ),
        SizedBox(width: wide ? 18 : 4),
        if (wide) ...[
          Container(width: 1, height: 20, color: StudioColors.border),
          const SizedBox(width: 8),
        ],
        IconButton(
          tooltip: 'Getting started',
          onPressed: _help,
          icon: const Icon(
            Icons.help_outline_rounded,
            size: 19,
            color: StudioColors.muted,
          ),
        ),
      ],
    ),
  );

  Widget _errorBanner() => Container(
    color: StudioColors.elevated,
    padding: const EdgeInsets.fromLTRB(20, 9, 8, 9),
    child: Row(
      children: [
        const Icon(
          Icons.info_outline_rounded,
          size: 17,
          color: StudioColors.error,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            c.error!,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, color: StudioColors.error),
          ),
        ),
        TextButton(
          onPressed: _connection,
          child: const Text('Connection', style: TextStyle(fontSize: 11)),
        ),
        IconButton(
          tooltip: 'Dismiss message',
          onPressed: c.clearError,
          icon: const Icon(Icons.close, size: 16),
        ),
      ],
    ),
  );

  int _navCount(int page) {
    if (page == 0) return c.projects.where((project) => project.isActive).length;
    if (page == 1) return _inbox.length;
    if (page == 2) return _outbox.length;
    return 0;
  }

  Widget _pageTitle(String text) {
    final compact = MediaQuery.sizeOf(context).width < 600;
    return Text(
      text,
      style: compact
          ? Theme.of(context).textTheme.headlineMedium
          : Theme.of(context).textTheme.displayMedium,
    );
  }

  Widget _compactQueue() => Column(
    children: [
      Expanded(
        child: SelectionArea(
          child: SingleChildScrollView(
            key: const PageStorageKey('workspace-scroll'),
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(
              StudioSpace.md,
              StudioSpace.md,
              StudioSpace.md,
              StudioSpace.md,
            ),
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1210),
                child: _queuePage(embedCta: false),
              ),
            ),
          ),
        ),
      ),
      _stickyQueueBar(),
    ],
  );

  Widget _stickyQueueBar() => Material(
    color: StudioColors.sidebar,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        StudioSpace.md,
        StudioSpace.sm,
        StudioSpace.md,
        StudioSpace.sm,
      ),
      child: PressScale(
        enabled: _ready,
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: const Key('create-video'),
            onPressed: _ready ? _create : null,
            iconAlignment: IconAlignment.end,
            icon: const Icon(Icons.arrow_forward_rounded, size: 17),
            label: const Text('Queue video'),
          ),
        ),
      ),
    ),
  );

  Widget _queuePage({required bool embedCta}) => LayoutBuilder(
    builder: (context, constraints) {
      final rail = constraints.maxWidth >= 860;
      final split = constraints.maxWidth >= 980;
      final composer = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (rail)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 220, child: _formatRail(expand: true)),
                const SizedBox(width: StudioSpace.lg),
                Expanded(child: _composer(embedCta: embedCta)),
              ],
            )
          else ...[
            _formatRail(expand: false),
            const SizedBox(height: StudioSpace.md),
            _composer(embedCta: embedCta),
          ],
          const SizedBox(height: StudioSpace.md),
          Wrap(
            spacing: StudioSpace.sm,
            runSpacing: 6,
            children: [
              _suggestion('A product worth pausing for', briefTemplates[1]),
              _suggestion('Something that feels human', briefTemplates[0]),
              _suggestion('An idea, brought to life', briefTemplates[4]),
            ],
          ),
        ],
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _pageTitle('Queue'),
          const SizedBox(height: StudioSpace.sm),
          const Text(
            'Start several films. They can render at the same time.',
            style: TextStyle(fontSize: 15, color: StudioColors.muted),
          ),
          const SizedBox(height: StudioSpace.lg),
          if (split)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: composer),
                const SizedBox(width: StudioSpace.lg),
                SizedBox(width: 360, child: _queueList()),
              ],
            )
          else ...[
            composer,
            const SizedBox(height: StudioSpace.lg),
            _queueList(),
          ],
        ],
      );
    },
  );

  Widget _formatRail({required bool expand}) {
    final chips = [
      for (final format in hypitFormats)
        FormatChip(
          key: Key('format-${format.id}'),
          label: format.chip,
          selected: format.id == _formatId,
          onTap: () => _selectFormat(format.id),
          expand: expand,
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Format', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        if (expand)
          Column(
            children: [
              for (final chip in chips)
                Padding(
                  padding: const EdgeInsets.only(bottom: StudioSpace.xs),
                  child: chip,
                ),
            ],
          )
        else if (MediaQuery.sizeOf(context).width < 600)
          SizedBox(
            height: StudioSpace.touch,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: chips.length,
              separatorBuilder: (_, _) => const SizedBox(width: StudioSpace.sm),
              itemBuilder: (context, index) => chips[index],
            ),
          )
        else
          Wrap(
            spacing: StudioSpace.sm,
            runSpacing: StudioSpace.sm,
            children: chips,
          ),
      ],
    );
  }

  Widget _composer({required bool embedCta}) {
    final format = _format;
    return Surface(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 20, 22, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  format.title,
                  style: const TextStyle(
                    fontFamily: 'SpaceGrotesk',
                    fontSize: 20,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  format.subtitle,
                  style: const TextStyle(
                    fontSize: 13,
                    color: StudioColors.muted,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  format.playbook.split('/').last,
                  style: const TextStyle(
                    fontSize: 11,
                    color: StudioColors.hint,
                  ),
                ),
              ],
            ),
          ),
          for (var index = 0; index < format.fields.length; index++)
            _guidedField(format.fields[index], index),
          const SizedBox(height: 8),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(14),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final options = Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _select<String>(
                      'Aspect ratio',
                      Icons.crop_portrait_rounded,
                      _aspect,
                      const ['9:16', '16:9', '1:1'],
                      (v) => v,
                      (v) => setState(() => _aspect = v),
                    ),
                    _select<int>(
                      'Duration',
                      Icons.timer_outlined,
                      _duration,
                      const [15, 20, 30, 45, 60],
                      (v) => '$v sec',
                      (v) => setState(() => _duration = v),
                    ),
                    Tooltip(
                      message: 'Add a reference video or inspiration URL',
                      child: OutlinedButton.icon(
                        onPressed: _referenceDialog,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: StudioSpace.md,
                            vertical: 12,
                          ),
                          minimumSize: const Size(0, StudioSpace.touch),
                        ),
                        icon: Icon(
                          _reference == null
                              ? Icons.add_link_rounded
                              : Icons.link_rounded,
                          size: 16,
                        ),
                        label: Text(
                          _reference == null ? 'Reference' : 'Reference added',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    ),
                  ],
                );
                final create = PressScale(
                  enabled: _ready,
                  child: FilledButton.icon(
                    key: const Key('create-video'),
                    onPressed: _ready ? _create : null,
                    iconAlignment: IconAlignment.end,
                    icon: const Icon(Icons.arrow_forward_rounded, size: 17),
                    label: const Text('Queue video'),
                  ),
                );
                if (!embedCta) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      options,
                      const SizedBox(height: StudioSpace.sm),
                      const Text(
                        'The agent will read this format skill first.',
                        style: TextStyle(
                          fontSize: 12,
                          color: StudioColors.muted,
                        ),
                      ),
                    ],
                  );
                }
                if (constraints.maxWidth > 830) {
                  return Row(
                    children: [
                      Expanded(child: options),
                      const SizedBox(width: StudioSpace.md),
                      create,
                    ],
                  );
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    options,
                    const SizedBox(height: StudioSpace.md),
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'The agent will read this format skill first.',
                            style: TextStyle(
                              fontSize: 12,
                              color: StudioColors.muted,
                            ),
                          ),
                        ),
                        const SizedBox(width: StudioSpace.md),
                        create,
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _guidedField(GuidedField field, int index) {
    final primary = index == 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 14, 22, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              field.label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          TextField(
            key: primary ? const Key('brief-input') : Key('field-${field.id}'),
            controller: _fieldController(field, index),
            focusNode: primary ? _briefFocus : null,
            minLines: primary
                ? (MediaQuery.sizeOf(context).width < 600 ? 2 : 3)
                : 2,
            maxLines: field.maxLines,
            maxLength: primary ? 6000 : 1200,
            style: TextStyle(
              fontSize: primary ? 15 : 14,
              height: 1.55,
              color: StudioColors.text,
            ),
            decoration: InputDecoration(
              hintText: field.hint,
              hintStyle: const TextStyle(
                fontSize: 14,
                height: 1.5,
                color: StudioColors.hint,
              ),
              filled: true,
              fillColor: StudioColors.paper,
              counterText: '',
            ),
          ),
        ],
      ),
    );
  }
  Widget _select<T>(
    String label,
    IconData icon,
    T value,
    List<T> values,
    String Function(T) format,
    ValueChanged<T> onChanged,
  ) => Semantics(
    label: label,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: StudioColors.background,
        border: Border.all(color: StudioColors.border),
        borderRadius: BorderRadius.circular(StudioSpace.input),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: StudioColors.muted),
          const SizedBox(width: 7),
          DropdownButtonHideUnderline(
            child: DropdownButton<T>(
              value: value,
              isDense: false,
              dropdownColor: StudioColors.elevated,
              borderRadius: BorderRadius.circular(10),
              icon: const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 14,
                  color: StudioColors.muted,
                ),
              ),
              style: const TextStyle(
                fontFamily: 'DMSans',
                fontSize: 11,
                color: StudioColors.text,
              ),
              items: [
                for (final item in values)
                  DropdownMenuItem(value: item, child: Text(format(item))),
              ],
              onChanged: (next) {
                if (next != null) onChanged(next);
              },
            ),
          ),
        ],
      ),
    ),
  );
  Widget _suggestion(String text, BriefTemplate template) => Semantics(
    button: true,
    label: text,
    excludeSemantics: true,
    child: ActionChip(
      onPressed: () => _useTemplate(template),
      side: BorderSide.none,
      backgroundColor: Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 5),
      avatar: const Icon(
        Icons.subdirectory_arrow_right_rounded,
        size: 13,
        color: StudioColors.muted,
      ),
      label: Text(
        text,
        style: const TextStyle(fontSize: 10, color: StudioColors.muted),
      ),
    ),
  );
  Widget _templateGrid(List<BriefTemplate> items, {bool home = false}) =>
      LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          if (home && width < 600) {
            return SizedBox(
              height: 276,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 13),
                itemBuilder: (context, i) => SizedBox(
                  width: width * .82,
                  child: TemplateCard(
                    template: items[i],
                    onTap: () => _useTemplate(items[i]),
                    height: 276,
                  ),
                ),
              ),
            );
          }
          final columns = width > 790
              ? 3
              : width > 490
              ? 2
              : 1;
          final cardWidth = (width - 16 * (columns - 1)) / columns;
          return Wrap(
            spacing: 16,
            runSpacing: 20,
            children: [
              for (final item in items)
                SizedBox(
                  width: cardWidth,
                  child: TemplateCard(
                    template: item,
                    onTap: () => _useTemplate(item),
                    height: home ? 255 : 300,
                  ),
                ),
            ],
          );
        },
      );

  Widget _queueList() {
    final query = _search.text.toLowerCase();
    final projects = c.projects
        .where(
          (p) =>
              p.title.toLowerCase().contains(query) &&
              (_projectFilter == 'All projects' ||
                  _projectFilter == 'In progress' && p.isActive ||
                  _projectFilter == 'Completed' && p.isCompleted),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('In the pipeline', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: StudioSpace.sm),
        const Text(
          'Search by title. Filter by what is still running.',
          style: TextStyle(color: StudioColors.muted),
        ),
        const SizedBox(height: StudioSpace.lg),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 370),
          child: TextField(
            key: const Key('project-search'),
            controller: _search,
            decoration: const InputDecoration(
              hintText: 'Search your projects',
              prefixIcon: Icon(Icons.search, size: 19),
              contentPadding: EdgeInsets.all(14),
            ),
          ),
        ),
        const SizedBox(height: StudioSpace.md),
        Wrap(
          spacing: StudioSpace.sm,
          runSpacing: StudioSpace.sm,
          children: [
            for (final filter in ['All projects', 'In progress', 'Completed'])
              ChoiceChip(
                label: Text(filter),
                selected: filter == _projectFilter,
                onSelected: (_) => setState(() => _projectFilter = filter),
              ),
          ],
        ),
        const SizedBox(height: StudioSpace.lg),
        if (c.loading) const LinearProgressIndicator(minHeight: 1),
        if (projects.isEmpty)
          _emptyState(
            Icons.movie_filter_outlined,
            c.projects.isEmpty
                ? 'Your first film starts here.'
                : 'No projects match this view.',
            c.projects.isEmpty
                ? 'Give your idea a brief. We’ll give it a place to grow.'
                : 'Try another title or choose a different filter.',
            c.projects.isEmpty ? 'Create a video' : 'Clear filters',
            () {
              if (c.projects.isEmpty) {
                _newVideo();
              } else {
                _search.clear();
                setState(() => _projectFilter = 'All projects');
              }
            },
          )
        else
          for (final project in projects) _projectRow(project),
      ],
    );
  }

  Widget _projectRow(Project project) {
    final duration = project.duration;
    final aspect = project.aspectRatio;
    return Padding(
      padding: const EdgeInsets.only(bottom: StudioSpace.md),
      child: Material(
        color: StudioColors.surface,
        borderRadius: BorderRadius.circular(StudioSpace.card),
        child: InkWell(
          onTap: () => _open(project),
          borderRadius: BorderRadius.circular(StudioSpace.card),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 58,
                  decoration: BoxDecoration(
                    color: StudioColors.elevated,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    project.video == null
                        ? Icons.movie_creation_outlined
                        : Icons.play_circle_outline_rounded,
                    size: 24,
                    color: project.video == null
                        ? StudioColors.muted
                        : StudioColors.accent,
                  ),
                ),
                const SizedBox(width: 17),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        project.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '$aspect · $duration sec · ${project.style}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: StudioColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                StatusPill(project.status),
                if (MediaQuery.sizeOf(context).width > 600) ...[
                  const SizedBox(width: 18),
                  const Icon(
                    Icons.north_east,
                    size: 16,
                    color: StudioColors.muted,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _reviewPage() {
    final inbox = _inbox;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _pageTitle('Review'),
        const SizedBox(height: StudioSpace.sm),
        const Text(
          'Keep a finished film for socials. Skip the rest.',
          style: TextStyle(color: StudioColors.muted),
        ),
        const SizedBox(height: StudioSpace.lg),
        if (inbox.isEmpty)
          Expanded(
            child: _emptyState(
              Icons.swipe_rounded,
              'Nothing to review.',
              'Queued films land here when the video is ready.',
              'Back to the queue',
              () => _navigate(0),
            ),
          )
        else
          Expanded(
            child: ReviewDeck(
              projects: inbox,
              uriFor: (project) {
                final video = project.video;
                if (video == null) return null;
                try {
                  return c.api.artifactUri(video.url);
                } catch (_) {
                  return null;
                }
              },
              onKeep: (project) => unawaited(_keep(project)),
              onSkip: (project) => unawaited(_skip(project)),
            ),
          ),
      ],
    );
  }

  Widget _socials() {
    final outbox = _outbox;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _pageTitle('Socials'),
        const SizedBox(height: StudioSpace.sm),
        const Text(
          'Copy the caption and open the app. Surreel does not post for you.',
          style: TextStyle(color: StudioColors.muted),
        ),
        const SizedBox(height: StudioSpace.md),
        Wrap(
          spacing: StudioSpace.sm,
          runSpacing: StudioSpace.sm,
          children: [
            for (final target in socialTargets)
              FilterChip(
                label: Text(target.label),
                selected: _sendTargets.contains(target.id),
                onSelected: (selected) => setState(() {
                  if (selected) {
                    _sendTargets.add(target.id);
                  } else {
                    _sendTargets.remove(target.id);
                  }
                }),
              ),
          ],
        ),
        const SizedBox(height: StudioSpace.lg),
        if (outbox.isEmpty)
          _emptyState(
            Icons.ios_share_rounded,
            'Make something worth keeping.',
            'Kept films wait here until you send the caption to a social app.',
            'Review the stack',
            () => _navigate(1),
          )
        else
          for (final project in outbox) _socialRow(project),
      ],
    );
  }

  Widget _socialRow(Project project) {
    final sent = project.isSent;
    final phone = MediaQuery.sizeOf(context).width < 600;
    final send = !sent
        ? PressScale(
            child: FilledButton(
              key: Key('send-${project.id}'),
              onPressed: () => unawaited(_send(project)),
              child: const Text('Send'),
            ),
          )
        : null;
    final actions = Row(
      children: [
        if (project.video != null)
          IconButton(
            tooltip: 'Open output',
            onPressed: () => _openArtifact(project.video!),
            icon: const Icon(Icons.open_in_new, size: 19),
          ),
        IconButton(
          tooltip: 'Open project',
          onPressed: () => _open(project),
          icon: const Icon(Icons.movie_edit, size: 20),
        ),
      ],
    );
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          project.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          sent
              ? 'Opened ${project.destinations.map(socialTarget).map((item) => item.label).join(', ')}'
              : 'Kept. Ready to send.',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 12,
            color: StudioColors.muted,
          ),
        ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: StudioSpace.md),
      child: Surface(
        padding: const EdgeInsets.all(StudioSpace.md),
        child: phone
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(
                        sent
                            ? Icons.check_circle_outline_rounded
                            : Icons.ios_share_rounded,
                        color: StudioColors.accent,
                        size: 28,
                      ),
                      const SizedBox(width: StudioSpace.md),
                      Expanded(child: copy),
                      actions,
                    ],
                  ),
                  if (send != null) ...[
                    const SizedBox(height: StudioSpace.md),
                    SizedBox(width: double.infinity, child: send),
                  ],
                ],
              )
            : Row(
                children: [
                  Icon(
                    sent
                        ? Icons.check_circle_outline_rounded
                        : Icons.ios_share_rounded,
                    color: StudioColors.accent,
                    size: 28,
                  ),
                  const SizedBox(width: StudioSpace.md),
                  Expanded(child: copy),
                  actions,
                  if (send != null) ...[
                    const SizedBox(width: StudioSpace.sm),
                    send,
                  ],
                ],
              ),
      ),
    );
  }

  Future<void> _openArtifact(VideoArtifact artifact) async {
    try {
      final opened = await launchUrl(
        c.api.artifactUri(artifact.url),
        mode: LaunchMode.externalApplication,
        webOnlyWindowName: '_blank',
      );
      if (!opened) throw StateError('Unable to open');
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not open this output. Check your studio connection and try again.',
            ),
          ),
        );
      }
    }
  }

  Widget _templates() {
    final items = briefTemplates
        .where(
          (t) =>
              _templateFilter == 'All formats' ||
              _templateFilter == 'Creators' &&
                  ['CREATOR', 'EDITORIAL'].contains(t.category) ||
              _templateFilter == 'Products' &&
                  ['PRODUCT', 'MOTION'].contains(t.category) ||
              _templateFilter == 'Film & music' &&
                  ['CINEMATIC', 'MUSIC'].contains(t.category),
        )
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _pageTitle('Start from a format.'),
        const SizedBox(height: StudioSpace.sm),
        const Text(
          'Each card fills the questions that playbook needs.',
          style: TextStyle(color: StudioColors.muted),
        ),
        const SizedBox(height: StudioSpace.lg),
        Wrap(
          spacing: StudioSpace.sm,
          runSpacing: StudioSpace.sm,
          children: [
            for (final filter in [
              'All formats',
              'Creators',
              'Products',
              'Film & music',
            ])
              ChoiceChip(
                label: Text(filter),
                selected: filter == _templateFilter,
                onSelected: (_) => setState(() => _templateFilter = filter),
              ),
          ],
        ),
        const SizedBox(height: StudioSpace.lg),
        _templateGrid(items),
        const SizedBox(height: StudioSpace.lg),
        const Text(
          'Photography is illustrative. Each card starts a Hypit format and its guided brief.',
          style: TextStyle(fontSize: 11, color: StudioColors.muted),
        ),
      ],
    );
  }

  Widget _emptyState(
    IconData icon,
    String title,
    String subtitle,
    String action,
    VoidCallback onPressed,
  ) => Surface(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 52),
    child: Center(
      child: Column(
        children: [
          Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(
              color: StudioColors.elevated,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(icon, color: StudioColors.accent, size: 29),
          ),
          const SizedBox(height: 24),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 9),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(color: StudioColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 24),
          PressScale(
            child: FilledButton(onPressed: onPressed, child: Text(action)),
          ),
        ],
      ),
    ),
  );

  Future<void> _referenceDialog() async {
    final input = TextEditingController(text: _reference);
    String? error;
    final result = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('A point of reference'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Share a public video or inspiration link. Add what you like about it to your brief.',
                  style: TextStyle(color: StudioColors.muted, fontSize: 13),
                ),
                const SizedBox(height: 20),
                TextField(
                  autofocus: true,
                  controller: input,
                  keyboardType: TextInputType.url,
                  decoration: InputDecoration(
                    labelText: 'Reference URL',
                    hintText: 'https://…',
                    errorText: error,
                  ),
                ),
              ],
            ),
          ),
          actions: [
            if (_reference != null)
              TextButton(
                onPressed: () => Navigator.pop(context, ''),
                child: const Text('Remove'),
              ),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final value = input.text.trim();
                final uri = Uri.tryParse(value);
                if (uri == null ||
                    !['http', 'https'].contains(uri.scheme) ||
                    uri.host.isEmpty ||
                    uri.userInfo.isNotEmpty) {
                  setDialog(
                    () => error = 'Enter a valid public http or https URL.',
                  );
                  return;
                }
                Navigator.pop(context, value);
              },
              child: const Text('Add reference'),
            ),
          ],
        ),
      ),
    );
    input.dispose();
    if (mounted && result != null) {
      setState(() => _reference = result.isEmpty ? null : result);
    }
  }

  Future<void> _connection() async {
    final address = TextEditingController(text: c.api.baseUrl);
    final token = TextEditingController(text: c.api.token);
    bool saving = false;
    String? message;
    await showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('Connect your studio'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Use the address of your running Surreel studio. It needs to be reachable from this device.',
                  style: TextStyle(color: StudioColors.muted, fontSize: 13),
                ),
                const SizedBox(height: 22),
                TextField(
                  controller: address,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'Studio address',
                    hintText: 'http://127.0.0.1:8787',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: token,
                  obscureText: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: const InputDecoration(
                    labelText: 'Access token (if required)',
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Your address is saved on this device. Access tokens are kept for this session only.',
                  style: TextStyle(fontSize: 11, color: StudioColors.muted),
                ),
                if (message != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Text(
                      message!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: StudioColors.error,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      setDialog(() {
                        saving = true;
                        message = null;
                      });
                      await c.configureConnection(
                        address.text.trim(),
                        token.text.trim(),
                      );
                      if (!context.mounted) return;
                      if (c.connected) {
                        Navigator.pop(context);
                      } else {
                        setDialog(() {
                          saving = false;
                          message =
                              c.error ?? 'Could not connect to this studio.';
                        });
                      }
                    },
              child: Text(saving ? 'Connecting…' : 'Connect studio'),
            ),
          ],
        ),
      ),
    );
    address.dispose();
    token.dispose();
  }

  void _help() => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('From an idea to a first take.'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Pick a Hypit format',
              style: TextStyle(
                color: StudioColors.accent,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Talking-head, narration, presenter, ranking, drama, interview, or podcast. Each one is a playbook the agent already knows.',
            ),
            SizedBox(height: 20),
            Text(
              'Queue one or more videos',
              style: TextStyle(
                color: StudioColors.accent,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'They can render at the same time. Stay on the queue and start the next brief.',
            ),
            SizedBox(height: 20),
            Text(
              'Swipe, then send',
              style: TextStyle(
                color: StudioColors.accent,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Keep a finished film for socials. Send copies the caption and opens TikTok, Instagram, YouTube, or X. You still post the file there.',
            ),
          ],
        ),
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Let’s make something'),
        ),
      ],
    ),
  );
}

class _CreateIntent extends Intent {
  const _CreateIntent();
}
