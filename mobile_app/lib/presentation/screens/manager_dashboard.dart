import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/providers/language_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/employee_model.dart';
import 'login_screen.dart';

class ManagerDashboard extends StatefulWidget {
  const ManagerDashboard({super.key});

  @override
  State<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends State<ManagerDashboard> {
  final _storage = const FlutterSecureStorage();
  int _currentIndex = 0;
  bool _isLoading = true;
  bool _isOnline = true;
  Timer? _clockTimer;
  Timer? _connectivityTimer;
  String _currentTimeString = '';
  String _currentDayString = '';

  // Profile data
  String _fullName = '';

  // Dashboard KPI data
  int _totalStaff = 0;
  int _presentStaff = 0;
  int _absentStaff = 0;
  int _workingStaff = 0;
  List<dynamic> _recentLogs = [];

  // Attendance Tab Data
  List<EmployeeModel> _employees = [];
  final Map<String, String> _localStatuses = {}; // employee.id -> status
  final Map<String, String> _originalStatuses = {}; // employee.id -> status in DB
  final Map<String, String> _localRemarks = {}; // employee.id -> remarks
  final Map<String, String> _originalRemarks = {}; // employee.id -> remarks in DB
  final Map<String, String?> _checkInTimes = {}; // employee.id -> check_in_time
  final Map<String, String?> _checkOutTimes = {}; // employee.id -> check_out_time
  final Set<String> _checkingOutEmpIds = {}; // employee.id -> currently checking out
  bool _isSavingAttendance = false;
  String _selectedFilter = 'ALL';
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _startClock();
    _loadAllData();
    _startConnectivityTimer();
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _connectivityTimer?.cancel();
    _searchController.dispose();
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

  Future<void> _loadAllData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        _logout();
        return;
      }

      // 1. Profile details
      final profileRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (profileRes.statusCode == 401 || profileRes.statusCode == 403) {
        _logout();
        return;
      }

      if (profileRes.statusCode == 200) {
        final data = jsonDecode(profileRes.body);
        if (data['success'] == true) {
          final user = data['user'] ?? {};
          _fullName = user['full_name'] ?? '';
        }
      }

      // 2. Fetch dashboard numbers
      final dashRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/attendance/dashboard'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (dashRes.statusCode == 200) {
        final data = jsonDecode(dashRes.body);
        if (data['success'] == true) {
          final stats = data['stats'] ?? {};
          _totalStaff = stats['totalStaff'] ?? 0;
          _presentStaff = stats['present'] ?? 0;
          _absentStaff = stats['absent'] ?? 0;
          _workingStaff = stats['working'] ?? 0;
          _recentLogs = data['recent_logs'] ?? [];
        }
      }

      // 3. Fetch Roster Employees
      final empRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/employees'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (empRes.statusCode == 200) {
        final data = jsonDecode(empRes.body);
        if (data['success'] == true) {
          final List list = data['employees'] ?? [];
          _employees = list.map((e) => EmployeeModel.fromJson(e)).toList();
        }
      }

      // 4. Fetch today's actual saved attendance from server
      final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final historyRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/attendance/history?start_date=$todayStr&end_date=$todayStr'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (historyRes.statusCode == 200) {
        final data = jsonDecode(historyRes.body);
        if (data['success'] == true) {
          final List logs = data['logs'] ?? [];
          _originalStatuses.clear();
          _originalRemarks.clear();
          _checkInTimes.clear();
          _checkOutTimes.clear();

          for (var log in logs) {
            final empId = log['employee_uuid']?.toString() ?? log['employee_id']?.toString();
            final status = log['status']?.toString() ?? 'PRESENT';
            final remarks = log['remarks']?.toString() ?? '';
            final cIn = log['check_in_time']?.toString() ?? log['time']?.toString();
            final cOut = log['check_out']?.toString() ?? log['check_out_time']?.toString();

            if (empId != null) {
              _originalStatuses[empId] = status;
              _originalRemarks[empId] = remarks;
              _checkInTimes[empId] = cIn;
              _checkOutTimes[empId] = cOut;
              _localStatuses[empId] = status;
              _localRemarks[empId] = remarks;
            }
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

  void _showLogoutDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.cardBg,
        title: const Text('Logout', style: TextStyle(fontFamily: 'Outfit', fontSize: 16, fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to log out of Gaytri Commercial?', style: TextStyle(fontSize: 13, color: AppTheme.mutedText)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _logout();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.errorRed,
              foregroundColor: Colors.white,
            ),
            child: const Text('Logout', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  bool get _hasEdits {
    if (_localStatuses.length != _originalStatuses.length) return true;
    for (var key in _localStatuses.keys) {
      if (_localStatuses[key] != _originalStatuses[key]) return true;
    }
    for (var key in _localRemarks.keys) {
      if (_localRemarks[key] != _originalRemarks[key]) return true;
    }
    return false;
  }

  int get _pendingAttendanceCount {
    int count = 0;
    for (var emp in _employees) {
      if (_localStatuses.containsKey(emp.id) && _originalStatuses[emp.id] == null) {
        count++;
      }
    }
    return count;
  }

  String _formatTo12Hour(String? timeStr) {
    if (timeStr == null || timeStr.isEmpty || timeStr == '--:--') return '--:--';
    try {
      if (timeStr.contains('T')) {
        final dt = DateTime.parse(timeStr).toLocal();
        return DateFormat('hh:mm a').format(dt);
      }
      final parts = timeStr.split(':');
      final hour = int.parse(parts[0]);
      final minute = parts[1];
      final period = hour >= 12 ? 'PM' : 'AM';
      final h12 = hour % 12 == 0 ? 12 : hour % 12;
      return '${h12.toString().padLeft(2, '0')}:$minute $period';
    } catch (_) {
      return timeStr;
    }
  }

  void _clearLocalEdits() {
    setState(() {
      _localStatuses.clear();
      _localRemarks.clear();
      _originalStatuses.forEach((key, val) {
        _localStatuses[key] = val;
      });
      _originalRemarks.forEach((key, val) {
        _localRemarks[key] = val;
      });
    });
    _showSuccessSnackbar('Local modifications cleared.');
  }

  Future<void> _saveAttendanceRoster() async {
    final token = await _storage.read(key: 'access_token');
    if (token == null) {
      _showErrorSnackbar('Session expired. Please sign in again.');
      return;
    }

    final List<Map<String, dynamic>> records = [];
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

    for (var emp in _employees) {
      final localS = _localStatuses[emp.id];
      final localR = _localRemarks[emp.id] ?? '';

      // Only submit pending records whose attendance has not yet been recorded for today
      if (localS != null && _originalStatuses[emp.id] == null) {
        records.add({
          'employee_id': emp.id,
          'status': localS,
          'remarks': localR
        });
      }
    }

    if (records.isEmpty) {
      _showErrorSnackbar('No pending attendance records to save.');
      return;
    }

    setState(() {
      _isSavingAttendance = true;
    });

    try {
      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/attendance/mark'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        },
        body: jsonEncode({
          'date': todayStr,
          'records': records
        })
      ).timeout(const Duration(seconds: 15));

      Map<String, dynamic>? data;
      try {
        data = jsonDecode(response.body);
      } catch (_) {}

      if (response.statusCode == 200 && data != null && data['success'] == true) {
        final int saved = data['saved'] ?? records.length;
        final int skipped = data['skipped'] ?? 0;
        final String msg = skipped > 0 
            ? 'Attendance saved: $saved record(s) saved, $skipped skipped.' 
            : 'Attendance roster saved successfully ($saved record(s)).';
        _showSuccessSnackbar(msg);
        await _loadAllData();
      } else {
        final String rawMsg = data?['message'] ?? 'Failed to save attendance roster.';
        _showErrorSnackbar(rawMsg);
      }
    } on TimeoutException {
      _showErrorSnackbar('Request timed out. Please check network connection.');
    } on http.ClientException {
      _showErrorSnackbar('No internet connection. Please check your network.');
    } catch (e) {
      _showErrorSnackbar(e.toString().replaceAll('Exception:', '').trim());
    } finally {
      if (mounted) {
        setState(() {
          _isSavingAttendance = false;
        });
      }
    }
  }

  Future<void> _checkOutEmployee(EmployeeModel emp) async {
    if (_checkingOutEmpIds.contains(emp.id)) return;

    final token = await _storage.read(key: 'access_token');
    final l10n = AppLocalizations.of(context)!;
    if (token == null) {
      _showErrorSnackbar(l10n.sessionExpired);
      return;
    }

    setState(() {
      _checkingOutEmpIds.add(emp.id);
    });

    final url = Uri.parse('${ApiConfig.baseUrl}/attendance/check-out');
    final headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
    final payloadMap = {
      'employee_id': emp.id,
    };
    final payloadJson = jsonEncode(payloadMap);

    print('Checkout Request');
    print('URL: $url');
    print('Payload: $payloadJson');
    print('Headers: $headers');

    try {
      final response = await http.post(
        url,
        headers: headers,
        body: payloadJson,
      ).timeout(const Duration(seconds: 10));

      print('Response Code: ${response.statusCode}');
      print('Response Body: ${response.body}');

      Map<String, dynamic>? data;
      try {
        data = jsonDecode(response.body);
      } catch (e) {
        print('Exception parsing response body: $e');
      }

      if (response.statusCode == 200 && data != null && data['success'] == true) {
        final checkOutTimeStr = data['attendance']?['check_out_time'] ?? DateTime.now().toString().substring(11, 16);
        setState(() {
          _checkOutTimes[emp.id] = checkOutTimeStr;
        });
        _showSuccessSnackbar('${emp.fullName} ${l10n.checkedOutSuccess}');
        await _loadAllData();
      } else {
        final backendError = data?['message'];
        final msg = backendError ?? (response.statusCode == 404
            ? 'Checkout endpoint not found (404).'
            : response.statusCode == 401
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
    } finally {
      if (mounted) {
        setState(() {
          _checkingOutEmpIds.remove(emp.id);
        });
      }
    }
  }

  void _showSuccessSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle_outline_rounded, color: AppTheme.successGreen),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white))),
          ],
        ),
        backgroundColor: AppTheme.cardBg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
      ),
    );
  }

  void _markAllPresent() {
    setState(() {
      for (var emp in _employees) {
        _localStatuses[emp.id] = 'PRESENT';
      }
    });
    _showSuccessSnackbar('All employees marked as Present locally.');
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
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  _isOnline ? 'Manager Terminal Online' : 'Offline Mode',
                  style: TextStyle(fontSize: 9, color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.language_rounded, color: AppTheme.neonCyan, size: 20),
            onPressed: () {
              final provider = Provider.of<LanguageProvider>(context, listen: false);
              final isHi = provider.locale.languageCode == 'hi';
              final nextLang = isHi ? 'en' : 'hi';
              provider.changeLanguage(nextLang);
              _showSuccessSnackbar(nextLang == 'hi' ? 'भाषा बदलकर हिंदी की गई' : 'Language set to English');
            },
            tooltip: l10n?.selectLanguage ?? 'Language',
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppTheme.mutedText, size: 20),
            onPressed: _loadAllData,
            tooltip: 'Refresh Data',
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppTheme.errorRed, size: 20),
            onPressed: _showLogoutDialog,
            tooltip: l10n?.logout ?? 'Logout',
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(color: AppTheme.neonCyan),
                  SizedBox(height: 16),
                  Text('Loading manager portal...', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
                ],
              ),
            )
          : IndexedStack(
              index: _currentIndex,
              children: [
                _buildDashboardTab(l10n),
                _buildAttendanceTab(l10n),
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
            icon: const Icon(Icons.dashboard_outlined),
            selectedIcon: const Icon(Icons.dashboard_rounded, color: AppTheme.darkBg),
            label: l10n?.dashboard ?? 'Dashboard',
          ),
          NavigationDestination(
            icon: const Icon(Icons.how_to_reg_outlined),
            selectedIcon: const Icon(Icons.how_to_reg_rounded, color: AppTheme.darkBg),
            label: l10n?.attendance ?? 'Attendance',
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardTab(AppLocalizations? l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.cardBg.withOpacity(0.4),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: AppTheme.neonCyan.withOpacity(0.1),
                  radius: 22,
                  child: const Icon(Icons.person_rounded, color: AppTheme.neonCyan, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hello, ${_fullName.isNotEmpty ? _fullName : "Manager"}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$_currentDayString  •  $_currentTimeString',
                        style: const TextStyle(fontSize: 11, color: AppTheme.mutedText, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // 2x2 KPI Grid
          Row(
            children: [
              Expanded(child: _buildKPICard('Total Employees', '$_totalStaff', Colors.indigo, Icons.people_alt_rounded)),
              const SizedBox(width: 10),
              Expanded(child: _buildKPICard(l10n?.present ?? 'Present Today', '$_presentStaff', AppTheme.successGreen, Icons.check_circle_rounded)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _buildKPICard(l10n?.absent ?? 'Absent Today', '$_absentStaff', AppTheme.errorRed, Icons.cancel_rounded)),
              const SizedBox(width: 10),
              Expanded(child: _buildKPICard('Active Working', '$_workingStaff', Colors.lightBlue, Icons.access_time_filled_rounded)),
            ],
          ),
          const SizedBox(height: 24),

          // Attendance Activity Feed
          Text(
            (l10n?.attendanceActivity ?? 'Recent Attendance Activity').toUpperCase(),
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
              child: const Center(
                child: Text('No attendance activity recorded today.', style: TextStyle(fontSize: 12, color: AppTheme.mutedText)),
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
                              log['full_name'] ?? 'Employee',
                              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'ID: ${log['employee_id'] ?? ''}  •  ${log['department'] ?? 'General'}',
                              style: const TextStyle(fontSize: 10, color: AppTheme.mutedText),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
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
                          const SizedBox(height: 4),
                          Text(
                            log['check_in_time'] != null ? 'In: ${log['check_in_time']}' : '',
                            style: const TextStyle(fontSize: 9.5, color: AppTheme.mutedText, fontFamily: 'monospace'),
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
    );
  }

  Widget _buildKPICard(String label, String value, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color),
                ),
                Text(
                  label,
                  style: const TextStyle(fontSize: 10, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceTab(AppLocalizations? l10n) {
    final search = _searchController.text.toLowerCase().trim();
    final filtered = _employees.where((emp) {
      final matchesSearch = emp.fullName.toLowerCase().contains(search) || emp.employeeId.toLowerCase().contains(search);
      if (!matchesSearch) return false;

      final status = _localStatuses[emp.id];
      if (_selectedFilter == 'PRESENT') return status == 'PRESENT' || status == 'WORKING';
      if (_selectedFilter == 'ABSENT') return status == 'ABSENT';
      return true;
    }).toList();

    return Column(
      children: [
        // Controls Header
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              // Search Bar
              TextField(
                controller: _searchController,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: l10n?.searchEmployee ?? 'Search employee by name or ID...',
                  prefixIcon: const Icon(Icons.search_rounded, color: AppTheme.mutedText, size: 20),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded, size: 18, color: AppTheme.mutedText),
                          onPressed: () {
                            _searchController.clear();
                            setState(() {});
                          },
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 12),

              // Filter Chips Row & Mark All Present
              Row(
                children: [
                  Wrap(
                    spacing: 6,
                    children: [
                      _buildFilterChip('ALL', 'All (${_employees.length})'),
                      _buildFilterChip('PRESENT', 'Present'),
                      _buildFilterChip('ABSENT', 'Absent'),
                    ],
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: _markAllPresent,
                    icon: const Icon(Icons.done_all_rounded, size: 16, color: AppTheme.neonCyan),
                    label: Text(
                      l10n?.markAllPresent ?? 'Mark All Present',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Employees Roster List
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Text(
                    l10n?.noEmployeesFound ?? 'No employees found',
                    style: const TextStyle(fontSize: 12, color: AppTheme.mutedText),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final emp = filtered[index];
                    final currentStatus = _localStatuses[emp.id];
                    final remarks = _localRemarks[emp.id] ?? '';
                    final checkInTime = _checkInTimes[emp.id];
                    final checkOutTime = _checkOutTimes[emp.id];
                    final originalStatus = _originalStatuses[emp.id];
                    final effectiveStatus = originalStatus ?? currentStatus ?? '';

                    // Visibility Rules Matrix:
                    // Show Check Out button ONLY when:
                    // 1) attendance_status is PRESENT/WORKING/LATE (ABSENT employees NEVER get Check Out)
                    // 2) check_in_time exists
                    // 3) check_out_time is NULL
                    final bool isPresentStatus = effectiveStatus == 'PRESENT' || effectiveStatus == 'WORKING' || effectiveStatus == 'LATE';
                    final bool hasCheckInTime = checkInTime != null && checkInTime != '--:--';
                    final bool hasNoCheckOutTime = checkOutTime == null || checkOutTime == '--:--';
                    final bool showCheckOut = isPresentStatus && hasCheckInTime && hasNoCheckOutTime;
                    final bool hasCheckedOut = checkOutTime != null && checkOutTime != '--:--';
                    final bool isCheckingOut = _checkingOutEmpIds.contains(emp.id);

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppTheme.cardBg.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: currentStatus != null 
                              ? AppTheme.neonCyan.withOpacity(0.15) 
                              : Colors.white.withOpacity(0.04),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Top row: Avatar, Info & Remarks button
                          Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: AppTheme.darkBg,
                                radius: 18,
                                child: Text(
                                  emp.fullName.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(color: AppTheme.neonCyan, fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(emp.fullName, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: Colors.white)),
                                    const SizedBox(height: 2),
                                    Text('ID: ${emp.employeeId}  •  ${emp.department}', style: const TextStyle(fontSize: 10.5, color: AppTheme.mutedText)),
                                    if (checkInTime != null || checkOutTime != null) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        'In: ${checkInTime ?? "--"} ${checkOutTime != null ? "• Out: $checkOutTime" : ""}',
                                        style: const TextStyle(fontSize: 9.5, color: AppTheme.successGreen, fontFamily: 'monospace', fontWeight: FontWeight.bold),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: Icon(
                                  remarks.isNotEmpty ? Icons.comment_rounded : Icons.comment_outlined, 
                                  color: remarks.isNotEmpty ? AppTheme.neonCyan : AppTheme.mutedText,
                                  size: 18,
                                ),
                                onPressed: hasCheckedOut ? null : () => _showRemarksDialog(emp),
                                tooltip: 'Add Remarks',
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),

                          // Attendance Status Choice & Checkout Action Widget
                          Row(
                            children: [
                              Expanded(
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: AppTheme.darkBg,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.white10),
                                  ),
                                  child: Row(
                                    children: [
                                      _buildSegmentButton(emp, 'PRESENT', l10n?.present ?? 'Present', Icons.check_circle_outline_rounded, AppTheme.successGreen, currentStatus, hasCheckedOut),
                                    ],
                                  ),
                                ),
                              ),

                              // Checkout Action Widget according to rules matrix
                              if (showCheckOut) ...[
                                const SizedBox(width: 8),
                                SizedBox(
                                  height: 38,
                                  child: ElevatedButton.icon(
                                    onPressed: isCheckingOut ? null : () => _checkOutEmployee(emp),
                                    icon: isCheckingOut
                                        ? const SizedBox(
                                            width: 14,
                                            height: 14,
                                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                          )
                                        : const Icon(Icons.logout_rounded, size: 14),
                                    label: const Text('Check Out', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.amber.shade700,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 10),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                    ),
                                  ),
                                ),
                              ] else if (hasCheckedOut) ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: AppTheme.successGreen.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: AppTheme.successGreen.withOpacity(0.3)),
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: [
                                      const Text(
                                        'Checked Out',
                                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.successGreen),
                                      ),
                                      Text(
                                        _formatTo12Hour(checkOutTime),
                                        style: const TextStyle(fontSize: 9, color: Colors.white70, fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                              ] else if (effectiveStatus == 'ABSENT') ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: AppTheme.errorRed.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: AppTheme.errorRed.withOpacity(0.3)),
                                  ),
                                  child: const Text(
                                    'Absent',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.errorRed),
                                  ),
                                ),
                              ] else ...[
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                  decoration: BoxDecoration(
                                    color: Colors.orange.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.orange.withOpacity(0.3)),
                                  ),
                                  child: const Text(
                                    'Pending',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.orange),
                                  ),
                                ),
                              ],
                            ],
                          ),

                          if (remarks.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              'Remarks: $remarks',
                              style: const TextStyle(fontSize: 10.5, color: Colors.orangeAccent, fontStyle: FontStyle.italic),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),

        // Sticky Save Attendance Roster Bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.cardBg,
            border: Border(top: BorderSide(color: Colors.white.withOpacity(0.08))),
          ),
          child: Row(
            children: [
              if (_hasEdits) ...[
                IconButton(
                  onPressed: _clearLocalEdits,
                  icon: const Icon(Icons.refresh, color: AppTheme.errorRed),
                  tooltip: 'Reset Changes',
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: SizedBox(
                  height: 46,
                  child: ElevatedButton(
                    onPressed: _isSavingAttendance ? null : _saveAttendanceRoster,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.neonCyan,
                      foregroundColor: AppTheme.darkBg,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      disabledBackgroundColor: AppTheme.neonCyan.withOpacity(0.4),
                    ),
                    child: _isSavingAttendance
                        ? const CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2)
                        : Text(
                            'Save Attendance (${_pendingAttendanceCount})',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final bool isSelected = _selectedFilter == value;
    return ChoiceChip(
      label: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: isSelected ? AppTheme.darkBg : Colors.white70)),
      selected: isSelected,
      selectedColor: AppTheme.neonCyan,
      backgroundColor: AppTheme.cardBg,
      onSelected: (_) {
        setState(() => _selectedFilter = value);
      },
    );
  }

  Widget _buildSegmentButton(EmployeeModel emp, String status, String label, IconData icon, Color color, String? currentStatus, [bool isLocked = false]) {
    final bool isSelected = currentStatus == status;
    return Expanded(
      child: InkWell(
        onTap: isLocked ? null : () {
          setState(() {
            _localStatuses[emp.id] = status;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(isLocked ? 0.08 : 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: isSelected ? (isLocked ? color.withOpacity(0.5) : color) : AppTheme.mutedText, size: 15),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11, 
                  fontWeight: FontWeight.bold, 
                  color: isSelected ? (isLocked ? color.withOpacity(0.5) : color) : AppTheme.mutedText
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRemarksDialog(EmployeeModel emp) {
    final controller = TextEditingController(text: _localRemarks[emp.id] ?? '');
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: AppTheme.cardBg,
          title: Text('Remarks for ${emp.fullName}', style: const TextStyle(fontFamily: 'Outfit', fontSize: 16)),
          content: TextField(
            controller: controller,
            maxLines: 2,
            decoration: const InputDecoration(
              hintText: 'Enter attendance description...',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _localRemarks[emp.id] = controller.text.trim();
                });
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.neonCyan, foregroundColor: AppTheme.darkBg),
              child: const Text('Save Remarks'),
            ),
          ],
        );
      },
    );
  }
}
