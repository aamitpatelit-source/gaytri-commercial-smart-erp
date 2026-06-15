import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/employee_model.dart';
import '../../core/services/face_recognition_service.dart';
import '../../core/utils/audio_helper.dart';
import 'login_screen.dart';

class BiometricEnrollmentScreen extends StatefulWidget {
  const BiometricEnrollmentScreen({super.key});

  @override
  State<BiometricEnrollmentScreen> createState() => _BiometricEnrollmentScreenState();
}

class _BiometricEnrollmentScreenState extends State<BiometricEnrollmentScreen> with WidgetsBindingObserver {
  final _storage = const FlutterSecureStorage();
  final FaceRecognitionService _faceRecognitionService = FaceRecognitionService();

  List<EmployeeModel> _employees = [];
  EmployeeModel? _selectedEmployee;

  bool _loadingEmployees = true;
  String? _employeeLoadError;

  // Enrollment states
  bool _isEnrolling = false;
  double _enrollProgress = 0.0;
  String _guidanceStatus = 'Select an employee to start enrollment';
  bool _enrollmentSuccess = false;
  String? _enrollmentError;

  final List<List<double>> _capturedEmbeddings = [];
  bool _isProcessingFrame = false;

  // Camera fields
  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  String? _cameraInitError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _fetchEmployees();
    _initializeCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || 
        state == AppLifecycleState.inactive || 
        state == AppLifecycleState.detached) {
      if (_isEnrolling) {
        _abortAndResetEnrollment('App lost focus or backgrounded');
      }
    }
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras != null && _cameras!.isNotEmpty) {
        final frontCamera = _cameras!.firstWhere(
          (camera) => camera.lensDirection == CameraLensDirection.front,
          orElse: () => _cameras!.first,
        );

        _cameraController = CameraController(
          frontCamera,
          ResolutionPreset.medium,
          enableAudio: false,
        );

        await _cameraController!.initialize();
        if (!mounted) {
          _cameraController?.dispose();
          return;
        }

        _cameraController!.addListener(() {
          if (!mounted) return;
          if (_cameraController!.value.hasError) {
            _abortAndResetEnrollment('Camera error: ${_cameraController!.value.errorDescription}');
          }
        });

        setState(() {
          _isCameraInitialized = true;
          _cameraInitError = null;
        });
      } else {
        throw Exception('No camera devices found.');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraInitError = e.toString().replaceAll('Exception:', '');
        });
      }
    }
  }

  Future<void> _fetchEmployees() async {
    if (!mounted) return;
    setState(() {
      _loadingEmployees = true;
      _employeeLoadError = null;
    });

    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        throw Exception('Session expired. Log in again.');
      }

      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/employees'),
        headers: {
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 401) {
        await _storage.deleteAll();
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const LoginScreen(sessionExpired: true)),
          );
        }
        return;
      }

      if (response.statusCode != 200) {
        throw Exception('Failed to load employee list (Status: ${response.statusCode}).');
      }

      final Map<String, dynamic> data = jsonDecode(response.body);

      if (data['success'] == true) {
        final List list = data['employees'] ?? [];
        final parsed = list.map((json) => EmployeeModel.fromJson(json)).toList();

        if (mounted) {
          setState(() {
            _employees = parsed;
            if (parsed.isNotEmpty) {
              _selectedEmployee = parsed.first;
            }
            _loadingEmployees = false;
          });
        }
      } else {
        throw Exception(data['message'] ?? 'Failed to load employees.');
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _employeeLoadError = err.toString().replaceAll('Exception:', '');
          _loadingEmployees = false;
        });
      }
    }
  }

  void _abortAndResetEnrollment(String reason) {
    if (_cameraController != null && _cameraController!.value.isStreamingImages) {
      try {
        _cameraController!.stopImageStream();
      } catch (_) {}
    }

    setState(() {
      _isEnrolling = false;
      _enrollProgress = 0.0;
      _guidanceStatus = 'Enrollment interrupted: $reason';
      _capturedEmbeddings.clear();
      _enrollmentError = reason;
    });

    playBeepSound(false);
  }

  double _calculateAverageLuminance(CameraImage image) {
    if (image.planes.isEmpty) return 100.0;
    final bytes = image.planes[0].bytes;
    if (image.format.raw == 875704383 || image.planes.length > 1) {
      int sum = 0;
      int count = 0;
      for (int i = 0; i < bytes.length; i += 20) {
        sum += bytes[i];
        count++;
      }
      return count > 0 ? sum / count : 100.0;
    } else {
      int sum = 0;
      int count = 0;
      for (int i = 0; i < bytes.length - 4; i += 40) {
        final b = bytes[i];
        final g = bytes[i + 1];
        final r = bytes[i + 2];
        final y = (0.299 * r + 0.587 * g + 0.114 * b).round();
        sum += y;
        count++;
      }
      return count > 0 ? sum / count : 100.0;
    }
  }

  InputImage? _convertCameraImage(CameraImage image) {
    try {
      final WriteBuffer allBytes = WriteBuffer();
      for (final Plane plane in image.planes) {
        allBytes.putUint8List(plane.bytes);
      }
      final bytes = allBytes.done().buffer.asUint8List();

      final sensorOrientation = _cameraController!.description.sensorOrientation;
      final imageRotation = InputImageRotationValue.fromRawValue(sensorOrientation) ?? InputImageRotation.rotation0deg;
      
      InputImageFormat format = InputImageFormat.nv21;
      if (Platform.isIOS) {
        format = InputImageFormat.bgra8888;
      }
      final inputImageFormat = InputImageFormatValue.fromRawValue(image.format.raw) ?? format;

      final metadata = InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: imageRotation,
        format: inputImageFormat,
        bytesPerRow: image.planes[0].bytesPerRow,
      );

      return InputImage.fromBytes(bytes: bytes, metadata: metadata);
    } catch (e) {
      debugPrint('Error converting camera image: $e');
      return null;
    }
  }

  Future<void> _processEnrollmentFrame(CameraImage image) async {
    try {
      final inputImage = _convertCameraImage(image);
      if (inputImage == null) {
        _isProcessingFrame = false;
        return;
      }

      final faces = await _faceRecognitionService.detectFaces(inputImage);
      if (!_isEnrolling || !mounted) {
        _isProcessingFrame = false;
        return;
      }

      if (faces.isEmpty) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Align your face in the circle';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      if (faces.length > 1) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Multiple faces detected. Enroll alone.';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      final face = faces.first;

      // 1. Center Check
      final double frameWidth = _cameraController?.value.previewSize?.height ?? 720.0;
      final double frameHeight = _cameraController?.value.previewSize?.width ?? 1280.0;
      final double faceCenterX = face.boundingBox.center.dx;
      final double faceCenterY = face.boundingBox.center.dy;
      final double faceWidth = face.boundingBox.width;

      if (faceCenterX < frameWidth * 0.28 || faceCenterX > frameWidth * 0.72 ||
          faceCenterY < frameHeight * 0.25 || faceCenterY > frameHeight * 0.75) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Center your face inside the frame';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      // 2. Face Coverage Check (Minimum 25% of frame width)
      if (faceWidth < frameWidth * 0.25) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Move closer to the camera';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      // 3. Pose Check (Yaw, Pitch, Roll <= 8°)
      final yaw = face.headEulerAngleY ?? 0.0;
      final pitch = face.headEulerAngleX ?? 0.0;
      final roll = face.headEulerAngleZ ?? 0.0;

      if (yaw.abs() > 8.0 || pitch.abs() > 8.0 || roll.abs() > 8.0) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Look straight at the camera';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      // 4. Lighting Check (Average luminance >= 60)
      final luminance = _calculateAverageLuminance(image);
      if (luminance < 60) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Improve lighting to proceed';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      // 5. Eyes Open Check (Eye probability >= 0.70)
      final leftOpen = face.leftEyeOpenProbability ?? 1.0;
      final rightOpen = face.rightEyeOpenProbability ?? 1.0;
      if (leftOpen < 0.70 || rightOpen < 0.70) {
        _capturedEmbeddings.clear();
        setState(() {
          _guidanceStatus = 'Please open both eyes';
          _enrollProgress = 0.0;
        });
        _isProcessingFrame = false;
        return;
      }

      // Quality gates passed! Generate and capture embedding
      final embedding = _faceRecognitionService.getLandmarkEmbedding(face);
      if (embedding.every((v) => v == 0.0)) {
        _isProcessingFrame = false;
        return;
      }

      _capturedEmbeddings.add(embedding);
      setState(() {
        _guidanceStatus = 'Hold still... capturing biometrics';
        _enrollProgress = _capturedEmbeddings.length / 5.0;
      });

      if (_capturedEmbeddings.length >= 5) {
        // Stop streaming to process
        if (_cameraController != null && _cameraController!.value.isStreamingImages) {
          await _cameraController!.stopImageStream();
        }

        setState(() {
          _guidanceStatus = 'Processing and normalizing biometric keys...';
        });

        await _compileAndUploadBiometrics();
      }

    } catch (e) {
      debugPrint('Error processing enrollment frame: $e');
    } finally {
      _isProcessingFrame = false;
    }
  }

  String _generateNonce() {
    final random = Random.secure();
    final values = List<int>.generate(16, (i) => random.nextInt(256));
    return values.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  Future<void> _compileAndUploadBiometrics() async {
    try {
      // Step 5: Average embeddings
      final averaged = List<double>.filled(128, 0.0);
      for (int i = 0; i < 128; i++) {
        double sum = 0.0;
        for (final emb in _capturedEmbeddings) {
          sum += emb[i];
        }
        averaged[i] = sum / _capturedEmbeddings.length;
      }

      // Step 6: L2 Normalize final embedding
      double sumSq = 0.0;
      for (final val in averaged) {
        sumSq += val * val;
      }
      final norm = sqrt(sumSq);
      if (norm > 0) {
        for (int i = 0; i < 128; i++) {
          averaged[i] = averaged[i] / norm;
        }
      }

      // Step 7: Upload embedding to backend
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        throw Exception('Session expired. Log in again.');
      }

      setState(() {
        _guidanceStatus = 'Uploading biometric credentials...';
      });

      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/employees/enroll-biometric'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'employee_id': _selectedEmployee!.id,
          'embedding': averaged,
          'nonce': _generateNonce(),
          'timestamp': DateTime.now().millisecondsSinceEpoch,
          'liveness_metadata': {
            'challenge': 'passive_checks',
            'success': true,
          },
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        try {
          final errBody = jsonDecode(response.body);
          throw Exception(errBody['message'] ?? 'Enrollment failed.');
        } catch (_) {
          throw Exception('Backend returned status code ${response.statusCode}');
        }
      }

      playBeepSound(true);
      setState(() {
        _enrollmentSuccess = true;
        _isEnrolling = false;
        _guidanceStatus = 'Biometric profile registered successfully!';
      });

      _showSuccessDialog();

    } catch (e) {
      _abortAndResetEnrollment(e.toString().replaceAll('Exception:', '').trim());
    }
  }

  Future<void> _startEnrollment() async {
    if (_selectedEmployee == null || _cameraController == null || !_isCameraInitialized) return;

    setState(() {
      _isEnrolling = true;
      _enrollmentSuccess = false;
      _enrollmentError = null;
      _enrollProgress = 0.0;
      _guidanceStatus = 'Initial camera feed setup';
      _capturedEmbeddings.clear();
      _isProcessingFrame = false;
    });

    try {
      await _cameraController!.startImageStream((CameraImage image) {
        if (_isProcessingFrame || !_isEnrolling || !mounted) return;
        _isProcessingFrame = true;
        _processEnrollmentFrame(image);
      });
    } catch (e) {
      _abortAndResetEnrollment('Failed to start camera stream: $e');
    }
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Dialog(
            backgroundColor: AppTheme.cardBg.withOpacity(0.9),
            elevation: 8,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: AppTheme.successGreen, width: 1),
            ),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 320),
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.successGreen.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check_circle_outline_rounded,
                      color: AppTheme.successGreen,
                      size: 40,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'ENROLLMENT SUCCESSFUL',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.successGreen,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Biometric template for ${_selectedEmployee!.fullName} is successfully compiled, encrypted, and saved.',
                    style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.4),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 40,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                        Navigator.of(context).pop(true);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.successGreen,
                        foregroundColor: AppTheme.darkBg,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('Back to Console', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text(
          'BIOMETRIC FACE ENROLLMENT',
          style: TextStyle(
            fontSize: 13,
            color: Colors.white70,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.0,
          ),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF0F172A), Colors.black],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 450),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: _loadingEmployees
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(color: AppTheme.neonCyan),
                          SizedBox(height: 16),
                          Text('Loading employee records...', style: TextStyle(fontSize: 12, color: AppTheme.mutedText)),
                        ],
                      ),
                    )
                  : _employeeLoadError != null
                      ? _buildLoadErrorWidget()
                      : Column(
                          children: [
                            _buildSelectionCard(),
                            const Spacer(),
                            _buildCameraPreview(),
                            const Spacer(),
                            _buildProgressCard(),
                          ],
                        ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoadErrorWidget() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppTheme.cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.errorRed.withOpacity(0.25)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, color: AppTheme.errorRed, size: 40),
            const SizedBox(height: 16),
            Text(
              _employeeLoadError!,
              style: const TextStyle(fontSize: 12, color: AppTheme.errorRed, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 40,
              child: ElevatedButton.icon(
                onPressed: _fetchEmployees,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Retry Connection', style: TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.neonCyan,
                  foregroundColor: AppTheme.darkBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  elevation: 0,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectionCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'SELECT EMPLOYEE TO ENROLL',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 0.8),
          ),
          const SizedBox(height: 4),
          DropdownButtonHideUnderline(
            child: DropdownButton<EmployeeModel>(
              value: _selectedEmployee,
              isExpanded: true,
              dropdownColor: AppTheme.cardBg,
              icon: const Icon(Icons.arrow_drop_down, color: AppTheme.neonCyan),
              hint: const Text('Select an employee', style: TextStyle(color: Colors.white60)),
              items: _employees.map((emp) {
                final String statusStr = emp.biometricEnrolled ? ' (RE-ENROLL)' : ' (NEW)';
                return DropdownMenuItem<EmployeeModel>(
                  value: emp,
                  child: Text(
                    '${emp.fullName} (${emp.employeeId})$statusStr',
                    style: TextStyle(
                      fontSize: 13, 
                      color: emp.biometricEnrolled ? Colors.white70 : Colors.white, 
                      fontWeight: FontWeight.bold
                    ),
                  ),
                );
              }).toList(),
              onChanged: _isEnrolling
                  ? null
                  : (val) {
                      if (val != null) {
                        setState(() {
                          _selectedEmployee = val;
                          _capturedEmbeddings.clear();
                          _enrollProgress = 0.0;
                          _enrollmentError = null;
                          _enrollmentSuccess = false;
                          _guidanceStatus = 'Ready. Press "START ENROLLMENT"';
                        });
                      }
                    },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCameraPreview() {
    const size = 200.0;
    final borderColor = _enrollmentSuccess
        ? AppTheme.successGreen
        : _enrollmentError != null
            ? AppTheme.errorRed
            : _isEnrolling
                ? AppTheme.neonCyan
                : Colors.white24;

    return Center(
      child: Container(
        width: size + 4,
        height: (size * 1.3) + 4,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.all(Radius.elliptical(size / 2, (size * 1.3) / 2)),
          border: Border.all(
            color: borderColor,
            width: 3.0,
          ),
          boxShadow: [
            BoxShadow(
              color: borderColor.withOpacity(0.20),
              blurRadius: 15,
              spreadRadius: 1,
            ),
          ],
        ),
        child: ClipOval(
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: size,
                height: size * 1.3,
                color: Colors.black,
                child: _isCameraInitialized && _cameraController != null
                    ? FittedBox(
                        fit: BoxFit.cover,
                        child: SizedBox(
                          width: _cameraController!.value.previewSize?.height ?? 720,
                          height: _cameraController!.value.previewSize?.width ?? 1280,
                          child: CameraPreview(_cameraController!),
                        ),
                      )
                    : Container(
                        color: Colors.black,
                        child: Center(
                          child: _cameraInitError != null
                              ? Padding(
                                  padding: const EdgeInsets.all(12.0),
                                  child: Text(_cameraInitError!, style: const TextStyle(color: AppTheme.errorRed, fontSize: 11), textAlign: TextAlign.center),
                                )
                              : const CircularProgressIndicator(color: AppTheme.neonCyan),
                        ),
                      ),
              ),
              if (_isEnrolling)
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: AppTheme.neonCyan.withOpacity(0.15),
                        width: 1,
                      ),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProgressCard() {
    final hasActiveEmployee = _selectedEmployee != null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: _enrollmentSuccess
                      ? AppTheme.successGreen
                      : _isEnrolling
                          ? AppTheme.neonCyan
                          : Colors.amber,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _guidanceStatus,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Colors.white70,
                    fontWeight: FontWeight.bold,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (_isEnrolling) ...[
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: _enrollProgress,
                backgroundColor: Colors.white12,
                color: AppTheme.neonCyan,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Captured Frames: ${(_enrollProgress * 5).round()}/5',
              style: const TextStyle(fontSize: 10, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
            ),
          ],
          if (!_isEnrolling && !_enrollmentSuccess) ...[
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              height: 42,
              child: ElevatedButton.icon(
                onPressed: hasActiveEmployee ? _startEnrollment : null,
                icon: const Icon(Icons.videocam_rounded, size: 16),
                label: const Text('START ENROLLMENT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.neonCyan,
                  foregroundColor: AppTheme.darkBg,
                  disabledBackgroundColor: Colors.white12,
                  disabledForegroundColor: AppTheme.mutedText,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
