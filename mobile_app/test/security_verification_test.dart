import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:gaytri_commercial_smart_erp/presentation/screens/scanner_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Correct channel name for flutter_secure_storage version 9.0.0+
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall methodCall) async {
      print('Mock Secure Storage Method Call: ${methodCall.method} with arguments: ${methodCall.arguments}');
      if (methodCall.method == 'read') {
        final key = methodCall.arguments['key'];
        if (key == 'user') {
          return '{"id":"mgr_1","employee_id":"manager@gaytri.com","full_name":"Test Manager","role":"MANAGER"}';
        }
        if (key == 'access_token') {
          return 'mock_token';
        }
      }
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  testWidgets('Scanner screen state locks - app background resets scan', (WidgetTester tester) async {
    await http.runWithClient(() async {
      // Build scanner screen
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      // Wait for employee fetching to settle
      await tester.pump(const Duration(milliseconds: 500));

      // Get the state of the scanner screen
      final state = tester.state(find.byType(ScannerScreen)) as dynamic;

      // Inject a mock template so the "START GATE VERIFICATION" button becomes enabled and clickable
      state.registeredFaceEmbedding = List<double>.filled(128, 0.5);
      await tester.pump();

      // Verify widget builds and shows select or start buttons
      expect(find.text('START GATE VERIFICATION'), findsOneWidget);

      // Initially scanning should be false
      expect(state.isScanning, isFalse);

      // Tap verification button to start scan
      await tester.tap(find.text('START GATE VERIFICATION'));
      await tester.pump();

      // Now scanner should be scanning
      expect(state.isScanning, isTrue);

      // Trigger app background (paused state)
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      print('State after background trigger: isScanning=${state.isScanning}, status="${state.scanningStatus}"');

      // The scanner should reset automatically and transition to non-scanning state
      expect(state.isScanning, isFalse);
      expect(state.scanningStatus.contains('App lost focus') || state.scanningStatus.contains('Scan failed'), isTrue);
    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            "success": true,
            "employees": [
              {
                "id": "emp_1",
                "employee_id": "GCE-2026-004",
                "full_name": "Test Employee",
                "department": "Production",
                "shift": "Morning Shift",
                "face_embedding": List<double>.filled(128, 0.5),
                "profile_photo_url": "data:image/jpeg;base64,abc"
              }
            ]
          }),
          200,
        );
      }
      return http.Response('{"success": true}', 200);
    }));
  });

  testWidgets('Web simulation blocks backend submission and shows demo dialog', (WidgetTester tester) async {
    bool httpCalled = false;

    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      // Wait for employee fetching to settle
      await tester.pump(const Duration(milliseconds: 500));

      final state = tester.state(find.byType(ScannerScreen)) as dynamic;
      state.registeredFaceEmbedding = List<double>.filled(128, 0.5);
      await tester.pump();

      // Tap START GATE VERIFICATION (which starts web simulation in test environment)
      await tester.tap(find.text('START GATE VERIFICATION'));
      await tester.pump();

      expect(state.isScanning, isTrue);

      // Web simulation completes after 4 seconds (4000ms).
      // Since timer ticks every 200ms, pump 20 times.
      for (int i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }

      // Scanner should not be scanning anymore
      expect(state.isScanning, isFalse);

      // Verify that web demo dialog is shown
      expect(find.text('DEMO MODE ACTIVE'), findsOneWidget);
      expect(find.text('OK'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('OK'));
      await tester.pump();

      expect(find.text('DEMO MODE ACTIVE'), findsNothing);

    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            "success": true,
            "employees": [
              {
                "id": "emp_1",
                "employee_id": "GCE-2026-004",
                "full_name": "Test Employee",
                "department": "Production",
                "shift": "Morning Shift",
                "face_embedding": List<double>.filled(128, 0.5),
                "profile_photo_url": "data:image/jpeg;base64,abc"
              }
            ]
          }),
          200,
        );
      }
      httpCalled = true;
      return http.Response('{"success": true}', 200);
    }));

    // Verify that NO backend HTTP call was made during web simulation
    expect(httpCalled, isFalse);
  });

  testWidgets('Mobile client submits correct embedding vector to backend', (WidgetTester tester) async {
    List<double>? sentEmbedding;
    
    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      // Wait for employee fetching to settle
      await tester.pump(const Duration(milliseconds: 500));

      final state = tester.state(find.byType(ScannerScreen)) as dynamic;
      state.registeredFaceEmbedding = List<double>.filled(128, 0.5);
      await tester.pump();

      // Trigger the backend submission helper directly
      final testVector = List<double>.generate(128, (i) => i * 0.005);
      await state.submitVerificationToBackend(testVector);
      await tester.pump();

      // Verify that the correct vector was sent
      expect(sentEmbedding, isNotNull);
      expect(sentEmbedding!.length, 128);
      expect(sentEmbedding![1], 0.005);
      expect(sentEmbedding![10], 0.05);

    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            "success": true,
            "employees": [
              {
                "id": "emp_1",
                "employee_id": "GCE-2026-004",
                "full_name": "Test Employee",
                "department": "Production",
                "shift": "Morning Shift",
                "face_embedding": List<double>.filled(128, 0.5),
                "profile_photo_url": "data:image/jpeg;base64,abc"
              }
            ]
          }),
          200,
        );
      }
      // Intercept request body
      final bodyMap = jsonDecode(request.body);
      sentEmbedding = List<double>.from(bodyMap['face_embedding']);
      return http.Response('{"success": true, "message": "Success"}', 200);
    }));
  });
}
