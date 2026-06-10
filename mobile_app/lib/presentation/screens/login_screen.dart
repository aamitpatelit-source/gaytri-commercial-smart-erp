import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import 'manager_dashboard.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _idController = TextEditingController();
  final _passwordController = TextEditingController();
  String _selectedRole = 'ADMIN';
  bool _isLoading = false;
  String? _errorMessage;
  final _storage = const FlutterSecureStorage();

  // Target Backend API url using central config
  final String _apiUrl = '${ApiConfig.baseUrl}/auth/login';

  Future<void> _handleLogin() async {
    final empId = _idController.text.trim();
    final password = _passwordController.text;

    if (empId.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Employee ID and password are required.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await http.post(
        Uri.parse(_apiUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'employee_id': empId,
          'password': password,
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        try {
          final errData = jsonDecode(response.body);
          throw Exception(errData['message'] ?? 'Authentication failed.');
        } catch (_) {
          throw Exception('Server returned error status ${response.statusCode} (${response.reasonPhrase}). Please verify that your backend API is deployed and the URL in api_config.dart is correct.');
        }
      }

      final Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body);
      } catch (_) {
        throw Exception('Invalid response format from server. Verify your backend API endpoint is active.');
      }

      if (data['user']['role'] != 'ADMIN') {
        throw Exception('Role access restricted. This app requires ADMIN authorization.');
      }

      // Store Auth Tokens in Secure Storage
      await _storage.write(key: 'access_token', value: data['access_token']);
      await _storage.write(key: 'refresh_token', value: data['refresh_token']);
      await _storage.write(key: 'user', value: jsonEncode(data['user']));

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const ManagerDashboard()),
        );
      }
    } catch (err) {
      setState(() {
        _isLoading = false;
        _errorMessage = err.toString().replaceAll('Exception:', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Background Glows
          Positioned(
            bottom: -80,
            right: -80,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.accentIndigo.withOpacity(0.04),
              ),
            ),
          ),
          SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 60.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 50),
                // Header Brand Icon & Label
                Center(
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppTheme.cardBg.withOpacity(0.4),
                          border: Border.all(color: Colors.white10),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Icon(
                          Icons.layers_rounded,
                          color: AppTheme.neonCyan,
                          size: 36,
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'GAYTRI COMMERCIAL',
                        style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'ERP & FACE GATEWAY',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.mutedText,
                          letterSpacing: 2.0,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 48),
                const Text(
                  'Access Authorization',
                  style: TextStyle(
                    fontFamily: 'Outfit',
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Sign in with your corporate employee profile credentials.',
                  style: TextStyle(fontSize: 12, color: AppTheme.mutedText),
                ),
                const SizedBox(height: 30),

                if (_errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.errorRed.withOpacity(0.1),
                      border: Border.all(color: AppTheme.errorRed.withOpacity(0.3)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: AppTheme.errorRed, fontSize: 11, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                const SizedBox(height: 12),

                // Inputs
                TextField(
                  controller: _idController,
                  decoration: const InputDecoration(
                    labelText: 'Employee ID',
                    prefixIcon: Icon(Icons.badge_outlined, color: AppTheme.mutedText, size: 20),
                    hintText: 'GC-XXXX',
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'System Password',
                    prefixIcon: Icon(Icons.lock_outline_rounded, color: AppTheme.mutedText, size: 20),
                    hintText: '••••••••',
                  ),
                ),
                const SizedBox(height: 32),

                // Button submit
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _handleLogin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.neonCyan,
                      foregroundColor: AppTheme.darkBg,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2),
                          )
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                'Sign In to Portal',
                                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 0.5),
                              ),
                              SizedBox(width: 8),
                              Icon(Icons.arrow_forward_rounded, size: 18),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
