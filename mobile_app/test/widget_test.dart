import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:gaytri_commercial_smart_erp/main.dart';

void main() {
  testWidgets('App builds and launches splash screen', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const GaytriErpApp());

    // Verify that our app builds successfully
    expect(find.byType(GaytriErpApp), findsOneWidget);

    // Pump for 3 seconds to complete the delayed routing timer on splash screen
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
  });
}
