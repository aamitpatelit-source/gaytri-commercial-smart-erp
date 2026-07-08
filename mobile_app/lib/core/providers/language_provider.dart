import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class LanguageProvider extends ChangeNotifier {
  static const _storage = FlutterSecureStorage();
  static const _localeKey = 'app_locale';

  Locale _locale = const Locale('en');

  Locale get locale => _locale;

  LanguageProvider() {
    _loadPersistedLocale();
  }

  Future<void> _loadPersistedLocale() async {
    try {
      final savedLocale = await _storage.read(key: _localeKey);
      if (savedLocale != null && savedLocale.isNotEmpty) {
        _locale = Locale(savedLocale);
        notifyListeners();
      }
    } catch (e) {
      debugPrint('[LanguageProvider] Failed to load locale: $e');
    }
  }

  Future<void> changeLanguage(String languageCode) async {
    if (_locale.languageCode == languageCode) return;

    _locale = Locale(languageCode);
    notifyListeners();

    try {
      await _storage.write(key: _localeKey, value: languageCode);
    } catch (e) {
      debugPrint('[LanguageProvider] Failed to persist locale: $e');
    }
  }
}
