import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:gaytri_commercial_smart_erp/presentation/screens/scanner_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall methodCall) async {
      if (methodCall.method == 'read') {
        final key = methodCall.arguments['key'];
        if (key == 'user') {
          return '{"id":"mgr_1","employee_id":"manager@gaytri.com","full_name":"Test Manager","role":"MANAGER"}';
        }
        if (key == 'access_token') {
          return 'test_token';
        }
      }
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  testWidgets('scanner resets when app backgrounds during scan', (WidgetTester tester) async {
    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      await tester.pump(const Duration(milliseconds: 500));

      final state = tester.state(find.byType(ScannerScreen)) as dynamic;
      state.markScanningForTest();
      await tester.pump();

      expect(state.isScanning, isTrue);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();

      expect(state.isScanning, isFalse);
      expect(state.scanningStatus.contains('App lost focus'), isTrue);
    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            'success': true,
            'employees': [
              {
                'id': 'emp_1',
                'employee_id': 'GCE-2026-004',
                'full_name': 'Test Employee',
                'department': 'Production',
                'shift': 'Morning Shift',
                'mobile': '9999999999',
                'biometric_enrolled': true,
                'has_face_data': true,
              }
            ]
          }),
          200,
        );
      }

      return http.Response('{"success": true}', 200);
    }));
  });

  testWidgets('no face registered dialog appears only when employee has no embedding', (WidgetTester tester) async {
    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      await tester.pump(const Duration(milliseconds: 500));

      final state = tester.state(find.byType(ScannerScreen)) as dynamic;
      await state.runFaceVerificationForTest();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('NO FACE REGISTERED'), findsAtLeastNWidgets(1));
      expect(find.textContaining('No biometric embedding exists'), findsOneWidget);
    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            'success': true,
            'employees': [
              {
                'id': 'emp_2',
                'employee_id': 'GCE-2026-005',
                'full_name': 'Unenrolled Employee',
                'department': 'Production',
                'shift': 'Morning Shift',
                'mobile': '8888888888',
                'biometric_enrolled': false,
                'has_face_data': true,
              }
            ]
          }),
          200,
        );
      }

      return http.Response('{"success": true}', 200);
    }));
  });

  testWidgets('mobile client submits correct embedding vector to backend', (WidgetTester tester) async {
    List<double>? sentEmbedding;
    String? sentEmployeeId;

    await http.runWithClient(() async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ScannerScreen(),
        ),
      );

      await tester.pump(const Duration(milliseconds: 500));

      final state = tester.state(find.byType(ScannerScreen)) as dynamic;
      final testVector = List<double>.generate(128, (i) => i * 0.005);
      await state.submitVerificationToBackend(testVector);
      await tester.pump();

      expect(sentEmbedding, isNotNull);
      expect(sentEmbedding!.length, 128);
      expect(sentEmbedding![1], 0.005);
      expect(sentEmbedding![10], 0.05);
      expect(sentEmployeeId, 'GCE-2026-004');
    }, () => http_testing.MockClient((request) async {
      if (request.url.path.endsWith('/employees')) {
        return http.Response(
          jsonEncode({
            'success': true,
            'employees': [
              {
                'id': 'emp_1',
                'employee_id': 'GCE-2026-004',
                'full_name': 'Test Employee',
                'department': 'Production',
                'shift': 'Morning Shift',
                'mobile': '9999999999',
                'biometric_enrolled': true,
                'has_face_data': true,
              }
            ]
          }),
          200,
        );
      }

      final bodyMap = jsonDecode(request.body);
      sentEmployeeId = bodyMap['employee_id'] as String;
      sentEmbedding = List<double>.from(bodyMap['face_embedding']);
      return http.Response('{"success": true, "message": "Success"}', 200);
    }));
  });
}
