import 'package:flutter/material.dart';

import '../data/models.dart';
import 'design.dart';
import 'video_preview.dart';

class ReviewDeck extends StatefulWidget {
  const ReviewDeck({
    super.key,
    required this.projects,
    required this.uriFor,
    required this.onKeep,
    required this.onSkip,
  });

  final List<Project> projects;
  final Uri? Function(Project project) uriFor;
  final ValueChanged<Project> onKeep;
  final ValueChanged<Project> onSkip;

  @override
  State<ReviewDeck> createState() => _ReviewDeckState();
}

class _ReviewDeckState extends State<ReviewDeck> {
  double _dx = 0;
  bool _leaving = false;

  Project? get _current =>
      widget.projects.isEmpty ? null : widget.projects.first;

  void _nudge(DragUpdateDetails details) {
    if (_leaving || _current == null) return;
    setState(() => _dx += details.delta.dx);
  }

  void _settle(DragEndDetails details) {
    if (_leaving || _current == null) return;
    final speed = details.velocity.pixelsPerSecond.dx.abs() / 1000;
    final flicked = speed > 0.11 && _dx.abs() > 24;
    if (_dx.abs() > 108 || flicked) {
      final keep = flicked
          ? details.velocity.pixelsPerSecond.dx > 0
          : _dx > 0;
      _decide(keep);
    } else {
      setState(() => _dx = 0);
    }
  }

  void _decide(bool keep) {
    final project = _current;
    if (project == null || _leaving) return;
    setState(() {
      _leaving = true;
      _dx = keep ? 420 : -420;
    });
    Future<void>.delayed(StudioMotion.of(context, StudioMotion.short), () {
      if (!mounted) return;
      setState(() {
        _dx = 0;
        _leaving = false;
      });
      if (keep) {
        widget.onKeep(project);
      } else {
        widget.onSkip(project);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final stack = widget.projects.take(3).toList();
    if (stack.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        Expanded(
          child: GestureDetector(
            onHorizontalDragUpdate: _nudge,
            onHorizontalDragEnd: _settle,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (var index = stack.length - 1; index >= 0; index--)
                  _card(stack[index], index),
              ],
            ),
          ),
        ),
        const SizedBox(height: StudioSpace.md),
        Row(
          children: [
            Expanded(
              child: PressScale(
                enabled: !_leaving,
                child: OutlinedButton(
                  key: const Key('skip-review'),
                  onPressed: _leaving ? null : () => _decide(false),
                  child: const Text('Skip'),
                ),
              ),
            ),
            const SizedBox(width: StudioSpace.md),
            Expanded(
              child: PressScale(
                enabled: !_leaving,
                child: FilledButton(
                  key: const Key('keep-review'),
                  onPressed: _leaving ? null : () => _decide(true),
                  child: const Text('Keep'),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _card(Project project, int index) {
    final front = index == 0;
    final shift = front ? _dx : 0.0;
    final lean = (shift / 18).clamp(-10.0, 10.0);
    final depth = index * 10.0;
    final keep = shift > 36;
    final skip = shift < -36;
    final phone = MediaQuery.sizeOf(context).width < 600;
    return Positioned.fill(
      child: Align(
        alignment: Alignment.center,
        child: Transform.translate(
          offset: Offset(shift, depth),
          child: Transform.rotate(
            angle: lean * 0.012,
            child: Transform.scale(
              scale: 1 - index * 0.045,
              child: Opacity(
                opacity: front ? 1 : 0.72,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Material(
                    color: StudioColors.surface,
                    borderRadius: BorderRadius.circular(StudioSpace.card),
                    child: Padding(
                      padding: const EdgeInsets.all(StudioSpace.md),
                      child: Column(
                        children: [
                          Expanded(
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                VideoPreview(
                                  uri: widget.uriFor(project),
                                  aspectRatio: _ratio(project.aspectRatio),
                                  title: project.title,
                                  maxHeight: phone ? 220 : 340,
                                ),
                                if (front && (keep || skip))
                                  Align(
                                    alignment: keep
                                        ? Alignment.topLeft
                                        : Alignment.topRight,
                                    child: _stamp(keep ? 'KEEP' : 'SKIP', keep),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              project.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '${project.aspectRatio} · ${project.duration} sec · ${project.style}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: StudioColors.muted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _stamp(String label, bool keep) => Padding(
    padding: const EdgeInsets.all(14),
    child: DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(
          color: keep ? StudioColors.accent : StudioColors.error,
          width: 2,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'SpaceGrotesk',
            fontSize: 18,
            letterSpacing: 1.4,
            color: keep ? StudioColors.accent : StudioColors.error,
          ),
        ),
      ),
    ),
  );

  double _ratio(String aspect) {
    final parts = aspect.split(':');
    if (parts.length != 2) return 9 / 16;
    final width = double.tryParse(parts[0]);
    final height = double.tryParse(parts[1]);
    if (width == null || height == null || height == 0) return 9 / 16;
    return width / height;
  }
}
