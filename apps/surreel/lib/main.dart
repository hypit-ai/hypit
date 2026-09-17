import 'package:flutter/material.dart';

import 'data/app_controller.dart';
import 'ui/design.dart';
import 'ui/workspace.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SurreelApp());
}

class SurreelApp extends StatefulWidget {
  const SurreelApp({super.key, this.controller, this.initialize = true});
  final AppController? controller;
  final bool initialize;
  @override
  State<SurreelApp> createState() => _SurreelAppState();
}

class _SurreelAppState extends State<SurreelApp> {
  late final AppController _controller;
  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? AppController();
    if (widget.initialize) _controller.initialize();
  }

  @override
  void dispose() {
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Surreel - Your creative studio',
      debugShowCheckedModeBanner: false,
      theme: studioTheme(),
      home: Workspace(controller: _controller),
    );
  }
}
