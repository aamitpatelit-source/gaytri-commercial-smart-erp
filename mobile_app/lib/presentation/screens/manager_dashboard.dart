import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../l10n/app_localizations.dart';
import '../../core/providers/language_provider.dart';
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
  String? _error;
  bool _isOnline = true;
  Timer? _clockTimer;
  Timer? _connectivityTimer;
  String _currentTimeString = '';
  String _currentDayString = '';

  // Profile data
  String _fullName = '';
  String _email = '';
  String _role = 'MANAGER';
  List<dynamic> _assignedDepts = [];

  // Dashboard KPI data
  int _totalStaff = 0;
  int _presentStaff = 0;
  int _absentStaff = 0;
  int _lateStaff = 0;
  int _halfDayStaff = 0;
  int _leaveStaff = 0;
  List<dynamic> _recentLogs = [];

  // Attendance Tab Data
  List<EmployeeModel> _employees = [];
  final Map<String, String> _localStatuses = {}; // employee.id -> status
  final Map<String, String> _originalStatuses = {}; // employee.id -> status in DB
  final Map<String, String> _localRemarks = {}; // employee.id -> remarks
  final Map<String, String> _originalRemarks = {}; // employee.id -> remarks in DB
  bool _isSavingAttendance = false;
  String _selectedFilter = 'ALL';
  final _searchController = TextEditingController();

  // Leave Requests Data
  List<dynamic> _leaveRequests = [];

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
          _email = user['email'] ?? '';
          _role = user['role'] ?? 'MANAGER';
          _assignedDepts = user['departments'] ?? [];
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
          _lateStaff = stats['late'] ?? 0;
          _halfDayStaff = stats['half_day'] ?? 0;
          _leaveStaff = stats['leave'] ?? 0;
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
          print('--- ROSTER LOADED ---');
          for (var emp in _employees) {
            print('  - UUID: ${emp.id}, Code: ${emp.employeeId}, Name: ${emp.fullName}');
          }
          print('---------------------');
        }
      }

      // 4. Fetch today's actual saved attendance from server to sync roster
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
          
          for (var log in logs) {
            final empId = log['employee_id']?.toString();
            final status = log['status']?.toString() ?? 'PRESENT';
            final remarks = log['remarks']?.toString() ?? '';
            if (empId != null) {
              _originalStatuses[empId] = status;
              _originalRemarks[empId] = remarks;
              
              // Seed local map if not edited
              if (!_localStatuses.containsKey(empId)) {
                _localStatuses[empId] = status;
              }
              if (!_localRemarks.containsKey(empId)) {
                _localRemarks[empId] = remarks;
              }
            }
          }
        }
      }

      // 5. Fetch Leaves Requests
      final leaveRes = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/leaves/requests'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (leaveRes.statusCode == 200) {
        final data = jsonDecode(leaveRes.body);
        if (data['success'] == true) {
          _leaveRequests = data['requests'] ?? [];
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

  bool get _hasEdits {
    for (var emp in _employees) {
      final localS = _localStatuses[emp.id];
      final origS = _originalStatuses[emp.id];
      if (localS != origS) return true;

      final localR = _localRemarks[emp.id] ?? '';
      final origR = _originalRemarks[emp.id] ?? '';
      if (localR != origR) return true;
    }
    return false;
  }

  void _clearLocalEdits() {
    setState(() {
      _localStatuses.clear();
      _localRemarks.clear();
      // Restore values from original
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
    if (token == null) return;

    // Collect actual changes
    final List<Map<String, dynamic>> records = [];
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

    for (var emp in _employees) {
      final localS = _localStatuses[emp.id];
      final origS = _originalStatuses[emp.id];
      final localR = _localRemarks[emp.id] ?? '';
      final origR = _originalRemarks[emp.id] ?? '';

      // Only push records that are marked or changed
      if (localS != null) {
        print('[UI Selection] Employee UUID: ${emp.id}, Code: ${emp.employeeId}, Name: ${emp.fullName}, Status: $localS');
        records.add({
          'employee_id': emp.id,
          'status': localS,
          'remarks': localR
        });
      }
    }

    if (records.isEmpty) {
      _showErrorSnackbar('No attendance changes made to save.');
      return;
    }

    setState(() {
      _isSavingAttendance = true;
    });

    print('--- ATTENDANCE BULK SAVE REQUEST ---');
    print('API URL: ${ApiConfig.baseUrl}/attendance/mark');
    print('HTTP Method: POST');
    print('Date: $todayStr');
    print('Employee IDs: ${records.map((r) => r['employee_id']).toList()}');
    print('Statuses: ${records.map((r) => "${r['employee_id']}: ${r['status']}").toList()}');
    print('User Role: $_role');
    print('------------------------------------');

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

      print('--- ATTENDANCE BULK SAVE RESPONSE ---');
      print('HTTP Status Code: ${response.statusCode}');
      print('Response Body: ${response.body}');
      print('-------------------------------------');

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 && data['success'] == true) {
        _showSuccessSnackbar('Attendance roster synchronized successfully.');
        await _loadAllData();
      } else {
        // Look for UUID or scope failure indicators
        final String rawMsg = data['message'] ?? 'Failed to synchronize attendance.';
        if (rawMsg.contains('managed department scope') || rawMsg.contains('outside your managed')) {
          _showErrorSnackbar(AppLocalizations.of(context)?.noScopeError ?? 'You cannot mark attendance for this employee. Please contact the administrator.');
        } else {
          _showErrorSnackbar(rawMsg);
        }
      }
    } catch (e) {
      _showErrorSnackbar('Sync failed. Please verify server connection.');
    } finally {
      if (mounted) {
        setState(() {
          _isSavingAttendance = false;
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

  // Dashboard view
  Widget _buildHomeTab(AppLocalizations? l10n) {
    return RefreshIndicator(
      onRefresh: _loadAllData,
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
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Supervisor Portal,', style: TextStyle(fontSize: 14, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(_fullName, style: const TextStyle(fontFamily: 'Outfit', fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.cardBg.withOpacity(0.4),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Column(
                    children: [
                      Text(_currentTimeString, style: const TextStyle(fontFamily: 'Outfit', fontSize: 14, fontWeight: FontWeight.w900, color: AppTheme.neonCyan)),
                      Text(DateFormat('dd MMM').format(DateTime.now()), style: const TextStyle(fontSize: 9, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Workforce Attendance Overview Banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.cardBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.neonCyan.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.analytics_outlined, color: AppTheme.neonCyan, size: 28),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l10n?.workforceOverview ?? 'Workforce Attendance Overview', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white)),
                        const SizedBox(height: 2),
                        Text(
                          _totalStaff > 0 
                              ? 'Roster status: ${((_presentStaff + _lateStaff + _halfDayStaff) / _totalStaff * 100).toStringAsFixed(0)}% present today.'
                              : 'Roster empty. Check manager scopes.',
                          style: const TextStyle(fontSize: 11, color: AppTheme.mutedText),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // KPI Grid
            Row(
              children: [
                Expanded(child: _buildKPICard(l10n?.present ?? 'Present', '$_presentStaff', AppTheme.successGreen, Icons.check_circle_outline)),
                const SizedBox(width: 8),
                Expanded(child: _buildKPICard(l10n?.absent ?? 'Absent', '$_absentStaff', AppTheme.errorRed, Icons.cancel_outlined)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _buildKPICard(l10n?.late ?? 'Late', '$_lateStaff', Colors.orange, Icons.access_time)),
                const SizedBox(width: 8),
                Expanded(child: _buildKPICard(l10n?.halfDay ?? 'Half Day', '$_halfDayStaff', Colors.amber, Icons.contrast)),
                const SizedBox(width: 8),
                Expanded(child: _buildKPICard(l10n?.leave ?? 'On Leave', '$_leaveStaff', Colors.blue, Icons.flight_takeoff)),
              ],
            ),
            const SizedBox(height: 24),

            // Active logs feed
            Text(
              (l10n?.attendanceActivity ?? 'Attendance Activity').toUpperCase(),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
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
                child: Center(
                  child: Text(
                    l10n?.noActivityToday ?? 'No attendance activity recorded today',
                    style: const TextStyle(fontSize: 11.5, color: AppTheme.mutedText, fontWeight: FontWeight.w500),
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
                  final name = log['full_name'] ?? 'Staff';
                  final code = log['emp_code'] ?? '';
                  final status = log['status'] ?? 'PRESENT';
                  final checkIn = log['check_in_time'] != null 
                      ? _formatTo12Hour(log['check_in_time'])
                      : '--:--';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.03)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white)),
                            const SizedBox(height: 2),
                            Text('Code: $code  •  Check-in: $checkIn', style: const TextStyle(fontSize: 10.5, color: AppTheme.mutedText)),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: status == 'PRESENT' 
                                ? AppTheme.successGreen.withOpacity(0.1) 
                                : status == 'LATE'
                                    ? Colors.orange.withOpacity(0.1)
                                    : AppTheme.errorRed.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            status,
                            style: TextStyle(
                              fontSize: 8, 
                              fontWeight: FontWeight.bold, 
                              color: status == 'PRESENT' 
                                  ? AppTheme.successGreen 
                                  : status == 'LATE'
                                      ? Colors.orange
                                      : AppTheme.errorRed
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

  Widget _buildKPICard(String title, String value, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 12),
          Text(value, style: const TextStyle(fontFamily: 'Outfit', fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 2),
          Text(title, style: const TextStyle(fontSize: 10, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  // Attendance Screen
  Widget _buildAttendanceTab(AppLocalizations? l10n) {
    // Local filter list
    final List<EmployeeModel> filtered = _employees.where((emp) {
      final matchesSearch = emp.fullName.toLowerCase().contains(_searchController.text.toLowerCase()) ||
                            emp.employeeId.toLowerCase().contains(_searchController.text.toLowerCase());
      if (!matchesSearch) return false;

      final localS = _localStatuses[emp.id];
      if (_selectedFilter == 'ALL') return true;
      if (_selectedFilter == 'MARKED') return localS != null;
      if (_selectedFilter == 'UNMARKED') return localS == null;
      return localS == _selectedFilter;
    }).toList();

    int totalCount = _employees.length;
    int markedCount = _employees.where((e) => _localStatuses[e.id] != null).length;
    double progress = totalCount > 0 ? (markedCount / totalCount) : 0.0;

    return Column(
      children: [
        // Roster stats HUD
        Container(
          padding: const EdgeInsets.all(16),
          color: AppTheme.cardBg.withOpacity(0.3),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'ROSTER MARKING STATS',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText.withOpacity(0.8), letterSpacing: 0.8),
                  ),
                  Text(
                    '$markedCount / $totalCount ${l10n?.marked ?? "Marked"}',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  color: AppTheme.neonCyan,
                  backgroundColor: Colors.white10,
                ),
              ),
            ],
          ),
        ),

        // Controls bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  onChanged: (v) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: l10n?.searchEmployee ?? 'Search staff...',
                    prefixIcon: const Icon(Icons.search, size: 18),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () {
                  setState(() {
                    for (var emp in filtered) {
                      _localStatuses[emp.id] = 'PRESENT';
                    }
                  });
                },
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppTheme.neonCyan),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(60, 36),
                ),
                child: Text(
                  l10n?.markAllPresent ?? 'Mark All Present',
                  style: const TextStyle(color: AppTheme.neonCyan, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: _selectedFilter,
                dropdownColor: AppTheme.cardBg,
                underline: const SizedBox(),
                icon: const Icon(Icons.filter_list_rounded, color: AppTheme.neonCyan, size: 20),
                items: const [
                  DropdownMenuItem(value: 'ALL', child: Text('All Staff', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                  DropdownMenuItem(value: 'MARKED', child: Text('Marked', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                  DropdownMenuItem(value: 'UNMARKED', child: Text('Unmarked', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                  DropdownMenuItem(value: 'PRESENT', child: Text('Present', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                  DropdownMenuItem(value: 'ABSENT', child: Text('Absent', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold))),
                ],
                onChanged: (val) {
                  if (val != null) setState(() => _selectedFilter = val);
                },
              ),
            ],
          ),
        ),

        // List
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
                          // Employee details & remarks trigger
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
                                  ],
                                ),
                              ),
                              
                              // Remarks Button
                              IconButton(
                                icon: Icon(
                                  remarks.isNotEmpty ? Icons.comment_rounded : Icons.comment_outlined, 
                                  color: remarks.isNotEmpty ? AppTheme.neonCyan : AppTheme.mutedText,
                                  size: 18,
                                ),
                                onPressed: () => _showRemarksDialog(emp),
                                tooltip: 'Add Remarks',
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Segmented Controls row
                          _buildSegmentedControlsRow(emp, currentStatus, l10n),
                          
                          if (remarks.isNotEmpty) ...[
                            const SizedBox(height: 10),
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

        // Sticky save bar
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
                        : Text(l10n?.saveAttendance ?? 'Save Attendance Roster', style: const TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSegmentedControlsRow(EmployeeModel emp, String? currentStatus, AppLocalizations? l10n) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.darkBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          _buildSegmentButton(emp, 'PRESENT', l10n?.present ?? 'Present', Icons.check_circle_outline_rounded, AppTheme.successGreen, currentStatus),
          _buildSegmentButton(emp, 'ABSENT', l10n?.absent ?? 'Absent', Icons.cancel_outlined, AppTheme.errorRed, currentStatus),
          _buildSegmentButton(emp, 'LATE', l10n?.late ?? 'Late', Icons.access_time_rounded, Colors.orange, currentStatus),
          _buildSegmentButton(emp, 'HALF_DAY', l10n?.halfDay ?? 'Half Day', Icons.contrast_rounded, Colors.amber, currentStatus),
          _buildSegmentButton(emp, 'LEAVE', l10n?.leave ?? 'Leave', Icons.flight_takeoff_rounded, Colors.blue, currentStatus),
        ],
      ),
    );
  }

  Widget _buildSegmentButton(EmployeeModel emp, String status, String label, IconData icon, Color color, String? currentStatus) {
    final bool isSelected = currentStatus == status;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() {
            _localStatuses[emp.id] = status;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.12) : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: isSelected ? color : AppTheme.mutedText, size: 16),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 7.5, 
                  fontWeight: FontWeight.bold, 
                  color: isSelected ? color : AppTheme.mutedText
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
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.neonCyan),
              child: const Text('Save', style: TextStyle(color: AppTheme.darkBg, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }

  // Leaves Tab
  Widget _buildLeavesTab(AppLocalizations? l10n) {
    final pendingRequests = _leaveRequests.where((r) => r['status'] == 'PENDING').toList();
    final historyRequests = _leaveRequests.where((r) => r['status'] != 'PENDING').toList();

    return RefreshIndicator(
      onRefresh: _loadAllData,
      color: AppTheme.neonCyan,
      backgroundColor: AppTheme.cardBg,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Pending Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'PENDING LEAVE APPROVALS (${pendingRequests.length})',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 0.8),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (pendingRequests.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 30),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                ),
                child: const Center(
                  child: Text('No pending leave requests.', style: TextStyle(fontSize: 11.5, color: AppTheme.mutedText)),
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: pendingRequests.length,
                itemBuilder: (context, index) {
                  final req = pendingRequests[index];
                  final empName = req['employee_name'] ?? 'Employee';
                  final empCode = req['emp_code'] ?? '';
                  final type = req['type'] ?? 'LEAVE';
                  final reason = req['reason'] ?? '';
                  final start = req['start_date'] ?? '';
                  final end = req['end_date'] ?? '';

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.35),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withOpacity(0.04)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(empName, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold, color: Colors.white)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.cyan.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(type, style: const TextStyle(fontSize: 8, color: Colors.cyan, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text('Code: $empCode', style: const TextStyle(fontSize: 10.5, color: AppTheme.mutedText)),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.date_range, size: 12, color: AppTheme.mutedText),
                            const SizedBox(width: 4),
                            Text('$start to $end', style: const TextStyle(fontSize: 11, color: AppTheme.mutedText, fontWeight: FontWeight.w500)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('Reason: $reason', style: const TextStyle(fontSize: 11.5, color: Colors.white70)),
                        const Divider(color: Colors.white10, height: 20),
                        
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            OutlinedButton(
                              onPressed: () => _rejectLeaveFlow(req),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: AppTheme.errorRed),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              ),
                              child: Text(l10n?.reject ?? 'Reject', style: const TextStyle(color: AppTheme.errorRed, fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton(
                              onPressed: () => _approveLeaveFlow(req),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.successGreen,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              ),
                              child: Text(l10n?.approve ?? 'Approve', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            const SizedBox(height: 24),

            // History Header
            Text(
              'PROCESSED LEAVES HISTORY (${historyRequests.length})',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 0.8),
            ),
            const SizedBox(height: 12),

            if (historyRequests.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 30),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                ),
                child: const Center(
                  child: Text('No processed requests found.', style: TextStyle(fontSize: 11.5, color: AppTheme.mutedText)),
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: historyRequests.length > 10 ? 10 : historyRequests.length,
                itemBuilder: (context, index) {
                  final req = historyRequests[index];
                  final empName = req['employee_name'] ?? 'Employee';
                  final type = req['type'] ?? 'LEAVE';
                  final status = req['status'] ?? 'APPROVED';
                  final start = req['start_date'] ?? '';
                  final end = req['end_date'] ?? '';
                  final Color badgeColor = status == 'APPROVED' ? AppTheme.successGreen : AppTheme.errorRed;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.cardBg.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.03)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(empName, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white)),
                            const SizedBox(height: 2),
                            Text('$type  •  $start to $end', style: const TextStyle(fontSize: 10, color: AppTheme.mutedText)),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: badgeColor.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(status, style: TextStyle(fontSize: 8, color: badgeColor, fontWeight: FontWeight.bold)),
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

  void _approveLeaveFlow(dynamic req) {
    showDialog(
      context: context,
      builder: (context) {
        bool isApproving = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submitApproval() async {
              setDialogState(() => isApproving = true);
              try {
                final token = await _storage.read(key: 'access_token');
                final res = await http.post(
                  Uri.parse('${ApiConfig.baseUrl}/leaves/requests/${req['id']}/approve'),
                  headers: {'Authorization': 'Bearer $token'}
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(res.body);
                if (res.statusCode == 200 && data['success'] == true) {
                  if (context.mounted) {
                    Navigator.of(context).pop();
                    _showSuccessSnackbar('Leave request approved successfully.');
                    _loadAllData();
                  }
                } else {
                  throw Exception(data['message'] ?? 'Failed to approve request.');
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
              title: const Text('Approve Leave Request', style: TextStyle(fontSize: 16)),
              content: Text('Do you want to approve leave for ${req['employee_name']} from ${req['start_date']} to ${req['end_date']}?'),
              actions: [
                TextButton(
                  onPressed: isApproving ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton(
                  onPressed: isApproving ? null : submitApproval,
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.successGreen),
                  child: isApproving 
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 1.5))
                      : const Text('Approve', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _rejectLeaveFlow(dynamic req) {
    showDialog(
      context: context,
      builder: (context) {
        final remarksController = TextEditingController();
        bool isRejecting = false;
        String? dialogError;

        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submitRejection() async {
              final remarks = remarksController.text.trim();
              if (remarks.isEmpty) {
                setDialogState(() => dialogError = 'Rejection remarks are mandatory.');
                return;
              }

              setDialogState(() {
                isRejecting = true;
                dialogError = null;
              });

              try {
                final token = await _storage.read(key: 'access_token');
                final res = await http.post(
                  Uri.parse('${ApiConfig.baseUrl}/leaves/requests/${req['id']}/reject'),
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer $token'
                  },
                  body: jsonEncode({'remarks': remarks})
                ).timeout(const Duration(seconds: 10));

                final data = jsonDecode(res.body);
                if (res.statusCode == 200 && data['success'] == true) {
                  if (context.mounted) {
                    Navigator.of(context).pop();
                    _showSuccessSnackbar('Leave request rejected successfully.');
                    _loadAllData();
                  }
                } else {
                  throw Exception(data['message'] ?? 'Failed to reject request.');
                }
              } catch (e) {
                setDialogState(() {
                  isRejecting = false;
                  dialogError = e.toString().replaceAll('Exception:', '');
                });
              }
            }

            return AlertDialog(
              backgroundColor: AppTheme.cardBg,
              title: const Text('Reject Leave Request', style: TextStyle(fontSize: 16)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('State why you are rejecting leave for ${req['employee_name']}:'),
                  const SizedBox(height: 12),
                  if (dialogError != null) ...[
                    Text(dialogError!, style: const TextStyle(color: AppTheme.errorRed, fontSize: 10.5, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                  ],
                  TextField(
                    controller: remarksController,
                    decoration: const InputDecoration(
                      hintText: 'Enter mandatory rejection remarks...',
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: isRejecting ? null : () => Navigator.of(context).pop(),
                  child: const Text('Cancel', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton(
                  onPressed: isRejecting ? null : submitRejection,
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorRed),
                  child: isRejecting 
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 1.5))
                      : const Text('Reject', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // Settings Screen
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
          // Profile
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
                _buildProfileDetailRow('Account Email', _email, Icons.email_outlined),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow('Full Name', _fullName, Icons.person_outline_rounded),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow('Access Role', _role, Icons.security_rounded),
                const Divider(color: Colors.white10, height: 24),
                _buildProfileDetailRow(
                  'Scope Departments', 
                  _assignedDepts.isEmpty 
                      ? 'No departments assigned' 
                      : _assignedDepts.map((d) => d['name'] ?? d.toString()).join(', '), 
                  Icons.layers_outlined
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Reset Password
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
                  _showSuccessSnackbar('Password updated successfully.');
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

          // Language Switcher
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
              Text(
                label,
                style: const TextStyle(fontSize: 9.5, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
              ),
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
                  _isOnline ? 'Supervisor Portal Active' : 'Connection Offline',
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
                  Text('Synchronizing workspace database...', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
                ],
              ),
            )
          : IndexedStack(
              index: _currentIndex,
              children: [
                _buildHomeTab(l10n),
                _buildAttendanceTab(l10n),
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
            icon: const Icon(Icons.people_alt_outlined),
            selectedIcon: const Icon(Icons.people_alt_rounded, color: AppTheme.darkBg),
            label: l10n?.attendance ?? 'Attendance',
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
