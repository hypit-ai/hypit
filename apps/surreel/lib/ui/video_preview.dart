import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import 'design.dart';

/// Plays an exported video, preserving the service's signed URL unchanged.
class VideoPreview extends StatefulWidget {
  const VideoPreview({
    super.key,
    required this.uri,
    this.aspectRatio = 16 / 10,
    this.title = 'Video preview',
    this.maxHeight = 500,
  });

  final Uri? uri;
  final double aspectRatio;
  final String title;
  final double maxHeight;

  @override
  State<VideoPreview> createState() => _VideoPreviewState();
}

class _VideoPreviewState extends State<VideoPreview> {
  VideoPlayerController? _player;
  String? _error;
  double? _dragPosition;
  int _sourceVersion = 0;
  bool _opening = false;

  bool get _externalPlayback =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.linux ||
          defaultTargetPlatform == TargetPlatform.windows);

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  @override
  void didUpdateWidget(VideoPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uri != widget.uri) unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final version = ++_sourceVersion;
    final previous = _player;
    _player = null;
    _error = null;
    _dragPosition = null;
    if (previous != null) {
      previous.removeListener(_onPlaybackChanged);
      unawaited(previous.dispose());
    }
    final uri = widget.uri;
    if (uri == null || _externalPlayback) return;

    try {
      final player = VideoPlayerController.networkUrl(
        uri,
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );
      _player = player;
      player.addListener(_onPlaybackChanged);
      await player.initialize().timeout(const Duration(seconds: 25));
      if (!mounted || version != _sourceVersion) return;
      setState(() {});
    } catch (_) {
      if (!mounted || version != _sourceVersion) return;
      setState(() {
        _error = 'Open the original file to watch or save this video.';
      });
    }
  }

  void _onPlaybackChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _togglePlayback() async {
    final player = _player;
    if (player == null || !player.value.isInitialized) return;
    try {
      if (player.value.isPlaying) {
        await player.pause();
      } else {
        if (player.value.position >= player.value.duration) {
          await player.seekTo(Duration.zero);
        }
        if (!mounted || player != _player) return;
        await player.play();
      }
    } catch (_) {
      if (mounted) _showMessage('Playback failed. Try opening the video file.');
    }
  }

  Future<void> _seek(double position) async {
    final player = _player;
    if (player == null) return;
    try {
      await player.seekTo(Duration(milliseconds: position.round()));
    } catch (_) {
      if (mounted) _showMessage('Could not seek in this video. Try again.');
    } finally {
      if (mounted && player == _player) {
        setState(() => _dragPosition = null);
      }
    }
  }

  Future<void> _open() async {
    final uri = widget.uri;
    if (uri == null || _opening) return;
    setState(() => _opening = true);
    try {
      final opened = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
        webOnlyWindowName: '_blank',
      );
      if (!opened && mounted) {
        _showMessage('The video file could not be opened.');
      }
    } catch (_) {
      if (mounted) _showMessage('The video file could not be opened.');
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.maybeOf(context)
        ?.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void dispose() {
    _sourceVersion++;
    final player = _player;
    _player = null;
    if (player != null) {
      player.removeListener(_onPlaybackChanged);
      unawaited(player.dispose());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = _player;
    final value = player?.value;
    final hasError = _error != null || value?.hasError == true;
    final ready = value?.isInitialized == true && !hasError;
    return Semantics(
      label: widget.title,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ColoredBox(
          color: StudioColors.sidebar,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  final ratio = widget.aspectRatio > 0
                      ? widget.aspectRatio
                      : 16 / 10;
                  final floor = widget.maxHeight < 400
                      ? (ready ? 160.0 : 180.0)
                      : (ready ? 260.0 : 300.0);
                  final height = (constraints.maxWidth / ratio)
                      .clamp(floor, widget.maxHeight)
                      .toDouble();
                  return SizedBox(
                    height: height,
                    width: double.infinity,
                    child: widget.uri == null
                        ? const _PlayerMessage(
                            icon: Icons.videocam_outlined,
                            title: 'No video selected',
                            message:
                                'Choose a video export to preview it here.',
                          )
                        : _externalPlayback
                        ? _PlayerMessage(
                            icon: Icons.play_circle_outline_rounded,
                            title: 'Your video is ready to watch',
                            message:
                                'Open it in your browser to play or save it.',
                            action: _openButton(),
                          )
                        : hasError
                        ? _PlayerMessage(
                            icon: Icons.play_disabled_rounded,
                            title: 'Preview unavailable',
                            message: _error ?? 'Open the original file to watch or save this video.',
                            action: _openButton(),
                          )
                        : ready
                        ? Stack(
                            fit: StackFit.expand,
                            children: [
                              Center(
                                child: AspectRatio(
                                  aspectRatio: value!.aspectRatio > 0
                                      ? value.aspectRatio
                                      : 16 / 9,
                                  child: VideoPlayer(player!),
                                ),
                              ),
                              if (value.isBuffering)
                                const Center(
                                  child: SizedBox(
                                    width: 28,
                                    height: 28,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ),
                            ],
                          )
                        : const _PlayerMessage(
                            title: 'Loading your video',
                            message: 'Preparing the preview…',
                            loading: true,
                          ),
                  );
                },
              ),
              if (ready && player != null) _controls(player),
            ],
          ),
        ),
      ),
    );
  }

  Widget _openButton() => OutlinedButton.icon(
    onPressed: _opening ? null : _open,
    icon: const Icon(Icons.open_in_new_rounded, size: 16),
    label: Text(_opening ? 'Opening…' : 'Open video file'),
  );

  Widget _controls(VideoPlayerController player) {
    final value = player.value;
    final duration = value.duration.inMilliseconds.toDouble();
    final maximum = duration > 0 ? duration : 1.0;
    final position = (_dragPosition ?? value.position.inMilliseconds.toDouble())
        .clamp(0.0, maximum);
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: StudioColors.surface,
        border: Border(top: BorderSide(color: StudioColors.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: [
            IconButton(
              key: const ValueKey('video-play'),
              tooltip: value.isPlaying ? 'Pause video' : 'Play video',
              onPressed: _togglePlayback,
              icon: Icon(
                value.isPlaying
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
                color: StudioColors.accent,
              ),
            ),
            Expanded(
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 2,
                  thumbShape: const RoundSliderThumbShape(
                    enabledThumbRadius: 5,
                  ),
                  overlayShape: const RoundSliderOverlayShape(
                    overlayRadius: 12,
                  ),
                ),
                child: Slider(
                  semanticFormatterCallback: (value) =>
                      _time(Duration(milliseconds: value.round())),
                  value: position,
                  max: maximum,
                  onChanged: duration > 0
                      ? (value) => setState(() => _dragPosition = value)
                      : null,
                  onChangeEnd: duration > 0 ? _seek : null,
                ),
              ),
            ),
            Text(
              '${_time(Duration(milliseconds: position.round()))} / ${_time(value.duration)}',
              style: const TextStyle(fontSize: 10, color: StudioColors.muted),
            ),
            IconButton(
              tooltip: 'Open video file',
              onPressed: _opening ? null : _open,
              icon: const Icon(Icons.open_in_new_rounded, size: 17),
            ),
          ],
        ),
      ),
    );
  }

  String _time(Duration value) {
    final minutes = value.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = value.inSeconds.remainder(60).toString().padLeft(2, '0');
    return value.inHours > 0
        ? '${value.inHours}:$minutes:$seconds'
        : '${value.inMinutes}:$seconds';
  }
}

class _PlayerMessage extends StatelessWidget {
  const _PlayerMessage({
    required this.title,
    required this.message,
    this.icon,
    this.loading = false,
    this.action,
  });

  final String title;
  final String message;
  final IconData? icon;
  final bool loading;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (loading)
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Icon(icon, size: 36, color: StudioColors.muted),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'SpaceGrotesk',
              fontSize: 18,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: StudioColors.muted),
          ),
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    ),
  );
}
