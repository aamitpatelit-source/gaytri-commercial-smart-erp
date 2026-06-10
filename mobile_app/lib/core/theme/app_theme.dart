import 'package:flutter/material.dart';

class AppTheme {
  // Industrial Color Palette
  static const Color darkBg = Color(0xFF060A13);
  static const Color cardBg = Color(0xFF151D30);
  static const Color neonCyan = Color(0xFF00E5FF);
  static const Color accentIndigo = Color(0xFF6366F1);
  static const Color successGreen = Color(0xFF10B981);
  static const Color errorRed = Color(0xFFF43F5E);
  static const Color mutedText = Color(0xFF64748B);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkBg,
      colorScheme: const ColorScheme.dark(
        primary: neonCyan,
        secondary: accentIndigo,
        surface: cardBg,
        background: darkBg,
        error: errorRed,
        onPrimary: Color(0xFF060A13),
      ),
      fontFamily: 'Inter',
      appBarTheme: const AppBarTheme(
        backgroundColor: darkBg,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
        iconTheme: IconThemeData(color: neonCyan),
      ),
      cardTheme: CardThemeData(
        color: cardBg.withOpacity(0.6),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Colors.white10, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF0B0F19),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.white10),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.white10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: neonCyan, width: 1.5),
        ),
        labelStyle: const TextStyle(color: mutedText, fontSize: 13),
        floatingLabelStyle: const TextStyle(color: neonCyan),
      ),
      buttonTheme: const ButtonThemeData(
        buttonColor: neonCyan,
        textTheme: ButtonTextTheme.primary,
      ),
    );
  }
}
