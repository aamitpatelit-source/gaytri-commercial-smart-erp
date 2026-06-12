import 'package:flutter/foundation.dart';
import 'dart:io' as io;

class ApiConfig {
  static String get baseUrl {
    if (kDebugMode) {
      if (kIsWeb) {
        return 'http://localhost:5000/api/v1';
      }
      try {
        if (io.Platform.isAndroid) {
          return 'http://10.0.2.2:5000/api/v1';
        }
      } catch (_) {}
      return 'http://localhost:5000/api/v1';
    }
    return 'https://gaytri-commercial-smart-erp.onrender.com/api/v1';
  }
}