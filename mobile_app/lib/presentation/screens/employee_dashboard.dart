import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
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
  bool _requirePasswordChange = false;

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

      // Trigger Force Password Change dialog if required
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
              } else if (logDate != null) {
                // Handle JSON datetime parsing
                try {
                  final parsed = DateTime.parse(logDate.toString());
                  return DateFormat('yyyy-MM-dd').format(parsed) == todayStr;
                } catch (_) {}
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
            
            // Adjust status presentation
            if (todayLog['check_out'] == null) {
              _attendanceStatus = 'Checked In';
            }
          } else {
            // Reset today's details if no log
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

              if (newPass.length < 4) {
                setDialogState(() => dialogError = 'Password must be at least 4 characters long.');
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
                    'old_password': '', // Empty old password allowed on force first reset
                    'new_password': newPass,
                  }),
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(response.body);

                if (response.statusCode != 200 || data['success'] != true) {
                  throw Exception(data['message'] ?? 'Failed to update password.');
                }

                if (context.mounted) {
                  Navigator.of(context).pop(); // Dismiss force reset modal
                  _showSuccessSnackbar('Password updated successfully. Account secured.');
                  _loadDashboardData(); // Reload dashboard state
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
                          color: AppTheme.errorRed.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed.withValues(alpha: 0.3)),
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

  void _showChangePasswordMenuDialog() {
    showDialog(
      context: context,
      builder: (context) {
        final oldPasswordController = TextEditingController();
        final newPasswordController = TextEditingController();
        final confirmPasswordController = TextEditingController();
        bool isMenuDialogLoading = false;
        String? menuDialogError;

        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submitPasswordUpdate() async {
              final oldPass = oldPasswordController.text;
              final newPass = newPasswordController.text;
              final confirmPass = confirmPasswordController.text;

              if (oldPass.isEmpty || newPass.isEmpty || confirmPass.isEmpty) {
                setDialogState(() => menuDialogError = 'All fields are required.');
                return;
              }

              if (newPass.length < 4) {
                setDialogState(() => menuDialogError = 'New password must be at least 4 characters long.');
                return;
              }

              if (newPass != confirmPass) {
                setDialogState(() => menuDialogError = 'Passwords do not match.');
                return;
              }

              setDialogState(() {
                isMenuDialogLoading = true;
                menuDialogError = null;
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
                    'old_password': oldPass,
                    'new_password': newPass,
                  }),
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(response.body);

                if (response.statusCode != 200 || data['success'] != true) {
                  throw Exception(data['message'] ?? 'Incorrect current password.');
                }

                if (context.mounted) {
                  Navigator.of(context).pop(); // Dismiss change password menu
                  _showSuccessSnackbar('Password updated successfully.');
                }
              } catch (err) {
                setDialogState(() {
                  isMenuDialogLoading = false;
                  menuDialogError = err.toString().replaceAll('Exception:', '');
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
                  Icon(Icons.key_rounded, color: AppTheme.neonCyan),
                  SizedBox(width: 10),
                  Text('Change Password', style: TextStyle(fontFamily: 'Outfit', fontSize: 18)),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (menuDialogError != null) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          menuDialogError!,
                          style: const TextStyle(color: AppTheme.errorRed, fontSize: 10.5, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: oldPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Current Password',
                        prefixIcon: Icon(Icons.lock_outline_rounded, size: 18),
                        hintText: '••••••••',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: newPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'New Password',
                        prefixIcon: Icon(Icons.lock_open_rounded, size: 18),
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
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton(
                  onPressed: isMenuDialogLoading ? null : submitPasswordUpdate,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.neonCyan,
                    foregroundColor: AppTheme.darkBg,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: isMenuDialogLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 1.5),
                        )
                      : const Text('Update', style: TextStyle(fontWeight: FontWeight.bold)),
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
          side: BorderSide(color: AppTheme.successGreen.withValues(alpha: 0.3)),
        ),
        margin: const EdgeInsets.all(20),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
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
            icon: const Icon(Icons.vpn_key_rounded, color: Colors.white70, size: 20),
            onPressed: _showChangePasswordMenuDialog,
            tooltip: 'Change Password',
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppTheme.errorRed, size: 20),
            onPressed: _logout,
            tooltip: 'Log Out',
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
                  Text('Securing connection...', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: _loadDashboardData,
              color: AppTheme.neonCyan,
              backgroundColor: AppTheme.cardBg,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Greeting Header
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
                    
                    // Time and Shift Label
                    Row(
                      children: [
                        const Icon(Icons.calendar_today_rounded, size: 12, color: AppTheme.neonCyan),
                        const SizedBox(width: 6),
                        Text(
                          '$_currentDayString  •  $_currentTimeString  •  ',
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
                          color: AppTheme.errorRed.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppTheme.errorRed.withValues(alpha: 0.2)),
                        ),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppTheme.errorRed, fontSize: 11.5),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),

                    // Today's Attendance Card
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [AppTheme.cardBg, AppTheme.cardBg.withValues(alpha: 0.5)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
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
                                      ? AppTheme.successGreen.withValues(alpha: 0.1)
                                      : _attendanceStatus == 'LATE'
                                          ? Colors.orange.withValues(alpha: 0.1)
                                          : Colors.white.withValues(alpha: 0.05),
                                  borderRadius: BorderRadius.circular(30),
                                  border: Border.all(
                                    color: (_attendanceStatus == 'Checked In' || _attendanceStatus == 'PRESENT')
                                        ? AppTheme.successGreen.withValues(alpha: 0.3)
                                        : _attendanceStatus == 'LATE'
                                            ? Colors.orange.withValues(alpha: 0.3)
                                            : Colors.white.withValues(alpha: 0.1),
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
                    const SizedBox(height: 28),



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
                          color: AppTheme.cardBg.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.03)),
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
                          
                          // Format Date
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
                              color: AppTheme.cardBg.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.04)),
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
                                  child: const Icon(
                                    Icons.fingerprint_rounded, 
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
                                        checkOut != null 
                                            ? 'In: $checkIn  •  Out: $checkOut'
                                            : 'Checked In: $checkIn',
                                        style: const TextStyle(fontSize: 10.5, color: AppTheme.mutedText),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    if (log['working_hours'] != null)
                                      Text(
                                        log['working_hours'],
                                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: Colors.white),
                                      ),
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: isLate ? AppTheme.errorRed.withValues(alpha: 0.1) : AppTheme.successGreen.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        status,
                                        style: TextStyle(
                                          fontSize: 7.5,
                                          fontWeight: FontWeight.bold,
                                          color: isLate ? AppTheme.errorRed : AppTheme.successGreen,
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
}
