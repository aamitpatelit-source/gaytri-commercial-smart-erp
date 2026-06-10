import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
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

      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/attendance/dashboard'),
        headers: {
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 401 || response.statusCode == 403) {
        await _logout();
        return;
      }

      if (response.statusCode != 200) {
        throw Exception('Failed to load dashboard statistics (Code: ${response.statusCode}).');
      }

      final data = jsonDecode(response.body);
      if (data['success'] == true) {
        final stats = data['stats'] ?? {};
        if (mounted) {
          setState(() {
            _totalStaff = stats['totalStaff'] ?? 0;
            _presentStaff = stats['present'] ?? 0;
            _lateLogins = stats['late'] ?? 0;
            _recentLogs = data['feed'] ?? [];
            _isLoading = false;
          });
        }
      } else {
        throw Exception(data['message'] ?? 'Failed to load stats.');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception:', '');
          _isLoading = false;
        });
      }
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GAYTRI COMMERCIAL'),
        actions: [
          IconButton(
            onPressed: _isLoading ? null : _loadDashboardData,
            icon: const Icon(Icons.refresh_rounded, color: AppTheme.neonCyan),
            tooltip: 'Refresh Data',
          ),
          IconButton(
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded, color: AppTheme.errorRed),
            tooltip: 'Sign Out',
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
                  Text(
                    'Fetching live cloud operations feed...',
                    style: TextStyle(color: AppTheme.mutedText, fontSize: 13),
                  ),
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
                    // Status Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Cloud Operational Feed',
                              style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Manager Terminal',
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    fontFamily: 'Outfit',
                                  ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.successGreen.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppTheme.successGreen.withOpacity(0.2)),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.cloud_done_rounded, color: AppTheme.successGreen, size: 12),
                              SizedBox(width: 6),
                              Text(
                                'CLOUD ACTIVE',
                                style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.successGreen),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    if (_error != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.1),
                          border: Border.all(color: AppTheme.errorRed.withOpacity(0.3)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          children: [
                            Text(
                              'Connection Error: $_error',
                              style: const TextStyle(color: AppTheme.errorRed, fontSize: 11, fontWeight: FontWeight.bold),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 8),
                            ElevatedButton(
                              onPressed: _loadDashboardData,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.errorRed.withOpacity(0.2),
                                minimumSize: const Size(100, 32),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              child: const Text('Retry Connection', style: TextStyle(fontSize: 10, color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],

                    // Stats Grid
                    Row(
                      children: [
                        Expanded(
                          child: _buildStatCard('Total Staff', '$_totalStaff', Icons.people_outline_rounded, AppTheme.neonCyan),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildStatCard('Present Today', '$_presentStaff', Icons.check_circle_outline_rounded, AppTheme.successGreen),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _buildStatCard('Late Logins', '$_lateLogins', Icons.timer_outlined, AppTheme.errorRed),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Launch Scanner CTA
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [AppTheme.cardBg, AppTheme.cardBg.withOpacity(0.4)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Column(
                        children: [
                          Container(
                            width: 70,
                            height: 70,
                            decoration: BoxDecoration(
                              color: AppTheme.neonCyan.withOpacity(0.08),
                              shape: BoxShape.circle,
                              border: Border.all(color: AppTheme.neonCyan.withOpacity(0.3)),
                            ),
                            child: const Icon(
                              Icons.face_unlock_rounded,
                              color: AppTheme.neonCyan,
                              size: 32,
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'AI Face Verification Scanner',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Scans employee face and coordinates GPS checks live with the cloud registry.',
                            style: TextStyle(fontSize: 11, color: AppTheme.mutedText),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 20),
                          SizedBox(
                            width: double.infinity,
                            height: 48,
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
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.camera_alt_outlined, size: 18),
                                  SizedBox(width: 8),
                                  Text(
                                    'Launch Face Gateway',
                                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 30),

                    // Scans Feed
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'TODAY\'S ATTENDANCE HISTORY',
                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 1.0),
                        ),
                        Text(
                          'Live Feed',
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
                          color: AppTheme.cardBg.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withOpacity(0.02)),
                        ),
                        child: const Center(
                          child: Text(
                            'No scans recorded today yet.',
                            style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
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
                          final time = log['check_in_time'] ?? '';

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(
                              color: AppTheme.cardBg.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white.withOpacity(0.03)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: AppTheme.darkBg,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.white10),
                                  ),
                                  alignment: Alignment.center,
                                  child: Text(
                                    name.isNotEmpty ? name.substring(0, 1) : '?',
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                                      const SizedBox(height: 2),
                                      Text(
                                        'ID: $empId • Cloud Synced',
                                        style: const TextStyle(fontSize: 10, color: AppTheme.mutedText),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(time, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: isLate ? AppTheme.errorRed.withOpacity(0.1) : AppTheme.successGreen.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        status,
                                        style: TextStyle(
                                          fontSize: 8,
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

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 9, color: AppTheme.mutedText, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
          ],
        ),
      ),
    );
  }
}
