import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../../core/providers/language_provider.dart';
import '../../l10n/app_localizations.dart';
import 'login_screen.dart';

class EmployeeDashboard extends StatefulWidget {
  const EmployeeDashboard({super.key});

  @override
  State<EmployeeDashboard> createState() => _EmployeeDashboardState();
}

class _EmployeeDashboardState extends State<EmployeeDashboard> {
  final _storage = const FlutterSecureStorage();
  int _currentIndex = 0;
  bool _isLoading = true;
  String? _error;

  String _fullName = '';
  String _employeeId = '';
  String _shiftName = 'Morning Shift';
  String _departmentName = 'Production';
  bool _requirePasswordChange = false;

  // Today's attendance metrics
  String _checkInTime = '--:--';
  String _checkOutTime = '--:--';
  String _workingHours = '0h 0m';
  String _attendanceStatus = 'Not Checked In';
  List<dynamic> _recentLogs = [];

  // Leave stats
  int _clRemaining = 12;
  int _slRemaining = 12;
  int _plRemaining = 12;
  int _clUsed = 0;
  int _slUsed = 0;
  int _plUsed = 0;
  List<dynamic> _leaveRequests = [];

  Timer? _clockTimer;
  String _currentTimeString = '';
  String _currentDayString = '';
  bool _isOnline = true;
  Timer? _connectivityTimer;

  @override
  void initState() {
    super.initState();
    _startClock();
    _loadDashboardData();
    _startConnectivityTimer();
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _connectivityTimer?.cancel();
    super.dispose();
  }

  void _startClock() {
    _updateClock();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _updateClock();
    });
  }

  void _updateClock() {
    if (!mounted) return;
    final now = DateTime.now();
    setState(() {
      _currentTimeString = DateFormat('hh:mm a').format(now);
      _currentDayString = DateFormat('EEEE, d MMMM').format(now);
    });
  }

  void _startConnectivityTimer() {
    _connectivityTimer = Timer.periodic(const Duration(seconds: 15), (timer) async {
      try {
        final res = await http.get(Uri.parse('${ApiConfig.baseUrl}/')).timeout(const Duration(seconds: 5));
        if (mounted) {
          setState(() {
            _isOnline = res.statusCode == 200;
          });
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _isOnline = false;
          });
        }
      }
    });
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  String _formatTo12Hour(String timeStr) {
    if (timeStr.isEmpty) return '';
    try {
      final parts = timeStr.split(':');
      if (parts.length < 2) return timeStr;
      int hour = int.parse(parts[0]);
      final minute = parts[1];
      final ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour == 0) hour = 12;
      final hourStr = hour < 10 ? '0$hour' : '$hour';
      return '$hourStr:$minute $ampm';
    } catch (e) {
      return timeStr;
    }
  }

  String _formatTimestampTo12Hour(String? timestampStr) {
    if (timestampStr == null || timestampStr.isEmpty) return '';
    try {
      final dt = DateTime.parse(timestampStr).toLocal();
      return DateFormat('hh:mm a').format(dt);
    } catch (e) {
      return timestampStr;
    }
  }

  Future<void> _loadDashboardData() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        throw Exception('Session expired. Please log in again.');
      }

      // 1. Get profile data from `/auth/me`
      final profileRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (profileRes.statusCode == 401 || profileRes.statusCode == 403) {
        _logout();
        return;
      }

      if (profileRes.statusCode != 200) {
        throw Exception('Failed to load user profile.');
      }

      final profileData = jsonDecode(profileRes.body);
      if (profileData['success'] == true) {
        final user = profileData['user'] ?? {};
        _fullName = user['full_name'] ?? 'Employee';
        _employeeId = user['employee_id'] ?? '';
        _shiftName = user['shift'] ?? 'Morning Shift';
        _departmentName = user['department'] ?? 'Production';
        _requirePasswordChange = user['require_password_change'] ?? false;
        
        await _storage.write(key: 'user', value: jsonEncode(user));
      }

      if (_requirePasswordChange) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _showForcePasswordChangeDialog();
        });
      }

      // 2. Fetch employee attendance history to compute today's stats
      final historyRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/attendance/history'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (historyRes.statusCode == 200) {
        final historyData = jsonDecode(historyRes.body);
        if (historyData['success'] == true) {
          final List logs = historyData['logs'] ?? [];
          _recentLogs = logs;

          // Compute today's metrics
          final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
          final todayLog = logs.firstWhere(
            (log) {
              final logDate = log['date'];
              if (logDate is String) {
                return logDate.startsWith(todayStr);
              }
              return false;
            },
            orElse: () => null,
          );

          if (todayLog != null) {
            _checkInTime = _formatTo12Hour(todayLog['check_in_time'] ?? '');
            _checkOutTime = todayLog['check_out'] != null 
                ? _formatTimestampTo12Hour(todayLog['check_out']) 
                : '--:--';
            _workingHours = todayLog['working_hours'] ?? '0h 0m';
            _attendanceStatus = todayLog['status'] ?? 'PRESENT';
            
            if (todayLog['check_out'] == null) {
              _attendanceStatus = 'Checked In';
            }
          } else {
            _checkInTime = '--:--';
            _checkOutTime = '--:--';
            _workingHours = '0h 0m';
            _attendanceStatus = 'Not Checked In';
          }
        }
      }

      // 3. Fetch Leave Balances
      final balRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/leaves/balances'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (balRes.statusCode == 200) {
        final balData = jsonDecode(balRes.body);
        if (balData['success'] == true) {
          final b = balData['balances'] ?? {};
          _clRemaining = b['casual_leave'] ?? 12;
          _slRemaining = b['sick_leave'] ?? 12;
          _plRemaining = b['paid_leave'] ?? 12;
          _clUsed = b['casual_used'] ?? 0;
          _slUsed = b['sick_used'] ?? 0;
          _plUsed = b['paid_used'] ?? 0;
        }
      }

      // 4. Fetch Leave Requests History
      final requestsRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/leaves/requests'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (requestsRes.statusCode == 200) {
        final reqData = jsonDecode(requestsRes.body);
        if (reqData['success'] == true) {
          _leaveRequests = reqData['requests'] ?? [];
        }
      }

      if (mounted) {
        setState(() {
          _isOnline = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isOnline = false;
          _error = e.toString().replaceAll('Exception:', '');
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await _storage.deleteAll();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
  }

  void _showForcePasswordChangeDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        final newPasswordController = TextEditingController();
        final confirmPasswordController = TextEditingController();
        bool isDialogLoading = false;
        String? dialogError;

        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submitPasswordChange() async {
              final newPass = newPasswordController.text;
              final confirmPass = confirmPasswordController.text;

              if (newPass.isEmpty || confirmPass.isEmpty) {
                setDialogState(() => dialogError = 'All fields are required.');
                return;
              }

              if (newPass.length < 6) {
                setDialogState(() => dialogError = 'Password must be at least 6 characters long.');
                return;
              }

              if (newPass != confirmPass) {
                setDialogState(() => dialogError = 'Passwords do not match.');
                return;
              }

              setDialogState(() {
                isDialogLoading = true;
                dialogError = null;
              });

              try {
                final token = await _storage.read(key: 'access_token');
                final response = await http.post(
                  Uri.parse('${ApiConfig.baseUrl}/auth/change-password'),
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer $token',
                  },
                  body: jsonEncode({
                    'old_password': '',
                    'new_password': newPass,
                  }),
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(response.body);

                if (response.statusCode != 200 || data['success'] != true) {
                  throw Exception(data['message'] ?? 'Failed to update password.');
                }

                if (context.mounted) {
                  Navigator.of(context).pop();
                  _showSuccessSnackbar('Password updated successfully. Account secured.');
                  _loadDashboardData();
                }
              } catch (err) {
                setDialogState(() {
                  isDialogLoading = false;
                  dialogError = err.toString().replaceAll('Exception:', '');
                });
              }
            }

            return AlertDialog(
              backgroundColor: AppTheme.cardBg,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: const BorderSide(color: Colors.white10),
              ),
              title: const Row(
                children: [
                  Icon(Icons.security_rounded, color: AppTheme.neonCyan),
                  SizedBox(width: 10),
                  Text('Secure Account', style: TextStyle(fontFamily: 'Outfit', fontSize: 18)),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'An administrator has requested that you change your password on first login to secure your profile.',
                      style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
                    ),
                    const SizedBox(height: 16),
                    if (dialogError != null) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed.withOpacity(0.3)),
                        ),
                        child: Text(
                          dialogError!,
                          style: const TextStyle(color: AppTheme.errorRed, fontSize: 10.5, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: newPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'New Password',
                        prefixIcon: Icon(Icons.lock_outline_rounded, size: 18),
                        hintText: '••••••••',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: confirmPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Confirm Password',
                        prefixIcon: Icon(Icons.lock_reset_rounded, size: 18),
                        hintText: '••••••••',
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: ElevatedButton(
                    onPressed: isDialogLoading ? null : submitPasswordChange,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.neonCyan,
                      foregroundColor: AppTheme.darkBg,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: isDialogLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2),
                          )
                        : const Text('Update & Save Password', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _showSuccessSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle_outline_rounded, color: AppTheme.successGreen),
            const SizedBox(width: 10),
            Text(message, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white)),
          ],
        ),
        backgroundColor: AppTheme.cardBg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: AppTheme.successGreen.withOpacity(0.3)),
        ),
        margin: const EdgeInsets.all(20),
      ),
    );
  }

  void _showErrorSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline_rounded, color: AppTheme.errorRed),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white)),
            ),
          ],
        ),
        backgroundColor: AppTheme.cardBg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: AppTheme.errorRed.withOpacity(0.3)),
        ),
        margin: const EdgeInsets.all(20),
      ),
    );
  }

  Widget _buildHomeTab(AppLocalizations? l10n) {
    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      color: AppTheme.neonCyan,
      backgroundColor: AppTheme.cardBg,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${_getGreeting()},',
              style: const TextStyle(fontSize: 15, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 2),
            Text(
              _fullName,
              style: const TextStyle(
                fontFamily: 'Outfit',
                fontSize: 26,
                fontWeight: FontWeight.w900,
                color: Colors.white,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'ID: $_employeeId  •  $_departmentName',
              style: const TextStyle(fontSize: 12, color: AppTheme.mutedText, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            
            Row(
              children: [
                const Icon(Icons.calendar_today_rounded, size: 12, color: AppTheme.neonCyan),
                const SizedBox(width: 6),
                Text(
                  '$_currentDayString  •  ',
                  style: const TextStyle(fontSize: 11.5, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
                ),
                const Icon(Icons.schedule_rounded, size: 12, color: AppTheme.neonCyan),
                const SizedBox(width: 4),
                Text(
                  _shiftName,
                  style: const TextStyle(fontSize: 11.5, color: Colors.white70, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.errorRed.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.errorRed.withOpacity(0.2)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppTheme.errorRed, fontSize: 11.5),
                ),
              ),
            ],
            const SizedBox(height: 20),

            // Today's Attendance Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.cardBg, AppTheme.cardBg.withOpacity(0.5)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.08)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 15,
                    offset: const Offset(0, 5),
                  )
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "TODAY'S ATTENDANCE",
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.mutedText,
                          letterSpacing: 1.0,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                              ? AppTheme.successGreen.withOpacity(0.1)
                              : _attendanceStatus == 'LATE'
                                  ? Colors.orange.withOpacity(0.1)
                                  : Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(
                            color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                                ? AppTheme.successGreen.withOpacity(0.3)
                                : _attendanceStatus == 'LATE'
                                    ? Colors.orange.withOpacity(0.3)
                                    : Colors.white.withOpacity(0.1),
                          ),
                        ),
                        child: Text(
                          _attendanceStatus.toUpperCase(),
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                                ? AppTheme.successGreen
                                : _attendanceStatus == 'LATE'
                                    ? Colors.orange
                                    : AppTheme.mutedText,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildAttendanceMetric('Check In', _checkInTime, Icons.login_rounded, AppTheme.successGreen),
                      _buildAttendanceMetric('Check Out', _checkOutTime, Icons.logout_rounded, AppTheme.errorRed),
                      _buildAttendanceMetric('Working Hours', _workingHours, Icons.timer_outlined, AppTheme.neonCyan),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Recent Activity Title
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  "TODAY'S ACTIVITY",
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
                ),
                Text(
                  'Attendance Status',
                  style: TextStyle(fontSize: 9, color: AppTheme.neonCyan, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (_recentLogs.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 40),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                ),
                child: const Center(
                  child: Text(
                    'No attendance logged yet.',
                    style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
                  ),
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _recentLogs.length > 5 ? 5 : _recentLogs.length,
                itemBuilder: (context, index) {
                  final log = _recentLogs[index];
                  final status = log['status'] ?? 'PRESENT';
                  final isLate = status == 'LATE';
                  final isLeave = status == 'LEAVE';
                  
                  String dateDisplay = '';
                  try {
                    final dt = DateTime.parse(log['date'].toString());
                    dateDisplay = DateFormat('EEEE, d MMM').format(dt);
                  } catch (_) {
                    dateDisplay = log['date']?.toString() ?? '';
                  }

                  final checkIn = _formatTo12Hour(log['check_in_time'] ?? '');
                  final checkOut = log['check_out'] != null 
                      ? _formatTimestampTo12Hour(log['check_out']) 
                      : null;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.35),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white.withOpacity(0.04)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppTheme.darkBg,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white10),
                          ),
                          child: Icon(
                            isLeave ? Icons.flight_takeoff_rounded : Icons.fingerprint_rounded, 
                            color: AppTheme.neonCyan, 
                            size: 20
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                dateDisplay, 
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white)
                              ),
                              const SizedBox(height: 2),
                              Text(
                                isLeave
                                    ? (log['remarks'] ?? 'Approved Leave')
                                    : (checkOut != null 
                                        ? 'In: $checkIn  •  Out: $checkOut'
                                        : 'Checked In: $checkIn'),
                                style: const TextStyle(fontSize: 10.5, color: AppTheme.mutedText),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (log['working_hours'] != null && !isLeave)
                              Text(
                                log['working_hours'],
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                            const SizedBox(height: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: isLeave 
                                    ? Colors.blue.withOpacity(0.1) 
                                    : (isLate ? AppTheme.errorRed.withOpacity(0.1) : AppTheme.successGreen.withOpacity(0.1)),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                status,
                                style: TextStyle(
                                  fontSize: 7.5,
                                  fontWeight: FontWeight.bold,
                                  color: isLeave 
                                      ? Colors.blue 
                                      : (isLate ? AppTheme.errorRed : AppTheme.successGreen),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildAttendanceMetric(String label, String value, IconData icon, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 11, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: const TextStyle(fontSize: 9.5, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: Colors.white, fontFamily: 'Outfit'),
        ),
      ],
    );
  }

  Widget _buildLeavesTab(AppLocalizations? l10n) {
    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      color: AppTheme.neonCyan,
      backgroundColor: AppTheme.cardBg,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  (l10n?.leaves ?? 'Leaves').toUpperCase(),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
                ),
                ElevatedButton.icon(
                  onPressed: _showRequestLeaveBottomSheet,
                  icon: const Icon(Icons.add, size: 14, color: AppTheme.darkBg),
                  label: Text(l10n?.requestLeave ?? 'Request Leave', style: const TextStyle(fontSize: 10.5, color: AppTheme.darkBg, fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.neonCyan,
                    minimumSize: const Size(80, 32),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(child: _buildBalanceCard(l10n?.casualLeave ?? 'Casual', _clRemaining, Colors.cyan)),
                const SizedBox(width: 8),
                Expanded(child: _buildBalanceCard(l10n?.sickLeave ?? 'Sick', _slRemaining, Colors.amber)),
                const SizedBox(width: 8),
                Expanded(child: _buildBalanceCard(l10n?.paidLeave ?? 'Paid', _plRemaining, Colors.emerald)),
              ],
            ),
            const SizedBox(height: 24),

            const Text(
              "LEAVE REQUESTS HISTORY",
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
            ),
            const SizedBox(height: 12),

            if (_leaveRequests.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 40),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                ),
                child: const Center(
                  child: Text(
                    'No leave requests found.',
                    style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
                  ),
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _leaveRequests.length,
                itemBuilder: (context, index) {
                  final req = _leaveRequests[index];
                  final status = req['status'] ?? 'PENDING';
                  final Color badgeColor = status == 'PENDING'
                      ? Colors.amber
                      : status == 'APPROVED'
                          ? AppTheme.successGreen
                          : AppTheme.errorRed;

                  String rangeDisplay = '';
                  try {
                    final startD = DateTime.parse(req['start_date']);
                    final endD = DateTime.parse(req['end_date']);
                    rangeDisplay = '${DateFormat('d MMM').format(startD)} - ${DateFormat('d MMM yyyy').format(endD)}';
                  } catch (_) {
                    rangeDisplay = '${req['start_date']} to ${req['end_date']}';
                  }

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white.withOpacity(0.04)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              req['type']?.toString().toUpperCase() ?? 'LEAVE',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: badgeColor.withOpacity(0.08),
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: badgeColor.withOpacity(0.2)),
                              ),
                              child: Text(
                                status,
                                style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: badgeColor),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(Icons.date_range_rounded, size: 12, color: AppTheme.mutedText),
                            const SizedBox(width: 4),
                            Text(
                              rangeDisplay,
                              style: const TextStyle(fontSize: 11, color: AppTheme.mutedText, fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${l10n?.reason ?? "Reason"}: ${req['reason']}',
                          style: const TextStyle(fontSize: 11.5, color: Colors.white70),
                        ),
                        if (req['remarks'] != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            'Remarks: ${req['remarks']}',
                            style: const TextStyle(fontSize: 11, color: Colors.orangeAccent, fontStyle: FontStyle.italic),
                          ),
                        ],
                        if (status == 'PENDING') ...[
                          const Divider(color: Colors.white10, height: 16),
                          Align(
                            alignment: Alignment.centerRight,
                            child: OutlinedButton(
                              onPressed: () => _confirmCancelLeave(req['id']),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: AppTheme.errorRed),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                minimumSize: Size.zero,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                              ),
                              child: Text(l10n?.cancel ?? 'Cancel', style: const TextStyle(color: AppTheme.errorRed, fontSize: 10.5, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildBalanceCard(String title, int value, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText)),
          const SizedBox(height: 4),
          Text('$value days', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: color, fontFamily: 'Outfit')),
        ],
      ),
    );
  }

  void _showRequestLeaveBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.darkBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        String leaveType = 'CASUAL';
        DateTime startDate = DateTime.now().add(const Duration(days: 1));
        DateTime endDate = DateTime.now().add(const Duration(days: 1));
        final reasonController = TextEditingController();
        bool isRequestLoading = false;
        String? requestError;

        final l10n = AppLocalizations.of(context);

        return StatefulBuilder(
          builder: (context, setModalState) {
            Future<void> submitRequest() async {
              if (reasonController.text.trim().isEmpty) {
                setModalState(() => requestError = l10n?.enterReason ?? 'Please enter a reason');
                return;
              }

              setModalState(() {
                isRequestLoading = true;
                requestError = null;
              });

              try {
                final token = await _storage.read(key: 'access_token');
                final res = await http.post(
                  Uri.parse('${ApiConfig.baseUrl}/leaves/requests'),
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer $token'
                  },
                  body: jsonEncode({
                    'start_date': DateFormat('yyyy-MM-dd').format(startDate),
                    'end_date': DateFormat('yyyy-MM-dd').format(endDate),
                    'type': leaveType,
                    'reason': reasonController.text.trim()
                  }),
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(res.body);
                if (res.statusCode != 201 || data['success'] != true) {
                  throw Exception(data['message'] ?? 'Failed to submit request.');
                }

                if (context.mounted) {
                  Navigator.of(context).pop();
                  _showSuccessSnackbar('Leave request submitted successfully.');
                  _loadDashboardData();
                }
              } catch (e) {
                setModalState(() {
                  isRequestLoading = false;
                  requestError = e.toString().replaceAll('Exception:', '');
                });
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(l10n?.requestLeave ?? 'Request Leave', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 12),

                    if (requestError != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed.withOpacity(0.2)),
                        ),
                        child: Text(requestError!, style: const TextStyle(color: AppTheme.errorRed, fontSize: 11)),
                      ),
                      const SizedBox(height: 12),
                    ],

                    Text(l10n?.selectLeaveType ?? 'Select Leave Type', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      value: leaveType,
                      dropdownColor: AppTheme.cardBg,
                      decoration: const InputDecoration(
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      items: [
                        DropdownMenuItem(value: 'CASUAL', child: Text(l10n?.casualLeave ?? 'Casual Leave')),
                        DropdownMenuItem(value: 'SICK', child: Text(l10n?.sickLeave ?? 'Sick Leave')),
                        DropdownMenuItem(value: 'PAID', child: Text(l10n?.paidLeave ?? 'Paid Leave')),
                        DropdownMenuItem(value: 'UNPAID', child: Text(l10n?.unpaidLeave ?? 'Unpaid Leave')),
                      ],
                      onChanged: (val) {
                        if (val != null) leaveType = val;
                      },
                    ),
                    const SizedBox(height: 16),

                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n?.startDate ?? 'Start Date', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText)),
                              const SizedBox(height: 6),
                              InkWell(
                                onTap: () async {
                                  final selected = await showDatePicker(
                                    context: context,
                                    initialDate: startDate,
                                    firstDate: DateTime.now(),
                                    lastDate: DateTime.now().add(const Duration(days: 90)),
                                  );
                                  if (selected != null) {
                                    setModalState(() {
                                      startDate = selected;
                                      if (endDate.isBefore(startDate)) {
                                        endDate = startDate;
                                      }
                                    });
                                  }
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0B0F19),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: Colors.white10),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.between,
                                    children: [
                                      Text(DateFormat('dd MMM yyyy').format(startDate), style: const TextStyle(fontSize: 12)),
                                      const Icon(Icons.calendar_today_rounded, size: 14, color: AppTheme.neonCyan),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(l10n?.endDate ?? 'End Date', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText)),
                              const SizedBox(height: 6),
                              InkWell(
                                onTap: () async {
                                  final selected = await showDatePicker(
                                    context: context,
                                    initialDate: endDate,
                                    firstDate: startDate,
                                    lastDate: DateTime.now().add(const Duration(days: 90)),
                                  );
                                  if (selected != null) {
                                    setModalState(() => endDate = selected);
                                  }
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0B0F19),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: Colors.white10),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.between,
                                    children: [
                                      Text(DateFormat('dd MMM yyyy').format(endDate), style: const TextStyle(fontSize: 12)),
                                      const Icon(Icons.calendar_today_rounded, size: 14, color: AppTheme.neonCyan),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    Text(l10n?.reason ?? 'Reason', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: reasonController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        hintText: 'Enter reason details...',
                      ),
                    ),
                    const SizedBox(height: 20),

                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: ElevatedButton(
                        onPressed: isRequestLoading ? null : submitRequest,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.neonCyan,
                          foregroundColor: AppTheme.darkBg,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: isRequestLoading
                            ? const CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2)
                            : Text(l10n?.submitRequest ?? 'Submit Request', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _confirmCancelLeave(String requestId) {
    final l10n = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) {
        bool isDialogLoading = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> proceedCancel() async {
              setDialogState(() => isDialogLoading = true);
              try {
                final token = await _storage.read(key: 'access_token');
                final res = await http.delete(
                  Uri.parse('${ApiConfig.baseUrl}/leaves/requests/$requestId'),
                  headers: {'Authorization': 'Bearer $token'}
                ).timeout(const Duration(seconds: 10));

                if (res.statusCode != 200) {
                  throw Exception('Failed to cancel request.');
                }

                if (context.mounted) {
                  Navigator.of(context).pop();
                  _showSuccessSnackbar('Request cancelled successfully.');
                  _loadDashboardData();
                }
              } catch (e) {
                if (context.mounted) {
                  Navigator.of(context).pop();
                  _showErrorSnackbar(e.toString());
                }
              }
            }

            return AlertDialog(
              backgroundColor: AppTheme.cardBg,
              title: Text(l10n?.confirmAction ?? 'Are you sure?'),
              content: Text(l10n?.confirmCancelRequest ?? 'Do you want to cancel this pending leave request?'),
              actions: [
                TextButton(
                  onPressed: isDialogLoading ? null : () => Navigator.of(context).pop(),
                  child: Text(l10n?.cancel ?? 'Cancel', style: const TextStyle(color: Colors.white70)),
                ),
                ElevatedButton(
                  onPressed: isDialogLoading ? null : proceedCancel,
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorRed),
                  child: isDialogLoading 
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 1.5))
                      : Text(l10n?.confirm ?? 'Confirm', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildSettingsTab(AppLocalizations? l10n) {
    final oldPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    bool isPassUpdating = false;
    String? passError;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            (l10n?.profileDetails ?? 'Profile Details').toUpperCase(),
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.cardBg.withOpacity(0.3),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.04)),
            ),
            child: Column(
              children: [
                _buildProfileDetailRow(l10n?.employeeId ?? 'Employee ID', _employeeId, Icons.badge_outlined),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow(l10n?.appName ?? 'Full Name', _fullName, Icons.person_outline_rounded),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow('Department', _departmentName, Icons.layers_outlined),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow('Shift Timings', _shiftName, Icons.schedule_rounded),
              ],
            ),
          ),
          const SizedBox(height: 24),

          Text(
            (l10n?.changePassword ?? 'Change Password').toUpperCase(),
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
          ),
          const SizedBox(height: 12),
          StatefulBuilder(
            builder: (context, setPassState) {
              Future<void> updatePassword() async {
                final oldP = oldPasswordController.text;
                final newP = newPasswordController.text;
                final confP = confirmPasswordController.text;

                if (oldP.isEmpty || newP.isEmpty || confP.isEmpty) {
                  setPassState(() => passError = 'All fields are required.');
                  return;
                }

                if (newP.length < 6) {
                  setPassState(() => passError = l10n?.passwordTooShort ?? 'Password must be at least 6 characters');
                  return;
                }

                if (newP != confP) {
                  setPassState(() => passError = l10n?.passwordsDoNotMatch ?? 'Passwords do not match');
                  return;
                }

                setPassState(() {
                  isPassUpdating = true;
                  passError = null;
                });

                try {
                  final token = await _storage.read(key: 'access_token');
                  final res = await http.post(
                    Uri.parse('${ApiConfig.baseUrl}/auth/change-password'),
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': 'Bearer $token'
                    },
                    body: jsonEncode({
                      'old_password': oldP,
                      'new_password': newP
                    })
                  ).timeout(const Duration(seconds: 10));

                  final data = jsonDecode(res.body);
                  if (res.statusCode != 200 || data['success'] != true) {
                    throw Exception(data['message'] ?? 'Failed to update password.');
                  }

                  oldPasswordController.clear();
                  newPasswordController.clear();
                  confirmPasswordController.clear();
                  _showSuccessSnackbar('Password changed successfully.');
                  setPassState(() {
                    isPassUpdating = false;
                  });
                } catch (e) {
                  setPassState(() {
                    isPassUpdating = false;
                    passError = e.toString().replaceAll('Exception:', '');
                  });
                }
              }

              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.04)),
                ),
                child: Column(
                  children: [
                    if (passError != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed.withOpacity(0.2)),
                        ),
                        child: Text(passError!, style: const TextStyle(color: AppTheme.errorRed, fontSize: 11)),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: oldPasswordController,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: l10n?.oldPassword ?? 'Current Password',
                        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 16),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: newPasswordController,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: l10n?.newPassword ?? 'New Password',
                        prefixIcon: const Icon(Icons.lock_open_rounded, size: 16),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: confirmPasswordController,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: l10n?.confirmNewPassword ?? 'Confirm New Password',
                        prefixIcon: const Icon(Icons.lock_reset_rounded, size: 16),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 44,
                      child: ElevatedButton(
                        onPressed: isPassUpdating ? null : updatePassword,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.neonCyan,
                          foregroundColor: AppTheme.darkBg,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: isPassUpdating
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2),
                              )
                            : Text(l10n?.update ?? 'Update', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),

          Text(
            (l10n?.selectLanguage ?? 'Language').toUpperCase(),
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppTheme.cardBg.withOpacity(0.3),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withOpacity(0.04)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.language_rounded, size: 18, color: AppTheme.neonCyan),
                    const SizedBox(width: 10),
                    Text(l10n?.selectLanguage ?? 'App Language', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  ],
                ),
                Row(
                  children: [
                    Text(l10n?.english ?? 'English', style: TextStyle(fontSize: 11, color: Provider.of<LanguageProvider>(context).locale.languageCode == 'en' ? AppTheme.neonCyan : Colors.white60)),
                    Switch(
                      value: Provider.of<LanguageProvider>(context).locale.languageCode == 'hi',
                      activeColor: AppTheme.neonCyan,
                      activeTrackColor: AppTheme.neonCyan.withOpacity(0.2),
                      inactiveThumbColor: Colors.white70,
                      inactiveTrackColor: Colors.white10,
                      onChanged: (val) {
                        final provider = Provider.of<LanguageProvider>(context, listen: false);
                        provider.changeLanguage(val ? 'hi' : 'en');
                      },
                    ),
                    Text(l10n?.hindi ?? 'Hindi', style: TextStyle(fontSize: 11, color: Provider.of<LanguageProvider>(context).locale.languageCode == 'hi' ? AppTheme.neonCyan : Colors.white60)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _buildProfileDetailRow(String label, String value, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppTheme.mutedText),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 9, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
              const SizedBox(height: 3),
              Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'GAYTRI WORKFORCE',
              style: TextStyle(fontFamily: 'Outfit', fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
            Row(
              children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  _isOnline ? 'Sync Server Online' : 'Offline Mode',
                  style: TextStyle(fontSize: 9, color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppTheme.errorRed, size: 20),
            onPressed: _logout,
            tooltip: l10n?.logout ?? 'Log Out',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(color: AppTheme.neonCyan),
                  SizedBox(height: 16),
                  Text('Connecting workspace...', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
                ],
              ),
            )
          : IndexedStack(
              index: _currentIndex,
              children: [
                _buildHomeTab(l10n),
                _buildLeavesTab(l10n),
                _buildSettingsTab(l10n),
              ],
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home_rounded, color: AppTheme.darkBg),
            label: l10n?.dashboard ?? 'Home',
          ),
          NavigationDestination(
            icon: const Icon(Icons.flight_takeoff_outlined),
            selectedIcon: const Icon(Icons.flight_takeoff_rounded, color: AppTheme.darkBg),
            label: l10n?.leaves ?? 'Leaves',
          ),
          NavigationDestination(
            icon: const Icon(Icons.settings_outlined),
            selectedIcon: const Icon(Icons.settings_rounded, color: AppTheme.darkBg),
            label: l10n?.settings ?? 'Settings',
          ),
        ],
      ),
    );
  }
}
