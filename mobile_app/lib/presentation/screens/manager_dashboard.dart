import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import 'login_screen.dart';
import 'scanner_screen.dart';

class ManagerDashboard extends StatefulWidget {
  const ManagerDashboard({super.key});

  @override
  State<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends State<ManagerDashboard> {
  final _storage = const FlutterSecureStorage();
  bool _isLoading = true;
  String? _error;

  int _totalStaff = 0;
  int _presentStaff = 0;
  int _lateLogins = 0;
  List<dynamic> _recentLogs = [];

  Timer? _clockTimer;
  String _currentTimeString = '';
  bool _isOnline = true;
  Timer? _connectivityTimer;

  String _shiftName = 'Morning Shift';
  String _checkinStart = '09:00:00';
  String _checkoutTime = '17:00:00';

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
    final formattedTime = DateFormat('hh:mm:ss a').format(now);
    setState(() {
      _currentTimeString = formattedTime;
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

      // Fetch dashboard statistics and shift settings concurrently
      final responses = await Future.wait([
        http.get(
          Uri.parse('${ApiConfig.baseUrl}/attendance/dashboard'),
          headers: {'Authorization': 'Bearer $token'},
        ).timeout(const Duration(seconds: 10)),
        http.get(
          Uri.parse('${ApiConfig.baseUrl}/attendance/settings'),
          headers: {'Authorization': 'Bearer $token'},
        ).timeout(const Duration(seconds: 10)),
      ]);

      final dashboardResponse = responses[0];
      final settingsResponse = responses[1];

      if (dashboardResponse.statusCode == 401 || dashboardResponse.statusCode == 403 ||
          settingsResponse.statusCode == 401 || settingsResponse.statusCode == 403) {
        await _logout(sessionExpired: true);
        return;
      }

      if (dashboardResponse.statusCode != 200) {
        throw Exception('Failed to load dashboard statistics (Code: ${dashboardResponse.statusCode}).');
      }

      final data = jsonDecode(dashboardResponse.body);
      if (data['success'] == true) {
        final stats = data['stats'] ?? {};
        _totalStaff = stats['totalStaff'] ?? 0;
        _presentStaff = stats['present'] ?? 0;
        _lateLogins = stats['late'] ?? 0;
        _recentLogs = data['feed'] ?? [];
      } else {
        throw Exception(data['message'] ?? 'Failed to load stats.');
      }

      if (settingsResponse.statusCode == 200) {
        final settingsData = jsonDecode(settingsResponse.body);
        if (settingsData['success'] == true && settingsData['settings'] != null) {
          final settings = settingsData['settings'];
          _shiftName = settings['shift_name'] ?? 'Morning Shift';
          _checkinStart = settings['checkin_start'] ?? '09:00:00';
          _checkoutTime = settings['checkout_time'] ?? '17:00:00';
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

  Future<void> _logout({bool sessionExpired = false}) async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
    await _storage.delete(key: 'user');
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => LoginScreen(sessionExpired: sessionExpired)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('GAYTRI COMMERCIAL'),
            if (_currentTimeString.isNotEmpty)
              Text(
                _currentTimeString,
                style: const TextStyle(fontSize: 10, color: AppTheme.neonCyan, fontFamily: 'monospace', fontWeight: FontWeight.w600),
              ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _loadDashboardData,
            icon: const Icon(Icons.refresh_rounded, color: AppTheme.neonCyan, size: 20),
            tooltip: 'Refresh Data',
          ),
          IconButton(
            onPressed: () => _logout(sessionExpired: false),
            icon: const Icon(Icons.logout_rounded, color: AppTheme.errorRed, size: 20),
            tooltip: 'Sign Out',
          ),
        ],
      ),
      body: Center(
        child: Container(
          constraints: const BoxConstraints(maxWidth: 600),
          child: _isLoading
              ? _buildDashboardSkeleton()
              : RefreshIndicator(
                  onRefresh: _loadDashboardData,
                  color: AppTheme.neonCyan,
                  backgroundColor: AppTheme.cardBg,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Status Header
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  "TODAY'S ATTENDANCE",
                                  style: TextStyle(
                                    fontSize: 9,
                                    color: AppTheme.mutedText,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Gate Terminal Console',
                                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                        fontWeight: FontWeight.bold,
                                        fontFamily: 'Outfit',
                                        color: Colors.white,
                                        fontSize: 15,
                                      ),
                                ),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: (_isOnline ? AppTheme.successGreen : AppTheme.errorRed).withOpacity(0.08),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: (_isOnline ? AppTheme.successGreen : AppTheme.errorRed).withOpacity(0.2)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 6,
                                    height: 6,
                                    decoration: BoxDecoration(
                                      color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    _isOnline ? 'ONLINE' : 'OFFLINE',
                                    style: TextStyle(
                                      fontSize: 8,
                                      fontWeight: FontWeight.bold,
                                      color: _isOnline ? AppTheme.successGreen : AppTheme.errorRed,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        if (_error != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppTheme.errorRed.withOpacity(0.06),
                              border: Border.all(color: AppTheme.errorRed.withOpacity(0.25)),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.cloud_off_rounded, color: AppTheme.errorRed, size: 20),
                                    const SizedBox(width: 8),
                                    const Text(
                                      'Database Link Interrupted',
                                      style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _error!,
                                  style: const TextStyle(color: AppTheme.mutedText, fontSize: 11),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 14),
                                SizedBox(
                                  height: 36,
                                  child: ElevatedButton.icon(
                                    onPressed: _loadDashboardData,
                                    icon: const Icon(Icons.sync_rounded, size: 16, color: Colors.white),
                                    label: const Text('Retry Connection', style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppTheme.errorRed.withOpacity(0.15),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(8),
                                        side: BorderSide(color: AppTheme.errorRed.withOpacity(0.3)),
                                      ),
                                      elevation: 0,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Stats Grid Row (Today's Attendance)
                        Row(
                          children: [
                            Expanded(
                              child: _buildStatsCard('Total Staff', '$_totalStaff', Icons.people_outline_rounded, AppTheme.neonCyan),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _buildStatsCard('Present', '$_presentStaff', Icons.check_circle_outline_rounded, AppTheme.successGreen),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _buildStatsCard('Late Logins', '$_lateLogins', Icons.warning_amber_rounded, AppTheme.errorRed),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Integrated Shift Card & Start Scan CTA
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppTheme.cardBg,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.white.withOpacity(0.08)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.schedule_rounded, color: AppTheme.neonCyan, size: 16),
                                      const SizedBox(width: 8),
                                      Text(
                                        _shiftName,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white, fontFamily: 'Outfit'),
                                      ),
                                    ],
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                                    decoration: BoxDecoration(
                                      color: AppTheme.neonCyan.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: AppTheme.neonCyan.withOpacity(0.2)),
                                    ),
                                    child: const Text(
                                      'ACTIVE SHIFT',
                                      style: TextStyle(fontSize: 7.5, fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                                    ),
                                  ),
                                ],
                              ),
                              const Divider(color: Colors.white10, height: 20),
                              Container(
                                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                                  children: [
                                    _buildShiftTimingItem('Check-In Time', _formatTo12Hour(_checkinStart)),
                                    Container(width: 1, height: 20, color: Colors.white10),
                                    _buildShiftTimingItem('Check-Out Time', _formatTo12Hour(_checkoutTime)),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              SizedBox(
                                width: double.infinity,
                                height: 40,
                                child: ElevatedButton(
                                  onPressed: () async {
                                    final result = await Navigator.of(context).push(
                                      MaterialPageRoute(builder: (context) => const ScannerScreen()),
                                    );
                                    if (result == true) {
                                      _loadDashboardData();
                                    }
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppTheme.neonCyan,
                                    foregroundColor: AppTheme.darkBg,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    elevation: 0,
                                  ),
                                  child: const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.face_unlock_rounded, size: 16),
                                      SizedBox(width: 8),
                                      Text(
                                        'Start Face Scan',
                                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                                    ],
                                  ),
                                ),
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
                              'RECENT ACTIVITY',
                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
                            ),
                            Text(
                              'Live logs',
                              style: TextStyle(fontSize: 9, color: AppTheme.neonCyan, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        if (_recentLogs.isEmpty)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 36),
                            decoration: BoxDecoration(
                              color: AppTheme.cardBg.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white.withOpacity(0.02)),
                            ),
                            child: const Center(
                              child: Text(
                                'No scans recorded today yet.',
                                style: TextStyle(fontSize: 11, color: AppTheme.mutedText),
                              ),
                            ),
                          )
                        else
                          ListView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: _recentLogs.length,
                            itemBuilder: (context, index) {
                              final log = _recentLogs[index];
                              final status = log['status'] ?? 'PRESENT';
                              final isLate = status == 'LATE';
                              final name = log['full_name'] ?? 'Unknown Employee';
                              final empId = log['employee_id'] ?? '';
                              final time = _formatTo12Hour(log['check_in_time'] ?? '');

                              return Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: AppTheme.cardBg.withOpacity(0.3),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 32,
                                      height: 32,
                                      decoration: BoxDecoration(
                                        color: AppTheme.darkBg,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: Colors.white10),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        name.isNotEmpty ? name.substring(0, 1) : '?',
                                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.neonCyan, fontSize: 12),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                          const SizedBox(height: 2),
                                          Text(
                                            'ID: $empId',
                                            style: const TextStyle(fontSize: 9.5, color: AppTheme.mutedText),
                                          ),
                                          if (log['check_out'] != null) ...[
                                            const SizedBox(height: 4),
                                            Row(
                                              children: [
                                                Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                                  decoration: BoxDecoration(
                                                    color: (log['checkout_type'] == 'AUTO_CHECKOUT' ? Colors.amber : Colors.cyan).withOpacity(0.08),
                                                    borderRadius: BorderRadius.circular(4),
                                                    border: Border.all(color: (log['checkout_type'] == 'AUTO_CHECKOUT' ? Colors.amber : Colors.cyan).withOpacity(0.15)),
                                                  ),
                                                  child: Text(
                                                    log['checkout_type'] == 'AUTO_CHECKOUT' ? '🕔 AUTO' : '👋 MANUAL',
                                                    style: TextStyle(
                                                      fontSize: 7.0,
                                                      fontWeight: FontWeight.bold,
                                                      color: log['checkout_type'] == 'AUTO_CHECKOUT' ? Colors.amber : Colors.cyan,
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 6),
                                                Text(
                                                  'Hours: ${log['working_hours'] ?? "-"}',
                                                  style: const TextStyle(fontSize: 9.0, color: Colors.white70, fontWeight: FontWeight.w500),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          log['check_out'] != null 
                                              ? 'In: $time\nOut: ${_formatTimestampTo12Hour(log['check_out'])}'
                                              : 'In: $time',
                                          style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, height: 1.25),
                                          textAlign: TextAlign.end,
                                        ),
                                        const SizedBox(height: 4),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                          decoration: BoxDecoration(
                                            color: (isLate ? AppTheme.errorRed : AppTheme.successGreen).withOpacity(0.1),
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
        ),
      ),
    );
  }

  Widget _buildStatsCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label.toUpperCase(),
                style: const TextStyle(fontSize: 8, color: AppTheme.mutedText, fontWeight: FontWeight.bold, letterSpacing: 0.3),
              ),
              Icon(icon, size: 14, color: color.withOpacity(0.6)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: color, fontFamily: 'Outfit'),
          ),
        ],
      ),
    );
  }

  Widget _buildShiftTimingItem(String label, String value) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 8.5, color: AppTheme.mutedText, fontWeight: FontWeight.bold, letterSpacing: 0.3),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ],
    );
  }

  Widget _buildDashboardSkeleton() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header skeleton
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  ShimmerLoading(width: 80, height: 10),
                  SizedBox(height: 6),
                  ShimmerLoading(width: 140, height: 16),
                ],
              ),
              const ShimmerLoading(width: 60, height: 20, borderRadius: 6),
            ],
          ),
          const SizedBox(height: 20),
          // Stats Row skeleton
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.cardBg.withOpacity(0.2),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    children: const [
                      ShimmerLoading(width: 50, height: 8),
                      SizedBox(height: 6),
                      ShimmerLoading(width: 30, height: 18),
                    ],
                  ),
                ),
                Container(width: 1, height: 30, color: Colors.white10),
                Expanded(
                  child: Column(
                    children: const [
                      ShimmerLoading(width: 50, height: 8),
                      SizedBox(height: 6),
                      ShimmerLoading(width: 30, height: 18),
                    ],
                  ),
                ),
                Container(width: 1, height: 30, color: Colors.white10),
                Expanded(
                  child: Column(
                    children: const [
                      ShimmerLoading(width: 50, height: 8),
                      SizedBox(height: 6),
                      ShimmerLoading(width: 30, height: 18),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // Shift Card skeleton
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: const [
                    ShimmerLoading(width: 120, height: 12),
                    ShimmerLoading(width: 60, height: 16),
                  ],
                ),
                const Divider(color: Colors.white10, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    Column(
                      children: const [
                        ShimmerLoading(width: 60, height: 8),
                        SizedBox(height: 6),
                        ShimmerLoading(width: 50, height: 12),
                      ],
                    ),
                    Column(
                      children: const [
                        ShimmerLoading(width: 60, height: 8),
                        SizedBox(height: 6),
                        ShimmerLoading(width: 50, height: 12),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const ShimmerLoading(width: double.infinity, height: 40, borderRadius: 10),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Activity list skeleton
          const ShimmerLoading(width: 100, height: 10),
          const SizedBox(height: 12),
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 3,
            itemBuilder: (context, index) {
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.cardBg.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.03)),
                ),
                child: Row(
                  children: [
                    const ShimmerLoading(width: 32, height: 32, borderRadius: 8),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          ShimmerLoading(width: 120, height: 10),
                          SizedBox(height: 6),
                          ShimmerLoading(width: 60, height: 8),
                        ],
                      ),
                    ),
                    const ShimmerLoading(width: 40, height: 14, borderRadius: 4),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class ShimmerLoading extends StatefulWidget {
  final double width;
  final double height;
  final double borderRadius;

  const ShimmerLoading({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 8.0,
  });

  @override
  State<ShimmerLoading> createState() => _ShimmerLoadingState();
}

class _ShimmerLoadingState extends State<ShimmerLoading> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.15, end: 0.35).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(_animation.value),
            borderRadius: BorderRadius.circular(widget.borderRadius),
          ),
        );
      },
    );
  }
}
