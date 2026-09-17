import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/app_controller.dart';
import '../data/models.dart';
import 'design.dart';
import 'video_preview.dart';

class ProjectView extends StatelessWidget {
  const ProjectView({
    super.key,
    required this.controller,
    required this.onBack,
  });

  final AppController controller;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final project = controller.selected;
      if (project == null) {
        return Center(
          child: OutlinedButton.icon(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back_rounded),
            label: const Text('Back to your workspace'),
          ),
        );
      }
      return _ProjectDetail(
        key: ValueKey(project.id),
        project: project,
        controller: controller,
        onBack: onBack,
      );
    },
  );
}

class _ProjectDetail extends StatefulWidget {
  const _ProjectDetail({
    super.key,
    required this.project,
    required this.controller,
    required this.onBack,
  });

  final Project project;
  final AppController controller;
  final VoidCallback onBack;

  @override
  State<_ProjectDetail> createState() => _ProjectDetailState();
}

class _ProjectDetailState extends State<_ProjectDetail> {
  String? _previewId;

  VideoArtifact? get _preview {
    for (final artifact in widget.project.artifacts) {
      if (artifact.id == _previewId) return artifact;
    }
    final video = widget.project.video;
    if (video != null) return video;
    for (final artifact in widget.project.artifacts.reversed) {
      if (artifact.isImage) return artifact;
    }
    return null;
  }

  Uri? _artifactUri(VideoArtifact artifact) {
    try {
      return widget.controller.api.artifactUri(artifact.url);
    } catch (_) {
      return null;
    }
  }

  Future<void> _openArtifact(VideoArtifact artifact) async {
    final uri = _artifactUri(artifact);
    if (uri == null) {
      _message(
        'This file link is unavailable. Refresh the project and try again.',
      );
      return;
    }
    try {
      final opened = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
        webOnlyWindowName: '_blank',
      );
      if (mounted && !opened) _message('This file could not be opened.');
    } catch (_) {
      if (mounted) _message('This file could not be opened.');
    }
  }

  void _message(String text) {
    ScaffoldMessenger.maybeOf(context)
        ?.showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final compact = constraints.maxWidth < 980;
      final project = widget.project;
      final output = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _output(compact),
          if (project.status == 'failed') ...[
            const SizedBox(height: 18),
            _FailurePanel(project.error),
          ],
          if (project.artifacts.isNotEmpty) ...[
            const SizedBox(height: 18),
            _artifacts(),
          ],
          const SizedBox(height: 18),
          _BriefPanel(project: project),
        ],
      );
      final activity = _ActivityPanel(
        events: project.events,
        active: project.isActive,
        busy: widget.controller.busy,
        onStop: widget.controller.cancel,
      );
      final revision = _RevisionComposer(
        project: project,
        controller: widget.controller,
      );
      return SingleChildScrollView(
        key: const ValueKey('project-scroll'),
        padding: EdgeInsets.fromLTRB(
          compact ? 20 : 36,
          28,
          compact ? 20 : 36,
          40,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1320),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _header(),
                const SizedBox(height: 28),
                if (widget.controller.error != null) ...[
                  Surface(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.info_outline_rounded,
                          color: StudioColors.error,
                          size: 19,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            widget.controller.error!,
                            style: const TextStyle(
                              fontSize: 13,
                              color: StudioColors.error,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Refresh project',
                          onPressed: widget.controller.busy
                              ? null
                              : widget.controller.refreshSelected,
                          icon: const Icon(Icons.refresh_rounded, size: 18),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                ],
                if (compact) ...[
                  output,
                  const SizedBox(height: 18),
                  revision,
                  const SizedBox(height: 18),
                  activity,
                ] else
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: output),
                      const SizedBox(width: 24),
                      SizedBox(
                        width: 330,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            activity,
                            const SizedBox(height: 18),
                            revision,
                          ],
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );

  Widget _header() {
    final project = widget.project;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          onPressed: widget.onBack,
          style: TextButton.styleFrom(
            foregroundColor: StudioColors.muted,
            padding: EdgeInsets.zero,
            alignment: Alignment.centerLeft,
          ),
          icon: const Icon(Icons.arrow_back_rounded, size: 16),
          label: const Text('Your workspace', style: TextStyle(fontSize: 12)),
        ),
        const SizedBox(height: 12),
        Text(
          project.title,
          style: Theme.of(context).textTheme.headlineMedium,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 16,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            StatusPill(project.status),
            _Meta(Icons.aspect_ratio_rounded, project.aspectRatio),
            _Meta(Icons.timer_outlined, '${project.duration}s'),
            _Meta(Icons.auto_awesome_outlined, project.style),
          ],
        ),
      ],
    );
  }

  Widget _output(bool compact) {
    final artifact = _preview;
    final uri = artifact == null ? null : _artifactUri(artifact);
    final project = widget.project;
    return Surface(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Preview',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const Spacer(),
              if (artifact != null)
                Text(
                  artifact.isVideo ? 'Video export' : 'Image preview',
                  style: const TextStyle(
                    fontSize: 10,
                    color: StudioColors.muted,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 18),
          if (artifact?.isVideo == true && uri != null)
            VideoPreview(
              uri: uri,
              aspectRatio: compact && project.aspectRatio == '9:16'
                  ? 4 / 5
                  : 16 / 10,
              title: artifact!.name,
            )
          else if (artifact?.isImage == true && uri != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: compact ? 330 : 380,
                color: StudioColors.paper,
                child: Image.network(
                  uri.toString(),
                  fit: BoxFit.contain,
                  semanticLabel: artifact!.name,
                  loadingBuilder: (context, child, progress) => progress == null
                      ? child
                      : const Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                  errorBuilder: (context, error, stack) => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Image preview unavailable. Open the file below to view it.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: StudioColors.muted),
                      ),
                    ),
                  ),
                ),
              ),
            )
          else if (artifact != null)
            const _PreviewNotice(
              title: 'This preview link is unavailable',
              message: 'Refresh the project to retrieve the latest file links.',
              icon: Icons.link_off_rounded,
            )
          else
            _EmptyOutput(project: project),
          if (artifact != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Text(
                    artifact.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: StudioColors.muted,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: () => _openArtifact(artifact),
                  icon: const Icon(Icons.open_in_new_rounded, size: 14),
                  label: const Text(
                    'Open file',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
            if (project.isCompleted && project.video == null) ...[
              const SizedBox(height: 8),
              const Text(
                'This run finished without a video export. Ask the agent to render and export a video.',
                style: TextStyle(
                  fontSize: 12,
                  color: StudioColors.muted,
                  height: 1.6,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _artifacts() => Surface(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Files', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            Text(
              '${widget.project.artifacts.length}',
              style: const TextStyle(fontSize: 12, color: StudioColors.muted),
            ),
          ],
        ),
        const SizedBox(height: 14),
        for (final artifact in widget.project.artifacts.reversed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 40,
                  decoration: BoxDecoration(
                    color: StudioColors.elevated,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    artifact.isVideo
                        ? Icons.movie_outlined
                        : artifact.isImage
                        ? Icons.image_outlined
                        : Icons.description_outlined,
                    size: 18,
                    color: StudioColors.muted,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        artifact.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        artifact.mimeType,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          color: StudioColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (artifact.isVideo || artifact.isImage)
                  IconButton(
                    tooltip: 'Preview ${artifact.name}',
                    onPressed: () => setState(() => _previewId = artifact.id),
                    icon: Icon(
                      Icons.visibility_outlined,
                      size: 18,
                      color: _preview?.id == artifact.id
                          ? StudioColors.accent
                          : StudioColors.muted,
                    ),
                  ),
                IconButton(
                  tooltip: 'Open or save ${artifact.name}',
                  onPressed: () => _openArtifact(artifact),
                  icon: const Icon(
                    Icons.open_in_new_rounded,
                    size: 17,
                    color: StudioColors.muted,
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

class _Meta extends StatelessWidget {
  const _Meta(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 14, color: StudioColors.muted),
      const SizedBox(width: 6),
      Text(
        text,
        style: const TextStyle(fontSize: 12, color: StudioColors.muted),
      ),
    ],
  );
}

class _EmptyOutput extends StatelessWidget {
  const _EmptyOutput({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) {
    final (title, message, icon) = switch (project.status) {
      'queued' => (
        'Your video is in the queue',
        'Follow the activity for updates as your agent prepares to start.',
        Icons.hourglass_top_rounded,
      ),
      'running' => (
        'Your story is taking shape',
        'Your agent is working on this brief. The first exported video will appear here.',
        Icons.auto_awesome_outlined,
      ),
      'completed' => (
        'Run finished. No video exported.',
        'Check the activity for details, or ask the agent to render and export a video.',
        Icons.movie_outlined,
      ),
      'failed' => (
        'This run needs your attention',
        'Review the error below, then retry or adjust your brief.',
        Icons.error_outline_rounded,
      ),
      'cancelled' => (
        'Creation stopped',
        'Your brief and any finished files are saved. Restart whenever you’re ready.',
        Icons.stop_circle_outlined,
      ),
      _ => (
        'Your brief is ready',
        'Start the agent to turn this idea into a video.',
        Icons.movie_creation_outlined,
      ),
    };
    return _PreviewNotice(
      title: title,
      message: message,
      icon: icon,
      active: project.isActive,
    );
  }
}

class _PreviewNotice extends StatelessWidget {
  const _PreviewNotice({
    required this.title,
    required this.message,
    required this.icon,
    this.active = false,
  });
  final String title;
  final String message;
  final IconData icon;
  final bool active;

  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(minHeight: 330),
    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 48),
    decoration: BoxDecoration(
      color: StudioColors.background,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 330),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: StudioColors.surface,
                border: Border.all(color: StudioColors.border),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(
                icon,
                size: 27,
                color: active ? StudioColors.accent : StudioColors.muted,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'SpaceGrotesk',
                fontSize: 22,
                height: 1.2,
                letterSpacing: -0.6,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                height: 1.6,
                color: StudioColors.muted,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _FailurePanel extends StatelessWidget {
  const _FailurePanel(this.error);
  final String? error;

  @override
  Widget build(BuildContext context) => Surface(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.error_outline_rounded,
              color: StudioColors.error,
              size: 18,
            ),
            SizedBox(width: 9),
            Expanded(
              child: Text(
                'The agent could not finish this run',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: StudioColors.error,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SelectableText(
          error?.trim().isNotEmpty == true ? error! : 'No error details were returned. Check the activity, then retry the brief.',
          style: const TextStyle(
            fontSize: 12,
            color: StudioColors.muted,
            height: 1.6,
          ),
        ),
      ],
    ),
  );
}

class _BriefPanel extends StatelessWidget {
  const _BriefPanel({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) => Surface(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
    child: Material(
      type: MaterialType.transparency,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 18),
          title: const Text(
            'Original brief',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          subtitle: Text(
            [
              project.style,
              if (project.format != null) project.format!,
              project.aspectRatio,
              '${project.duration} seconds',
            ].join(' · '),
            style: const TextStyle(fontSize: 11, color: StudioColors.muted),
          ),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: SelectableText(
                project.prompt,
                style: const TextStyle(
                  fontSize: 13,
                  color: StudioColors.muted,
                  height: 1.7,
                ),
              ),
            ),
            if (project.referenceUrl?.isNotEmpty == true) ...[
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: SelectableText(
                  'Reference: ${project.referenceUrl}',
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
  );
}

class _RevisionComposer extends StatefulWidget {
  const _RevisionComposer({required this.project, required this.controller});
  final Project project;
  final AppController controller;

  @override
  State<_RevisionComposer> createState() => _RevisionComposerState();
}

class _RevisionComposerState extends State<_RevisionComposer> {
  final _text = TextEditingController();

  Future<void> _submit() async {
    final prompt = _text.text.trim();
    final projectId = widget.project.id;
    await widget.controller.rerun(
      prompt.isEmpty ? widget.project.prompt : prompt,
    );
    if (mounted &&
        widget.controller.error == null &&
        widget.controller.selected?.id == projectId) {
      _text.clear();
      setState(() {});
    }
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final project = widget.project;
    final active = project.isActive || widget.controller.busy;
    final hasRevision = _text.text.trim().isNotEmpty;
    final canRestart = const [
      'failed',
      'draft',
      'cancelled',
    ].contains(project.status);
    final label = hasRevision
        ? 'Make changes'
        : switch (project.status) {
            'draft' => 'Start creating',
            'failed' => 'Retry this brief',
            'cancelled' => 'Restart creating',
            _ => 'Make changes',
          };
    return Surface(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            project.status == 'draft' ? 'Start this brief' : 'Revise this video',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('project-revision'),
            controller: _text,
            enabled: !active,
            minLines: 3,
            maxLines: 7,
            maxLength: 12000,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(fontSize: 13, height: 1.6),
            decoration: const InputDecoration(
              hintText:
                  'A stronger opening. Warmer light. A slower final shot…',
              counterText: '',
              contentPadding: EdgeInsets.all(14),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          Text(
            active
                ? 'You can send changes when this run finishes.'
                : canRestart
                ? 'Add any changes, or continue with your original brief.'
                : 'Describe what you’d like the agent to change in this project.',
            style: const TextStyle(
              fontSize: 11,
              color: StudioColors.muted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            key: const ValueKey('project-run'),
            onPressed: active || (!hasRevision && !canRestart) ? null : _submit,
            icon: widget.controller.busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.arrow_upward_rounded, size: 17),
            label: Text(label),
          ),
        ],
      ),
    );
  }
}

class _ActivityPanel extends StatefulWidget {
  const _ActivityPanel({
    required this.events,
    required this.active,
    required this.busy,
    required this.onStop,
  });
  final List<AgentEvent> events;
  final bool active;
  final bool busy;
  final Future<void> Function() onStop;

  @override
  State<_ActivityPanel> createState() => _ActivityPanelState();
}

class _ActivityPanelState extends State<_ActivityPanel> {
  final _scroll = ScrollController();
  bool _follow = true;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _followLatest();
  }

  void _onScroll() {
    if (_scroll.hasClients) _follow = _scroll.position.extentAfter < 72;
  }

  @override
  void didUpdateWidget(_ActivityPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_follow &&
        (oldWidget.events.length != widget.events.length ||
            oldWidget.events.lastOrNull?.id != widget.events.lastOrNull?.id)) {
      _followLatest();
    }
  }

  void _followLatest() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients || !_follow) return;
      if (MediaQuery.disableAnimationsOf(context)) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      } else {
        unawaited(
          _scroll.animateTo(
            _scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Surface(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Activity', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            if (widget.active)
              TextButton.icon(
                key: const ValueKey('project-stop'),
                onPressed: widget.busy ? null : widget.onStop,
                style: TextButton.styleFrom(
                  foregroundColor: StudioColors.muted,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                icon: const Icon(Icons.stop_rounded, size: 15),
                label: const Text('Stop', style: TextStyle(fontSize: 11)),
              )
            else
              Text(
                '${widget.events.length}',
                style: const TextStyle(fontSize: 11, color: StudioColors.muted),
              ),
          ],
        ),
        const SizedBox(height: 14),
        const Divider(height: 1),
        const SizedBox(height: 18),
        SizedBox(
          height: 340,
          child: widget.events.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.waves_rounded,
                          size: 28,
                          color: StudioColors.muted,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          widget.active ? 'Waiting for the first update…' : 'Activity will appear here when your agent starts.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12,
                            color: StudioColors.muted,
                            height: 1.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : Scrollbar(
                  controller: _scroll,
                  child: ListView.builder(
                    controller: _scroll,
                    primary: false,
                    padding: const EdgeInsets.only(right: 8),
                    itemCount: widget.events.length,
                    itemBuilder: (context, index) =>
                        _EventTile(event: widget.events[index]),
                  ),
                ),
        ),
      ],
    ),
  );
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});
  final AgentEvent event;

  @override
  Widget build(BuildContext context) {
    final type = event.type.toLowerCase();
    final error = type.contains('error') || type.contains('fail');
    final (icon, label) = switch (type) {
      _ when error => (Icons.error_outline_rounded, 'Needs attention'),
      _ when type.contains('tool') || type.contains('command') => (
        Icons.terminal_rounded,
        'Tool activity',
      ),
      _ when type.contains('artifact') || type.contains('output') => (
        Icons.movie_outlined,
        'Output',
      ),
      _ when type.contains('complete') || type.contains('done') => (
        Icons.check_circle_outline_rounded,
        'Finished',
      ),
      _ when type.contains('think') || type.contains('reason') => (
        Icons.auto_awesome_outlined,
        'Planning',
      ),
      _ => (Icons.bolt_outlined, 'Agent update'),
    };
    final date = event.createdAt.toLocal();
    final time =
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}:${date.second.toString().padLeft(2, '0')}';
    final detailed =
        event.message.length > 180 || '\n'.allMatches(event.message).length > 2;
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              icon,
              size: 16,
              color: error ? StudioColors.error : StudioColors.muted,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: error
                              ? StudioColors.error
                              : StudioColors.muted,
                        ),
                      ),
                    ),
                    Text(
                      time,
                      style: const TextStyle(
                        fontSize: 9,
                        color: StudioColors.muted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                if (detailed)
                  Material(
                    type: MaterialType.transparency,
                    child: Theme(
                      data: Theme.of(context)
                          .copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: const EdgeInsets.only(top: 10),
                        minTileHeight: 0,
                        dense: true,
                        title: Text(
                          event.message,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.5,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: SelectableText(
                              event.message,
                              style: const TextStyle(
                                fontSize: 11,
                                color: StudioColors.muted,
                                height: 1.6,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  Text(
                    event.message,
                    style: const TextStyle(fontSize: 12, height: 1.6),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
