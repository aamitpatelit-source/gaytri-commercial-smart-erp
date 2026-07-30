import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';
import 'login_screen.dart';

class EmployeeDashboard extends StatefulWidget {
  const EmployeeDashboard({super.key});

  @override
  State<EmployeeDashboard> createState() => _EmployeeDashboardState();
}

class _EmployeeDashboardState extends State<EmployeeDashboard> {
  final _storage = const FlutterSecureStorage();
  bool _isLoading = true;
  String? _error;

  String _fullName = '';
  String _employeeId = '';
  String _shiftName = 'Morning Shift';
  String _departmentName = 'Production';

  // Today's attendance metrics
  String _checkInTime = '--:--';
  String _checkOutTime = '--:--';
  String _workingHours = '0h 0m';
  String _attendanceStatus = 'Not Checked In';
  List<dynamic> _recentLogs = [];

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

  String _formatTo12Hour(String time24) {
    if (time24.isEmpty) return '--:--';
    try {
      final parts = time24.split(':');
      final hour = int.parse(parts[0]);
      final minute = parts[1];
      final period = hour >= 12 ? 'PM' : 'AM';
      final h12 = hour % 12 == 0 ? 12 : hour % 12;
      return '${h12.toString().padLeft(2, '0')}:$minute $period';
    } catch (_) {
      return time24;
    }
  }

  String _formatTimestampTo12Hour(String timestamp) {
    try {
      final dt = DateTime.parse(timestamp).toLocal();
      return DateFormat('hh:mm a').format(dt);
    } catch (_) {
      return timestamp;
    }
  }

  Future<void> _loadDashboardData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        _logout();
        return;
      }

      // 1. Fetch employee profile
      final meRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (meRes.statusCode == 401 || meRes.statusCode == 403) {
        _logout();
        return;
      }

      if (meRes.statusCode == 200) {
        final data = jsonDecode(meRes.body);
        final user = data['user'] ?? {};
        _fullName = user['full_name'] ?? '';
        _employeeId = user['employee_id'] ?? '';
        _shiftName = user['shift'] ?? 'Morning Shift';
        _departmentName = user['department'] ?? 'Production';
        
        await _storage.write(key: 'user', value: jsonEncode(user));
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
            _attendanceStatus = todayLog['status'] ?? 'PRESENT';
          } else {
            _checkInTime = '--:--';
            _checkOutTime = '--:--';
            _workingHours = '0h 0m';
            _attendanceStatus = 'Not Checked In';
          }
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

  Future<void> _handleCheckOut() async {
    final token = await _storage.read(key: 'access_token');
    final l10n = AppLocalizations.of(context)!;
    if (token == null) {
      _showErrorSnackbar(l10n.sessionExpired);
      return;
    }

    final url = Uri.parse('${ApiConfig.baseUrl}/attendance/check-out');
    final headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };

    print('Checkout Request');
    print('URL: $url');
    print('Payload: {}');
    print('Headers: $headers');

    try {
      final res = await http.post(
        url,
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      print('Response Code: ${res.statusCode}');
      print('Response Body: ${res.body}');

      Map<String, dynamic>? data;
      try {
        data = jsonDecode(res.body);
      } catch (e) {
        print('Exception parsing response body: $e');
      }

      if (res.statusCode == 200 && data != null && data['success'] == true) {
        _showSuccessSnackbar(l10n.checkedOutSuccess);
        await _loadDashboardData();
      } else {
        final backendError = data?['message'];
        final msg = backendError ?? (res.statusCode == 404
            ? 'Checkout endpoint not found (404).'
            : res.statusCode == 401
                ? l10n.sessionExpired
                : l10n.checkoutFailed);
        print('Checkout Failure Detail: $msg');
        _showErrorSnackbar(msg);
      }
    } on TimeoutException catch (e) {
      print('Exception: $e');
      _showErrorSnackbar(l10n.requestTimedOut);
    } on SocketException catch (e) {
      print('Exception: $e');
      _showErrorSnackbar(l10n.noInternetConnection);
    } on http.ClientException catch (e) {
      print('Exception: $e');
      _showErrorSnackbar(l10n.noInternetConnection);
    } catch (e) {
      print('Exception: $e');
      _showErrorSnackbar(e.toString().replaceAll('Exception:', '').trim());
    }
  }

  Future<void> _logout() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'user');
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const LoginScreen()),
      );
    }
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
            Expanded(child: Text(message, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white))),
          ],
        ),
        backgroundColor: AppTheme.cardBg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
                      Text(
                        l10n?.workforceOverview ?? "TODAY'S ATTENDANCE",
                        style: const TextStyle(
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
                              : Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(
                            color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                                ? AppTheme.successGreen.withOpacity(0.3)
                                : Colors.white.withOpacity(0.1),
                          ),
                        ),
                        child: Text(
                          _attendanceStatus == 'PRESENT'
                              ? (l10n?.present ?? 'PRESENT')
                              : _attendanceStatus == 'WORKING' || _attendanceStatus == 'Checked In'
                                  ? (l10n?.activeWorking ?? 'WORKING')
                                  : _attendanceStatus.toUpperCase(),
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                                ? AppTheme.successGreen
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
                      _buildAttendanceMetric(l10n?.todayCheckIn ?? 'Check In', _checkInTime, Icons.login_rounded, AppTheme.successGreen),
                      _buildAttendanceMetric(l10n?.todayCheckOut ?? 'Check Out', _checkOutTime, Icons.logout_rounded, AppTheme.errorRed),
                      _buildAttendanceMetric(l10n?.workedHours ?? 'Working Hours', _workingHours, Icons.timer_outlined, AppTheme.neonCyan),
                    ],
                  ),
                  const SizedBox(height: 20),
                  if (_checkInTime != '--:--' && _checkOutTime == '--:--')
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.errorRed,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          elevation: 2,
                        ),
                        icon: const Icon(Icons.logout_rounded, size: 18),
                        label: Text(
                          (l10n?.checkOut ?? 'CHECK OUT NOW').toUpperCase(),
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                        ),
                        onPressed: _isLoading ? null : _handleCheckOut,
                      ),
                    )
                  else if (_attendanceStatus == 'PRESENT')
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.successGreen.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.successGreen.withOpacity(0.2)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.check_circle_rounded, color: AppTheme.successGreen, size: 16),
                          const SizedBox(width: 8),
                          Text(
                            l10n?.attendanceSaved ?? 'TODAY\'S SHIFT COMPLETED',
                            style: const TextStyle(color: AppTheme.successGreen, fontSize: 11.5, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // History Log List
            Text(
              (l10n?.attendanceActivity ?? 'RECENT LOGS').toUpperCase(),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
            ),
            const SizedBox(height: 12),

            if (_recentLogs.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.04)),
                ),
                child: Center(
                  child: Text(l10n?.noActivityToday ?? 'No attendance history found.', style: const TextStyle(fontSize: 12, color: AppTheme.mutedText)),
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _recentLogs.length > 5 ? 5 : _recentLogs.length,
                itemBuilder: (context, index) {
                  final log = _recentLogs[index];
                  final status = log['status']?.toString() ?? 'PRESENT';
                  final isPresent = status == 'PRESENT' || status == 'WORKING';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.04)),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: isPresent ? AppTheme.successGreen.withOpacity(0.1) : AppTheme.errorRed.withOpacity(0.1),
                          child: Icon(
                            isPresent ? Icons.check_circle_outline_rounded : Icons.cancel_outlined,
                            color: isPresent ? AppTheme.successGreen : AppTheme.errorRed,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                log['date'] ?? '',
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                log['working_hours'] != null ? 'Hours: ${log["working_hours"]}' : 'In progress',
                                style: const TextStyle(fontSize: 10, color: AppTheme.mutedText),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: isPresent ? AppTheme.successGreen.withOpacity(0.15) : AppTheme.errorRed.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            status,
                            style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.bold,
                              color: isPresent ? AppTheme.successGreen : AppTheme.errorRed,
                            ),
                          ),
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
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white, fontFamily: 'monospace')),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 9.5, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
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
              'GAYTRI COMMERCIAL',
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
          : _buildHomeTab(l10n),
    );
  }
}
