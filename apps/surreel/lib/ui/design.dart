/* Hallmark · genre: atmospheric · macrostructure: Workbench · design-system: design.md · designed-as-app
 * theme: Night lime · fonts: Space Grotesk + DM Sans · nav: N9 · enrichment: none
 * Hallmark · pre-emit critique: P4 H4 E5 S5 R5 V3
 */

import 'package:flutter/material.dart';

abstract final class StudioColors {
  static const paper = Color(0xFF111711);
  static const background = paper;
  static const sidebar = Color(0xFF0B0F0B);
  static const surface = Color(0xFF1C231C);
  static const elevated = Color(0xFF283028);
  static const border = Color(0xFF394239);
  static const text = Color(0xFFEDF3EA);
  static const muted = Color(0xFF9FB09F);
  static const hint = Color(0xFF7E897E);
  static const accent = Color(0xFFA9D750);
  static const accentInk = Color(0xFF071B06);
  static const error = Color(0xFFEEB3A7);
  static const bloom = Color(0x2EA9D750);
}

abstract final class StudioSpace {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 40.0;
  static const control = 10.0;
  static const input = 8.0;
  static const card = 14.0;
  static const touch = 48.0;
}

abstract final class StudioMotion {
  static const Duration short = Duration(milliseconds: 180);
  static const Duration press = Duration(milliseconds: 160);
  static const Curve enter = Cubic(0.16, 1, 0.3, 1);
  static const Curve leave = Cubic(0.7, 0, 0.84, 0);

  static Duration of(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;
}

/// Press feedback for primary actions. Scale only; no layout shift.
class PressScale extends StatefulWidget {
  const PressScale({super.key, required this.child, this.enabled = true});

  final Widget child;
  final bool enabled;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  var _pressed = false;

  void _set(bool value) {
    if (!widget.enabled || _pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: widget.enabled ? (_) => _set(true) : null,
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: StudioMotion.of(context, StudioMotion.press),
        curve: StudioMotion.enter,
        child: widget.child,
      ),
    );
  }
}

ThemeData studioTheme() {
  const scheme = ColorScheme.dark(
    primary: StudioColors.accent,
    onPrimary: StudioColors.accentInk,
    surface: StudioColors.surface,
    onSurface: StudioColors.text,
    outline: StudioColors.border,
    error: StudioColors.error,
    onError: StudioColors.accentInk,
  );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: StudioColors.paper,
    fontFamily: 'DMSans',
    textTheme: const TextTheme(
      displayLarge: TextStyle(
        fontFamily: 'SpaceGrotesk',
        fontSize: 40,
        height: 1.08,
        fontWeight: FontWeight.w500,
        letterSpacing: -1.6,
      ),
      displayMedium: TextStyle(
        fontFamily: 'SpaceGrotesk',
        fontSize: 32,
        height: 1.1,
        fontWeight: FontWeight.w500,
        letterSpacing: -1.1,
      ),
      headlineMedium: TextStyle(
        fontFamily: 'SpaceGrotesk',
        fontSize: 24,
        height: 1.15,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.7,
      ),
      titleLarge: TextStyle(
        fontFamily: 'SpaceGrotesk',
        fontSize: 22,
        height: 1.2,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.4,
      ),
      titleMedium: TextStyle(
        fontFamily: 'SpaceGrotesk',
        fontSize: 16,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.2,
      ),
      bodyLarge: TextStyle(fontSize: 15, height: 1.55),
      bodyMedium: TextStyle(fontSize: 13, height: 1.5),
      bodySmall: TextStyle(fontSize: 12, height: 1.45),
    ).apply(bodyColor: StudioColors.text, displayColor: StudioColors.text),
    dividerColor: StudioColors.border,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: StudioColors.paper,
      hintStyle: const TextStyle(color: StudioColors.hint, fontSize: 14),
      contentPadding: const EdgeInsets.all(14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StudioSpace.input),
        borderSide: const BorderSide(color: StudioColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StudioSpace.input),
        borderSide: const BorderSide(color: StudioColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StudioSpace.input),
        borderSide: const BorderSide(color: StudioColors.accent),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: StudioColors.accent,
        foregroundColor: StudioColors.accentInk,
        minimumSize: const Size(StudioSpace.touch, StudioSpace.touch),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        textStyle: const TextStyle(
          fontFamily: 'DMSans',
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(StudioSpace.control),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: StudioColors.text,
        side: const BorderSide(color: StudioColors.border),
        minimumSize: const Size(StudioSpace.touch, StudioSpace.touch),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        textStyle: const TextStyle(fontFamily: 'DMSans', fontSize: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(StudioSpace.control),
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(StudioSpace.touch, StudioSpace.touch),
        tapTargetSize: MaterialTapTargetSize.padded,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: StudioColors.muted,
        textStyle: const TextStyle(fontFamily: 'DMSans', fontSize: 12),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.transparent,
      selectedColor: StudioColors.elevated,
      side: const BorderSide(color: StudioColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(StudioSpace.control),
      ),
      labelStyle: const TextStyle(fontFamily: 'DMSans', fontSize: 12),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: StudioColors.sidebar,
      indicatorColor: Color(0x29A9D750),
      height: 68,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: StudioColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(StudioSpace.card),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: StudioColors.elevated,
      contentTextStyle: const TextStyle(
        color: StudioColors.text,
        fontFamily: 'DMSans',
      ),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(StudioSpace.control),
      ),
    ),
  );
}

class StudioCanvas extends StatelessWidget {
  const StudioCanvas({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: StudioColors.paper,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const IgnorePointer(child: _Bloom()),
          child,
        ],
      ),
    );
  }
}

class _Bloom extends StatelessWidget {
  const _Bloom();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(1.05, -0.85),
          radius: 0.9,
          colors: [StudioColors.bloom, Color(0x00111711)],
        ),
      ),
    );
  }
}

class SurreelMark extends StatelessWidget {
  const SurreelMark({
    super.key,
    this.size = 32,
    this.color = StudioColors.accent,
  });
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(painter: _MarkPainter(color)),
  );
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 32, size.height / 32);
    final paint = Paint()..color = color;
    final first = Path()
      ..moveTo(9, 3)
      ..lineTo(29, 3)
      ..lineTo(23, 13)
      ..lineTo(10, 13)
      ..lineTo(6, 20)
      ..lineTo(0, 20)
      ..close();
    final second = Path()
      ..moveTo(9, 19)
      ..lineTo(22, 19)
      ..lineTo(26, 12)
      ..lineTo(32, 12)
      ..lineTo(23, 29)
      ..lineTo(3, 29)
      ..close();
    canvas.drawPath(first, paint);
    canvas.drawPath(second, paint);
  }

  @override
  bool shouldRepaint(_MarkPainter oldDelegate) => color != oldDelegate.color;
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color = StudioColors.muted});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.2,
      color: color,
    ),
  );
}

class Surface extends StatelessWidget {
  const Surface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.color = StudioColors.surface,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(StudioSpace.card),
    ),
    child: child,
  );
}

class FormatChip extends StatelessWidget {
  const FormatChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.expand = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = Material(
      color: selected ? StudioColors.elevated : Colors.transparent,
      borderRadius: BorderRadius.circular(StudioSpace.control),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(StudioSpace.control),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  color: selected ? StudioColors.text : StudioColors.muted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: child) : child;
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    final active = status == 'running' || status == 'queued';
    final color = status == 'failed'
        ? StudioColors.error
        : status == 'completed' || active
        ? StudioColors.accent
        : StudioColors.muted;
    final label = switch (status) {
      'running' => 'Creating',
      'queued' => 'Queued',
      'completed' => 'Ready',
      'failed' => 'Needs attention',
      'cancelled' => 'Stopped',
      _ => 'Draft',
    };
    return Text(
      label,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: color,
      ),
    );
  }
}
