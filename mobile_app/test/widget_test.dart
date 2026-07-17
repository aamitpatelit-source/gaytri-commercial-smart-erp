import 'dart:io';
import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:gaytri_commercial_workforce/main.dart';
import 'package:gaytri_commercial_workforce/l10n/app_localizations.dart';
import 'package:gaytri_commercial_workforce/core/providers/language_provider.dart';
import 'package:gaytri_commercial_workforce/presentation/screens/manager_dashboard.dart';

// Mock HttpOverrides to intercept network calls and return fake responses
class MockHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return MockHttpClient();
  }
}

class MockHttpClient implements HttpClient {
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    return MockHttpClientRequest(method, url);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #close) return null;
    return null;
  }
}

class MockHttpClientRequest implements HttpClientRequest {
  final String method;
  final Uri url;
  
  MockHttpClientRequest(this.method, this.url);

  @override
  final HttpHeaders headers = MockHttpHeaders();

  @override
  void write(Object? obj) {}

  @override
  Future<HttpClientResponse> get done async => MockHttpClientResponse(method, url);

  @override
  Future addStream(Stream<List<int>> stream) async {}

  @override
  Future flush() async {}

  @override
  Future<HttpClientResponse> close() async {
    return MockHttpClientResponse(method, url);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    return null;
  }
}

class MockHttpHeaders implements HttpHeaders {
  final Map<String, List<String>> _headers = {
    'content-type': ['application/json; charset=utf-8']
  };

  @override
  void forEach(void Function(String name, List<String> values) action) {
    _headers.forEach(action);
  }

  @override
  List<String>? operator [](String name) => _headers[name.toLowerCase()];

  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
  
  @override
  set contentType(ContentType? type) {}

  @override
  dynamic noSuchMethod(Invocation invocation) {
    return null;
  }
}

class MockHttpClientResponse extends Stream<List<int>> implements HttpClientResponse {
  final String method;
  final Uri url;

  MockHttpClientResponse(this.method, this.url);

  @override
  int get statusCode => 200;

  @override
  int get contentLength => -1;

  @override
  String get reasonPhrase => 'OK';

  @override
  bool get isRedirect => false;

  @override
  bool get persistentConnection => true;

  @override
  HttpHeaders get headers => MockHttpHeaders();

  @override
  List<RedirectInfo> get redirects => const [];

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    final responseBody = _getResponseBody();
    final bytes = utf8.encode(responseBody);
    return Stream<List<int>>.fromIterable([bytes]).listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }

  String _getResponseBody() {
    if (url.path.endsWith('/attendance/dashboard')) {
      return jsonEncode({
        'success': true,
        'stats': {
          'totalStaff': 5,
          'present': 3,
          'absent': 1,
          'late': 1,
          'halfDay': 0,
          'leave': 0,
        },
        'feed': [
          {
            'employee_id': 'GC-TEST-0001',
            'full_name': 'Test Amit',
            'status': 'PRESENT',
            'time': '09:05:00',
            'department': 'Production'
          }
        ]
      });
    } else if (url.path.endsWith('/attendance/settings')) {
      return jsonEncode({
        'success': true,
        'settings': {
          'shift_name': 'Morning Shift',
          'checkin_start': '09:00:00',
          'checkout_time': '17:00:00',
          'grace_minutes': 15,
        }
      });
    } else if (url.path.endsWith('/employees')) {
      return jsonEncode({
        'success': true,
        'employees': [
          {
            'id': 'uuid-1',
            'employee_id': 'GC-TEST-0001',
            'full_name': 'Test Amit',
            'department': 'Production',
            'shift': 'Morning Shift',
            'mobile': '9999999999'
          },
          {
            'id': 'uuid-2',
            'employee_id': 'GC-TEST-0002',
            'full_name': 'Test Ramesh',
            'department': 'Logistics',
            'shift': 'Morning Shift',
            'mobile': '8888888888'
          }
        ]
      });
    } else if (url.path.endsWith('/attendance/history')) {
      return jsonEncode({
        'success': true,
        'logs': [
          {
            'employee_id': 'GC-TEST-0001',
            'status': 'PRESENT',
            'remarks': 'Testing manual mark',
          }
        ]
      });
    } else if (url.path.endsWith('/attendance/mark')) {
      return jsonEncode({
        'success': true,
        'message': 'Attendance saved successfully.'
      });
    }
    return '{}';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    return null;
  }
}

void main() {
  setUpAll(() {
    HttpOverrides.global = MockHttpOverrides();
    // Seed FlutterSecureStorage mock initial values
    FlutterSecureStorage.setMockInitialValues({
      'access_token': 'fake-jwt-token',
      'refresh_token': 'fake-refresh-token',
      'user': jsonEncode({
        'role': 'MANAGER',
        'full_name': 'Manager Test',
        'employee_id': 'manager@test.com'
      }),
    });
  });

  Widget createTestWidget() {
    return ChangeNotifierProvider(
      create: (_) => LanguageProvider(),
      child: Consumer<LanguageProvider>(
        builder: (context, languageProvider, _) {
          return MaterialApp(
            locale: languageProvider.locale,
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [
              Locale('en', ''),
              Locale('hi', ''),
            ],
            home: const ManagerDashboard(),
          );
        },
      ),
    );
  }

  testWidgets('App builds and launches splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const GaytriWorkforceApp());
    expect(find.byType(GaytriWorkforceApp), findsOneWidget);
    // Pump frames to complete the delayed transition timer
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
  });

  testWidgets('Manager dashboard bottom navigation, roster, and status modifications work', (WidgetTester tester) async {
    // 1. Render Manager Dashboard
    await tester.pumpWidget(createTestWidget());
    // Pump frames to complete the async http call resolves
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    final texts = find.byType(Text).evaluate().map((e) => (e.widget as Text).data).toList();
    print('ALL TEXTS ON SCREEN: $texts');
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);
    expect(find.text('Attendance'), findsOneWidget);
    expect(find.text('Leaves'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);

    // 3. Switch to Attendance tab
    await tester.tap(find.text('Attendance'));
    // Pump to transition tab
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    // 4. Verify employee roster loaded from mocked API
    expect(find.text('Test Amit'), findsOneWidget);
    expect(find.text('Test Ramesh'), findsOneWidget);

    // 5. Change status (e.g. mark Test Ramesh as PRESENT)
    // Find Roster card for Ramesh, tap "Present" choice button
    final rameshPreChip = find.descendant(
      of: find.ancestor(of: find.text('Test Ramesh'), matching: find.byType(Container)),
      matching: find.text('Present'),
    ).first;
    await tester.tap(rameshPreChip, warnIfMissed: false);
    for (int i = 0; i < 2; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    // 6. Test 'Mark All Present' local state update
    await tester.tap(find.text('Mark All Present'));
    for (int i = 0; i < 2; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    // 7. Verify Save Attendance button is present
    expect(find.text('Save Attendance'), findsOneWidget);
    await tester.tap(find.text('Save Attendance'), warnIfMissed: false);
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    // 8. Test language switcher dynamic update
    await tester.tap(find.text('Settings'));
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    // Scroll down to reveal language switcher switch
    await tester.drag(find.byType(SingleChildScrollView).last, const Offset(0, -400));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Switch));
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    
    // Roster matches Hindi string
    expect(find.text('डैशबोर्ड'), findsOneWidget);
    expect(find.text('उपस्थिति'), findsOneWidget);
    expect(find.text('छुट्टियां'), findsOneWidget);
  });
}
