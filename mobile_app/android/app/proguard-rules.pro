# Google MLKit Face Detection and dependencies
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
-keep class com.google.android.gms.tasks.** { *; }
-dontwarn com.google.android.gms.tasks.**

# TensorFlow Lite
-keep class org.tensorflow.lite.** { *; }
-dontwarn org.tensorflow.lite.**

# Flutter Camera Plugin
-keep class io.flutter.plugins.camera.** { *; }
-dontwarn io.flutter.plugins.camera.**
