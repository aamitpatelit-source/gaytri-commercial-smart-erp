// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Gaytri Commercial Workforce';

  @override
  String get appDescription => 'Workforce Management & Attendance System';

  @override
  String get loginTitle => 'Workforce Sign In';

  @override
  String get employeeId => 'Employee ID';

  @override
  String get password => 'Password';

  @override
  String get loginButton => 'Sign In';

  @override
  String get forgotPassword => 'Forgot Password?';

  @override
  String get contactAdmin => 'Contact Admin';

  @override
  String get employeeDashboard => 'Employee Dashboard';

  @override
  String get managerDashboard => 'Manager Dashboard';

  @override
  String get shiftTimings => 'Shift Timings';

  @override
  String get personalLogs => 'Personal Logs';

  @override
  String get requestLeave => 'Request Leave';

  @override
  String get profileDetails => 'Profile Details';

  @override
  String get logout => 'Logout';

  @override
  String get loading => 'Loading...';

  @override
  String get errorConnection => 'Could not establish connection.';

  @override
  String get active => 'Active';

  @override
  String get suspended => 'Suspended';
}
