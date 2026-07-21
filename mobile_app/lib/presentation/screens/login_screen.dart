import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import '../../l10n/app_localizations.dart';
import '../../core/providers/language_provider.dart';
import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import 'manager_dashboard.dart';

class LoginScreen extends StatefulWidget {
  final bool sessionExpired;
  const LoginScreen({super.key, this.sessionExpired = false});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  final _storage = const FlutterSecureStorage();

  @override
  void initState() {
    super.initState();
    if (widget.sessionExpired) {
      _errorMessage = 'Session expired. Please login again.';
    }
  }

  // Targets Repurposed Manager Login Endpoint
  final String _apiUrl = '${ApiConfig.baseUrl}/auth/login';

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Manager email and password are required.');
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
          'employee_id': email, // backend expects email inside 'employee_id' key for repurposed login
          'password': password,
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        if (response.statusCode == 401) {
          throw Exception('Invalid manager credentials.');
        }
        if (response.statusCode == 403) {
          try {
            final errData = jsonDecode(response.body);
            if (errData['message'] != null && errData['message'].toString().toLowerCase().contains('disabled')) {
              throw Exception('Your account has been disabled.');
            }
          } catch (e) {
            if (e.toString().contains('Your account has been disabled.')) rethrow;
          }
          throw Exception('Access restricted. Manager privileges required.');
        }
        try {
          final errData = jsonDecode(response.body);
          throw Exception(errData['message'] ?? 'Authentication failed.');
        } catch (_) {
          throw Exception('Server returned error status ${response.statusCode}. Please verify backend configuration.');
        }
      }

      final Map<String, dynamic> data;
      try {
        data = jsonDecode(response.body);
      } catch (_) {
        throw Exception('Invalid response format from server.');
      }

      // Login Response Validation
      final user = data['user'];
      final accessToken = data['access_token'];
      final refreshToken = data['refresh_token'];
      
      if (user == null || accessToken == null || refreshToken == null) {
        throw Exception('Invalid response format from server.');
      }

      final userRole = user['role'];
      final fullName = user['full_name'];
      final emailValue = user['employee_id'];

      if (userRole == null || fullName == null || emailValue == null ||
          userRole.toString().isEmpty || fullName.toString().isEmpty || emailValue.toString().isEmpty) {
        throw Exception('Invalid response format from server.');
      }

      if (userRole != 'MANAGER') {
        throw Exception('Access restricted. Manager privileges required.');
      }

      // Token Storage Cleanup: clear all old secure storage values before saving the new session
      await _storage.deleteAll();

      // Store Auth Tokens in Secure Storage
      await _storage.write(key: 'access_token', value: accessToken);
      await _storage.write(key: 'refresh_token', value: refreshToken);
      await _storage.write(key: 'user', value: jsonEncode(user));

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const ManagerDashboard()),
        );
      }
    } catch (err) {
      setState(() {
        _isLoading = false;
        _errorMessage = err.toString().replaceAll('Exception:', '').trim();
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
          Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 450),
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 10),
                    // Language Switcher Row
                    Align(
                      alignment: Alignment.topRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _buildLangBtn(context, 'English', 'en'),
                          Container(
                            width: 1,
                            height: 12,
                            color: Colors.white24,
                            margin: const EdgeInsets.symmetric(horizontal: 8),
                          ),
                          _buildLangBtn(context, 'हिंदी', 'hi'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
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
                            'COMMERCIAL SYSTEM',
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
                    const SizedBox(height: 40),
                    
                    // Glassmorphic Login Card
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: AppTheme.cardBg.withOpacity(0.4),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.08)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.25),
                            blurRadius: 15,
                            spreadRadius: -5,
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            AppLocalizations.of(context)?.loginTitle ?? 'Manager Terminal Access',
                            style: const TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            AppLocalizations.of(context)?.appDescription ?? 'Sign in with your corporate manager profile credentials.',
                            style: const TextStyle(fontSize: 11, color: AppTheme.mutedText),
                          ),
                          const SizedBox(height: 24),

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
                            const SizedBox(height: 16),
                          ],

                          TextField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: AppLocalizations.of(context)?.employeeId ?? 'Manager Email/ID',
                              prefixIcon: const Icon(Icons.person_outline_rounded, color: AppTheme.mutedText, size: 20),
                              hintText: 'manager@gaytri.com',
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: AppLocalizations.of(context)?.password ?? 'System Password',
                              prefixIcon: const Icon(Icons.lock_outline_rounded, color: AppTheme.mutedText, size: 20),
                              hintText: '••••••••',
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Button submit
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _handleLogin,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.neonCyan,
                                foregroundColor: AppTheme.darkBg,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                elevation: 0,
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(color: AppTheme.darkBg, strokeWidth: 2),
                                    )
                                  : Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          AppLocalizations.of(context)?.loginButton ?? 'Manager Sign In',
                                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 0.5),
                                        ),
                                        const SizedBox(width: 8),
                                        const Icon(Icons.arrow_forward_rounded, size: 18),
                                      ],
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLangBtn(BuildContext context, String label, String code) {
    final langProvider = Provider.of<LanguageProvider>(context);
    final isSelected = langProvider.locale.languageCode == code;
    return GestureDetector(
      onTap: () => langProvider.changeLanguage(code),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.w800 : FontWeight.bold,
          color: isSelected ? AppTheme.neonCyan : AppTheme.mutedText,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
