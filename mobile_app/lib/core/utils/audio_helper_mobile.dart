import 'package:flutter/services.dart';

void playBeepSound(bool success) {
  try {
    SystemSound.play(SystemSoundType.click);
  } catch (e) {
    // Silently catch exceptions in production
  }
}
