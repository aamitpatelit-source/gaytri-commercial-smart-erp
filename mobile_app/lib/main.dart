import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'presentation/screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize services here in production:
  // final sqliteService = SqliteService();
  // await sqliteService.database;

  runApp(const GaytriErpApp());
}

class GaytriErpApp extends StatelessWidget {
  const GaytriErpApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gaytri Commercial ERP',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const SplashScreen(),
    );
  }
}
