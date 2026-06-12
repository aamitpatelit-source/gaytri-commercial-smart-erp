import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:camera/camera.dart';
import 'package:path_provider/path_provider.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../../core/config/api_config.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/employee_model.dart';
import '../../core/services/face_recognition_service.dart';
import '../../core/utils/audio_helper.dart';
import 'login_screen.dart';

enum VerificationStep {
  liveCamera,
  detectingFace,
  verifyingLiveness,
  matchingIdentity,
  recorded,
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> with WidgetsBindingObserver {
  final _storage = const FlutterSecureStorage();
  final FaceRecognitionService _faceRecognitionService = FaceRecognitionService();

  List<EmployeeModel> _registeredEmployees = [];
  EmployeeModel? _selectedEmployee;

  bool _loadingEmployees = true;
  String? _employeeLoadError;

  String _scanningStatus = 'Select an employee to start';
  double _verifyProgress = 0.0;
  bool _isScanning = false;
  bool _isSuccess = false;
  bool _isDuplicate = false;
  String? _scanError;

  // Biometric verification states
  List<double>? _registeredFaceEmbedding;
  bool _loadingTemplate = false;
  String? _templateError;

  // Liveness tracking states
  VerificationStep _currentStep = VerificationStep.liveCamera;
  DateTime? _lastFrameTimestamp;
  Uint8List? _prevFrameBytes;
  int _identicalFrameCount = 0;
  
  final List<double> _yawHistory = [];
  final List<double> _pitchHistory = [];
  final List<Point<int>> _noseHistory = [];
  bool _blinkDetected = false;
  bool _motionDetected = false;
  bool _leftEyeClosedDetected = false;
  bool _rightEyeClosedDetected = false;
  
  bool _isProcessingFrame = false;
  int _framesProcessedCount = 0;
  DateTime? _scanStartTime;
  Timer? _heartbeatTimer;
  Timer? _webSimulationTimer;

  bool _eyesOpenDetected = false;
  bool _eyesBlinked = false;
  double? _initialYaw;
  bool _livenessVerified = false;
  int _consecutiveStableFrames = 0;
  final List<List<double>> _stableEmbeddings = [];

  // Camera fields
  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  String? _cameraInitError;

  bool get _isRealDetection => !kIsWeb;

  @visibleForTesting
  bool get isScanning => _isScanning;

  @visibleForTesting
  VerificationStep get currentStep => _currentStep;

  @visibleForTesting
  String get scanningStatus => _scanningStatus;

  @visibleForTesting
  set registeredFaceEmbedding(List<double>? val) {
    setState(() {
      _registeredFaceEmbedding = val;
      _templateError = null;
      _loadingTemplate = false;
      _scanningStatus = 'Face template ready. Align face to scan.';
    });
  }

  @visibleForTesting
  Future<void> submitVerificationToBackend(List<double> embedding) => _submitVerificationToBackend(embedding);

  @override
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _fetchRegisteredEmployees();
    _initializeCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _heartbeatTimer?.cancel();
    _webSimulationTimer?.cancel();
    _cameraController?.dispose();
    _faceRecognitionService.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || 
        state == AppLifecycleState.inactive || 
        state == AppLifecycleState.detached) {
      if (_isScanning) {
        _abortAndResetScan('App lost focus or browser tab inactive');
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
            _abortAndResetScan('Camera disconnected: ${_cameraController!.value.errorDescription}');
          }
        });

        setState(() {
          _isCameraInitialized = true;
          _scanError = null;
          _scanningStatus = _isRealDetection 
              ? 'Align face inside frame' 
              : 'Face template ready. Align face to scan.';
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

  Future<void> _fetchRegisteredEmployees() async {
    if (!mounted) return;
    setState(() {
      _loadingEmployees = true;
      _employeeLoadError = null;
    });

    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        throw Exception('Access token expired. Log in again.');
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
        final enrolled = parsed.where((emp) => emp.faceEmbedding != null && emp.faceEmbedding!.isNotEmpty).toList();

        if (mounted) {
          setState(() {
            _registeredEmployees = enrolled;
            if (enrolled.isNotEmpty) {
              _selectedEmployee = enrolled.first;
            }
            _loadingEmployees = false;
          });
          if (enrolled.isNotEmpty && _isRealDetection) {
            _extractRegisteredTemplate();
          }
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

  Future<void> _extractRegisteredTemplate() async {
    if (_selectedEmployee == null || !_isRealDetection) return;

    setState(() {
      _loadingTemplate = true;
      _templateError = null;
      _registeredFaceEmbedding = null;
      _scanningStatus = 'Loading face template...';
    });

    try {
      final photoUrl = _selectedEmployee!.profilePhotoUrl;
      if (photoUrl == null || photoUrl.isEmpty) {
        throw Exception('No face profile photo registered for this employee.');
      }

      final embedding = await _faceRecognitionService.extractEmbeddingFromProfilePhoto(
        photoUrl,
        _selectedEmployee!.id,
      );

      if (_registeredFaceEmbedding != null) return;
      setState(() {
        _registeredFaceEmbedding = embedding;
        _loadingTemplate = false;
        _scanningStatus = 'Face template ready. Align face to scan.';
      });
    } catch (e) {
      if (_registeredFaceEmbedding != null) return;
      
      final errorMsg = e.toString().replaceAll('Exception:', '').trim();
      setState(() {
        _templateError = errorMsg;
        _loadingTemplate = false;
        _scanningStatus = 'Template extraction failed.';
      });

    }
  }

  void _showQualityDiagnosticModal(String errorDetail) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          backgroundColor: AppTheme.cardBg,
          child: Container(
            constraints: const BoxConstraints(maxWidth: 400),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppTheme.errorRed.withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.portrait_rounded,
                        color: AppTheme.errorRed,
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Text(
                        'Employee Photo Verification Failed',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          fontFamily: 'Outfit',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                const Text(
                  'The registered employee image could not be processed for biometric matching. Please upload a clear front-facing image in the admin portal.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppTheme.mutedText,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.black12,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withOpacity(0.04)),
                  ),
                  child: Text(
                    'Diagnostic Reason:\n$errorDetail',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: AppTheme.errorRed.withOpacity(0.95),
                      fontWeight: FontWeight.w600,
                      height: 1.4,
                    ),
                  ),
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          Navigator.of(context).pop();
                          _showHelpInfo();
                        },
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.white12),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        child: const Text(
                          'Open Help',
                          style: TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.of(context).pop();
                          _extractRegisteredTemplate();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.neonCyan,
                          foregroundColor: AppTheme.darkBg,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        child: const Text(
                          'Retry',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    child: const Text(
                      'Continue Anyway',
                      style: TextStyle(fontSize: 12, color: AppTheme.mutedText, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showHelpInfo() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.cardBg,
        title: const Text('Image Upload Guidelines', style: TextStyle(color: Colors.white, fontFamily: 'Outfit')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text('To ensure reliable face recognition:', style: TextStyle(color: Colors.white70, fontSize: 13)),
            SizedBox(height: 8),
            Text('• Face must be centered and fully visible', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
            Text('• Eyes must be open and looking at camera', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
            Text('• Avoid caps, masks, shadows or sunglasses', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
            Text('• Image must be bright and sharp (no blur)', style: TextStyle(color: AppTheme.mutedText, fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close', style: TextStyle(color: AppTheme.neonCyan)),
          ),
        ],
      ),
    );
  }

  void _startHeartbeatChecker() {
    _heartbeatTimer?.cancel();
    _lastFrameTimestamp = DateTime.now();
    _heartbeatTimer = Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (!_isScanning || !mounted) {
        timer.cancel();
        return;
      }
      
      final now = DateTime.now();
      if (_lastFrameTimestamp == null || now.difference(_lastFrameTimestamp!).inMilliseconds > 500) {
        timer.cancel();
        _abortAndResetScan('Camera feed inactive (heartbeat lost)');
        return;
      }
      
      if (!kIsWeb && _cameraController != null) {
        if (!_cameraController!.value.isStreamingImages) {
          timer.cancel();
          _abortAndResetScan('Camera streaming stopped');
          return;
        }
        if (_cameraController!.value.isPreviewPaused) {
          timer.cancel();
          _abortAndResetScan('Camera preview paused');
          return;
        }
      }
    });
  }

  void _abortAndResetScan(String reason, {bool showDialogFlag = true}) {
    final wasScanning = _isScanning;
    
    _heartbeatTimer?.cancel();
    _webSimulationTimer?.cancel();
    
    if (!kIsWeb && _cameraController != null && _cameraController!.value.isStreamingImages) {
      try {
        _cameraController!.stopImageStream();
      } catch (e) {
        debugPrint('Error stopping image stream: $e');
      }
    }
    
    setState(() {
      _isScanning = false;
      _currentStep = VerificationStep.liveCamera;
      _scanningStatus = wasScanning ? 'Scan failed: $reason' : 'Align face to scan';
      _verifyProgress = 0.0;
      _scanError = wasScanning ? reason : null;
      
      _stableEmbeddings.clear();
      _prevFrameBytes = null;
      _identicalFrameCount = 0;
      _yawHistory.clear();
      _pitchHistory.clear();
      _noseHistory.clear();
      _blinkDetected = false;
      _motionDetected = false;
      _leftEyeClosedDetected = false;
      _rightEyeClosedDetected = false;
      _isProcessingFrame = false;
      _consecutiveStableFrames = 0;
    });
    
    if (wasScanning) {
      playBeepSound(false);
      if (showDialogFlag && mounted) {
        _showFailureDialog('Scan Aborted', '$reason. Please restart scan.');
      }
    }
  }

  bool _checkIfFrameFrozen(CameraImage image) {
    if (image.planes.isEmpty) return false;
    final bytes = image.planes[0].bytes;
    
    final int totalBytes = bytes.length;
    final int step = (totalBytes / 200).floor().clamp(1, totalBytes);
    
    int diffSum = 0;
    int sampleCount = 0;
    
    if (_prevFrameBytes != null && _prevFrameBytes!.length == totalBytes) {
      for (int i = 0; i < totalBytes; i += step) {
        diffSum += (bytes[i] - _prevFrameBytes![i]).abs();
        sampleCount++;
      }
    }
    
    _prevFrameBytes = Uint8List.fromList(bytes);
    
    if (sampleCount == 0) return false;
    final double avgDiff = diffSum / sampleCount;
    
    if (avgDiff < 0.2) {
      _identicalFrameCount++;
      if (_identicalFrameCount >= 4) {
        return true;
      }
    } else {
      _identicalFrameCount = 0;
    }
    
    return false;
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

  Future<void> _processCameraImage(CameraImage image) async {
    try {
      final inputImage = _convertCameraImage(image);
      if (inputImage == null) {
        _isProcessingFrame = false;
        return;
      }
      
      final faces = await _faceRecognitionService.detectFaces(inputImage);
      if (!_isScanning || !mounted) {
        _isProcessingFrame = false;
        return;
      }
      
      if (faces.isEmpty) {
        _consecutiveStableFrames = 0;
        _stableEmbeddings.clear();
        setState(() {
          _currentStep = VerificationStep.detectingFace;
          _scanningStatus = 'No face detected. Center your face.';
          _verifyProgress = 0.10;
        });
      } else {
        final face = faces.first;
        await _evaluateLiveFace(face);
      }
    } catch (e) {
      debugPrint('Error in _processCameraImage: $e');
    } finally {
      _isProcessingFrame = false;
    }
  }

  Future<void> _runFaceVerification() async {
    if (_selectedEmployee == null) return;

    if (_isRealDetection && _registeredFaceEmbedding == null) {
      if (_templateError != null) {
        _showFailureDialog('Biometric Template Error', _templateError!);
      } else {
        _showFailureDialog('Loading Template', 'Face template is still compiling. Please hold on.');
      }
      return;
    }

    setState(() {
      _isScanning = true;
      _isSuccess = false;
      _isDuplicate = false;
      _scanError = null;
      _scanningStatus = 'Camera Ready';
      _verifyProgress = 0.05;
      _currentStep = VerificationStep.liveCamera;
      _scanStartTime = DateTime.now();

      _stableEmbeddings.clear();
      _prevFrameBytes = null;
      _identicalFrameCount = 0;
      _yawHistory.clear();
      _pitchHistory.clear();
      _noseHistory.clear();
      _blinkDetected = false;
      _motionDetected = false;
      _leftEyeClosedDetected = false;
      _rightEyeClosedDetected = false;
      _isProcessingFrame = false;
      _consecutiveStableFrames = 0;
    });

    if (kIsWeb || _cameraController == null) {
      _startWebSimulation();
    } else {
      await _startLiveScannerLoop();
    }
  }

  void _startWebSimulation() {
    _startHeartbeatChecker();
    int elapsedMs = 0;
    _webSimulationTimer = Timer.periodic(const Duration(milliseconds: 200), (timer) {
      if (!_isScanning || !mounted) {
        timer.cancel();
        return;
      }

      if (WidgetsBinding.instance.lifecycleState != null && 
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        timer.cancel();
        _abortAndResetScan('App lost focus or browser tab inactive');
        return;
      }

      _lastFrameTimestamp = DateTime.now();
      elapsedMs += 200;

      setState(() {
        if (elapsedMs < 1000) {
          _currentStep = VerificationStep.detectingFace;
          _scanningStatus = 'Detecting Face';
          _verifyProgress = 0.20;
        } else if (elapsedMs < 2400) {
          _currentStep = VerificationStep.verifyingLiveness;
          if (elapsedMs < 1600) {
            _scanningStatus = 'Verifying Liveness: Please blink';
            _verifyProgress = 0.40;
          } else {
            _scanningStatus = 'Verifying Liveness: Turn head slightly';
            _verifyProgress = 0.50;
            _blinkDetected = true;
          }
        } else if (elapsedMs < 3600) {
          _currentStep = VerificationStep.matchingIdentity;
          _motionDetected = true;
          _scanningStatus = 'Matching Identity...';
          _verifyProgress = 0.70 + ((elapsedMs - 2400) ~/ 300) * 0.08;
        } else if (elapsedMs >= 4000) {
          timer.cancel();
          _heartbeatTimer?.cancel();
          _isScanning = false;
          _verifyProgress = 1.0;
          _currentStep = VerificationStep.recorded;
          _scanningStatus = 'Demo Mode: Attendance recording disabled in web browsers.';
          _showWebDemoDialog();
        }
      });
    });
  }

  Future<void> _startLiveScannerLoop() async {
    if (_cameraController == null || !_isCameraInitialized) {
      _abortAndResetScan('Camera not initialized');
      return;
    }
    
    _startHeartbeatChecker();
    
    try {
      await _cameraController!.startImageStream((CameraImage image) {
        _lastFrameTimestamp = DateTime.now();
        
        if (_isProcessingFrame || !_isScanning || !mounted) return;
        
        if (_checkIfFrameFrozen(image)) {
          _abortAndResetScan('Camera feed inactive. Please restart scan.');
          return;
        }
        
        _isProcessingFrame = true;
        _processCameraImage(image);
      });
    } catch (e) {
      _abortAndResetScan('Failed to start camera stream: $e');
    }
  }

  void _updateLivenessData(Face face) {
    final leftOpen = face.leftEyeOpenProbability ?? 1.0;
    final rightOpen = face.rightEyeOpenProbability ?? 1.0;
    
    if (leftOpen < 0.25 || rightOpen < 0.25) {
      _leftEyeClosedDetected = true;
      _rightEyeClosedDetected = true;
    }
    if ((_leftEyeClosedDetected || _rightEyeClosedDetected) && (leftOpen > 0.70 || rightOpen > 0.70)) {
      _blinkDetected = true;
    }

    final yaw = face.headEulerAngleY ?? 0.0;
    final pitch = face.headEulerAngleX ?? 0.0;
    
    _yawHistory.add(yaw);
    _pitchHistory.add(pitch);
    
    if (_yawHistory.length > 15) _yawHistory.removeAt(0);
    if (_pitchHistory.length > 15) _pitchHistory.removeAt(0);
    
    if (_yawHistory.length >= 5) {
      final double maxYaw = _yawHistory.reduce(max);
      final double minYaw = _yawHistory.reduce(min);
      final double maxPitch = _pitchHistory.reduce(max);
      final double minPitch = _pitchHistory.reduce(min);
      
      final double yawDiff = (maxYaw - minYaw).abs();
      final double pitchDiff = (maxPitch - minPitch).abs();
      
      if (yawDiff > 0.3 || pitchDiff > 0.3) {
        _motionDetected = true;
      }
    }

    final nosePos = face.landmarks[FaceLandmarkType.noseBase]?.position;
    if (nosePos != null) {
      _noseHistory.add(nosePos);
      if (_noseHistory.length > 15) _noseHistory.removeAt(0);
      if (_noseHistory.length >= 5) {
        double maxNoseDist = 0.0;
        for (int i = 0; i < _noseHistory.length; i++) {
          for (int j = i + 1; j < _noseHistory.length; j++) {
            final double dx = (_noseHistory[i].x - _noseHistory[j].x).toDouble();
            final double dy = (_noseHistory[i].y - _noseHistory[j].y).toDouble();
            final double dist = sqrt(dx * dx + dy * dy);
            if (dist > maxNoseDist) {
              maxNoseDist = dist;
            }
          }
        }
        if (maxNoseDist > 0.5) {
          _motionDetected = true;
        }
      }
    }
  }

  Future<void> _evaluateLiveFace(Face face) async {
    if (face.landmarks[FaceLandmarkType.leftEye] == null ||
        face.landmarks[FaceLandmarkType.rightEye] == null ||
        face.landmarks[FaceLandmarkType.noseBase] == null ||
        face.landmarks[FaceLandmarkType.leftMouth] == null ||
        face.landmarks[FaceLandmarkType.rightMouth] == null ||
        face.landmarks[FaceLandmarkType.bottomMouth] == null) {
      _consecutiveStableFrames = 0;
      _stableEmbeddings.clear();
      setState(() {
        _currentStep = VerificationStep.detectingFace;
        _scanningStatus = 'Face partially visible. Center face.';
        _verifyProgress = 0.15;
      });
      return;
    }

    final double frameWidth = _cameraController?.value.previewSize?.height ?? 720.0;
    final double frameHeight = _cameraController?.value.previewSize?.width ?? 1280.0;

    final double faceCenterX = face.boundingBox.center.dx;
    final double faceCenterY = face.boundingBox.center.dy;
    final double faceWidth = face.boundingBox.width;

    if (faceWidth < frameWidth * 0.25) {
      _consecutiveStableFrames = 0;
      _stableEmbeddings.clear();
      setState(() {
        _currentStep = VerificationStep.detectingFace;
        _scanningStatus = 'Please move closer to the camera.';
        _verifyProgress = 0.15;
      });
      return;
    }

    if (faceCenterX < frameWidth * 0.28 || faceCenterX > frameWidth * 0.72 ||
        faceCenterY < frameHeight * 0.25 || faceCenterY > frameHeight * 0.75) {
      _consecutiveStableFrames = 0;
      _stableEmbeddings.clear();
      setState(() {
        _currentStep = VerificationStep.detectingFace;
        _scanningStatus = 'Center your face inside the circle.';
        _verifyProgress = 0.15;
      });
      return;
    }

    final yaw = face.headEulerAngleY ?? 0;
    final pitch = face.headEulerAngleX ?? 0;

    if (yaw.abs() > 10.0 || pitch.abs() > 10.0) {
      _consecutiveStableFrames = 0;
      _stableEmbeddings.clear();
      setState(() {
        _currentStep = VerificationStep.detectingFace;
        _scanningStatus = 'Look straight at the camera.';
        _verifyProgress = 0.20;
      });
      return;
    }

    _consecutiveStableFrames++;
    if (_consecutiveStableFrames < 3) {
      setState(() {
        _currentStep = VerificationStep.detectingFace;
        _scanningStatus = 'Stabilizing face...';
        _verifyProgress = 0.30;
      });
      return;
    }

    if (_currentStep == VerificationStep.detectingFace || _currentStep == VerificationStep.liveCamera) {
      setState(() {
        _currentStep = VerificationStep.verifyingLiveness;
        _scanningStatus = 'Verifying Liveness: Blink & tilt head';
        _verifyProgress = 0.40;
      });
    }

    if (_currentStep == VerificationStep.verifyingLiveness) {
      _updateLivenessData(face);

      if (_scanStartTime != null && DateTime.now().difference(_scanStartTime!).inSeconds > 6) {
        _abortAndResetScan('Liveness check timed out. No motion or blink detected.');
        return;
      }

      if (_blinkDetected && _motionDetected) {
        setState(() {
          _currentStep = VerificationStep.matchingIdentity;
          _scanningStatus = 'Liveness Verified';
          _verifyProgress = 0.60;
        });
      } else {
        setState(() {
          String hint = 'Liveness: ';
          if (!_blinkDetected && !_motionDetected) {
            hint += 'Blink and move head slightly';
          } else if (!_blinkDetected) {
            hint += 'Please blink your eyes';
          } else {
            hint += 'Turn head slightly';
          }
          _scanningStatus = hint;
          _verifyProgress = 0.40 + (_blinkDetected ? 0.10 : 0.0) + (_motionDetected ? 0.10 : 0.0);
        });
        return;
      }
    }

    if (_currentStep == VerificationStep.matchingIdentity) {
      final liveEmbedding = _faceRecognitionService.getLandmarkEmbedding(face);
      if (liveEmbedding.every((v) => v == 0.0)) {
        _abortAndResetScan('Biometric feature extraction failed.');
        return;
      }
      _stableEmbeddings.add(liveEmbedding);

      if (_stableEmbeddings.length < 4) {
        setState(() {
          _scanningStatus = 'Generating Live Vector (${_stableEmbeddings.length}/4)...';
          _verifyProgress = 0.60 + (_stableEmbeddings.length * 0.08);
        });
        return;
      }

      final averagedEmbedding = List<double>.filled(128, 0.0);
      for (int i = 0; i < 128; i++) {
        double sum = 0.0;
        for (final emb in _stableEmbeddings) {
          sum += emb[i];
        }
        averagedEmbedding[i] = sum / _stableEmbeddings.length;
      }

      double sumSq = 0.0;
      for (final val in averagedEmbedding) {
        sumSq += val * val;
      }
      final norm = sqrt(sumSq);
      if (norm > 0) {
        for (int i = 0; i < 128; i++) {
          averagedEmbedding[i] = averagedEmbedding[i] / norm;
        }
      }

      if (_registeredFaceEmbedding == null) {
        _abortAndResetScan('Biometric template missing.');
        return;
      }

      final similarity = _faceRecognitionService.calculateCosineSimilarity(
        averagedEmbedding,
        _registeredFaceEmbedding!,
      );

      debugPrint('[Biometric Matcher] Multi-frame averaged cosine similarity: $similarity (Threshold: 0.90)');

      _heartbeatTimer?.cancel();
      if (!kIsWeb && _cameraController != null && _cameraController!.value.isStreamingImages) {
        try {
          _cameraController!.stopImageStream();
        } catch (_) {}
      }

      setState(() {
        _isScanning = false;
        _verifyProgress = 1.0;
      });

      const matchThreshold = 0.90;
      if (similarity >= matchThreshold) {
        _currentStep = VerificationStep.recorded;
        setState(() {
          _scanningStatus = 'Attendance Recorded';
        });
        await _submitVerificationToBackend(averagedEmbedding);
      } else {
        _abortAndResetScan('Face mismatch detected.');
      }
    }
  }

  Future<void> _submitVerificationToBackend(List<double> embedding) async {
    try {
      final token = await _storage.read(key: 'access_token');
      if (token == null) {
        throw Exception('Session expired. Log in again.');
      }

      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/attendance/verify'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'employee_id': _selectedEmployee!.employeeId,
          'face_embedding': embedding,
          'gps_lat': 23.0225,
          'gps_lng': 72.5714,
          'device_id': 'Factory Gate A Mobile Unit',
        }),
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

      if (response.statusCode == 429) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        playBeepSound(false);
        setState(() {
          _scanningStatus = data['message'] ?? 'Duplicate scan detected.';
        });
        _showDuplicateDialog(
          'Duplicate Scan',
          data['message'] ?? 'Please wait 5 minutes before scanning again.',
        );
        return;
      }

      if (response.statusCode == 409) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        playBeepSound(false);

        if (data['error_code'] == 'ATTENDANCE_ALREADY_MARKED') {
          final prevTime = data['previous_check_in'] != null 
              ? _formatTo12Hour(data['previous_check_in']) 
              : '';
          setState(() {
            _scanningStatus = 'Attendance already marked for today.';
          });
          final prevMsg = prevTime.isNotEmpty ? ' Previous check-in was recorded at $prevTime.' : '';
          _showDuplicateDialog('Already Checked In', '🕒 Attendance already logged for today.$prevMsg');
          return;
        } else if (data['error_code'] == 'ATTENDANCE_COMPLETED') {
          setState(() {
            _scanningStatus = 'Attendance already completed for today.';
          });
          _showDuplicateDialog('Attendance Completed', 'Shift completed. Attendance already recorded for today.');
          return;
        }
      }

      if (response.statusCode != 200) {
        try {
          final errData = jsonDecode(response.body);
          throw Exception(errData['message'] ?? 'Verification rejected.');
        } catch (_) {
          throw Exception('Verification request failed (Status: ${response.statusCode}).');
        }
      }

      final Map<String, dynamic> data = jsonDecode(response.body);
      if (data['success'] == true) {
        playBeepSound(true);
        setState(() {
          _isSuccess = true;
          _scanningStatus = 'Verification successful';
        });
        _showSuccessDialog(data);
      } else {
        throw Exception(data['message'] ?? 'Verification rejected.');
      }
    } catch (err) {
      final message = err.toString().replaceAll('Exception:', '').trim();
      playBeepSound(false);
      setState(() {
        _scanningStatus = 'Verification error';
        _scanError = message;
      });
      _showFailureDialog('Verification Failed', message);
    }
  }

  String _formatTo12Hour(String timeStr) {
    if (timeStr.isEmpty) return '';
    try {
      final parts = timeStr.split(':');
      if (parts.length < 2) return timeStr;
      int hour = int.parse(parts[0]);
      final minute = parts[1];
      final ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour == 0) hour = 12;
      final hourStr = hour < 10 ? '0$hour' : '$hour';
      return '$hourStr:$minute $ampm';
    } catch (e) {
      return timeStr;
    }
  }

  String _formatTimestampTo12Hour(String? timestampStr) {
    if (timestampStr == null || timestampStr.isEmpty) return '';
    try {
      final dt = DateTime.parse(timestampStr).toLocal();
      int hour = dt.hour;
      final minute = dt.minute.toString().padLeft(2, '0');
      final ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour == 0) hour = 12;
      final hourStr = hour < 10 ? '0$hour' : '$hour';
      return '$hourStr:$minute $ampm';
    } catch (e) {
      return timestampStr;
    }
  }

  void _showSuccessDialog(Map<String, dynamic> responseData) {
    final isCheckout = responseData['checkout'] != null;
    final checkout = responseData['checkout'] ?? {};

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Dialog(
            backgroundColor: AppTheme.cardBg.withOpacity(0.85),
            elevation: 8,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(
                color: isCheckout ? Colors.orange.withOpacity(0.4) : AppTheme.successGreen.withOpacity(0.4),
                width: 1,
              ),
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
                      color: (isCheckout ? Colors.orange : AppTheme.successGreen).withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      isCheckout ? Icons.exit_to_app_rounded : Icons.check_circle_outline_rounded,
                      color: isCheckout ? Colors.orange : AppTheme.successGreen,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    isCheckout ? 'EARLY CHECKOUT RECORDED' : 'ATTENDANCE LOGGED',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: isCheckout ? Colors.orange : AppTheme.successGreen,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _selectedEmployee!.fullName,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'ID: ${_selectedEmployee!.employeeId}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.mutedText),
                  ),
                  const SizedBox(height: 14),
                  const Divider(color: Colors.white10, height: 1),
                  const SizedBox(height: 12),
                  if (isCheckout) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Check-Out Time', style: TextStyle(fontSize: 11, color: AppTheme.mutedText)),
                        Text(
                          _formatTimestampTo12Hour(checkout['check_out']),
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Working Hours', style: TextStyle(fontSize: 11, color: AppTheme.mutedText)),
                        Text(
                          checkout['working_hours'] ?? '-',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                        ),
                      ],
                    ),
                  ] else ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Check-In Time', style: TextStyle(fontSize: 11, color: AppTheme.mutedText)),
                        Text(
                          DateTime.now().toLocal().toString().split(' ')[1].substring(0, 5),
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Biometric Confidence', style: TextStyle(fontSize: 11, color: AppTheme.mutedText)),
                        const Text(
                          'Verified (100%)',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.neonCyan),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 40,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                        Navigator.of(context).pop(true);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isCheckout ? Colors.orange : AppTheme.successGreen,
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

  void _showFailureDialog(String title, String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Dialog(
            backgroundColor: AppTheme.cardBg.withOpacity(0.85),
            elevation: 8,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(
                color: AppTheme.errorRed,
                width: 1,
              ),
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
                      color: AppTheme.errorRed.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.face_retouching_off_rounded,
                      color: AppTheme.errorRed,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    title.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.errorRed,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.3),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 40,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.errorRed,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('Retry Scan', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
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

  void _showDuplicateDialog(String title, String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Dialog(
            backgroundColor: AppTheme.cardBg.withOpacity(0.85),
            elevation: 8,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(
                color: Colors.orange,
                width: 1,
              ),
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
                      color: Colors.orange.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.history_toggle_off_rounded,
                      color: Colors.orange,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    title.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.orange,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    style: const TextStyle(fontSize: 12, color: Colors.white70, height: 1.3),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 40,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                        Navigator.of(context).pop(true);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
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

  void _showWebDemoDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Dialog(
            backgroundColor: AppTheme.cardBg.withOpacity(0.85),
            elevation: 8,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(
                color: Colors.orange,
                width: 1,
              ),
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
                      color: Colors.orange.withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.settings_suggest_rounded,
                      color: Colors.orange,
                      size: 36,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'DEMO MODE ACTIVE',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.orange,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Biometric gate check-in is restricted to the native Android app. The web simulation successfully completed liveness and face checks, but no database entry was created.',
                    style: TextStyle(fontSize: 11, color: Colors.white70, height: 1.4),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    height: 40,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.of(context).pop();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: AppTheme.darkBg,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('OK', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
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
          'BIOMETRIC GATE SCANNER',
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
                      : _registeredEmployees.isEmpty
                          ? _buildEmptyDirectoryWidget()
                          : LayoutBuilder(
                              builder: (context, constraints) {
                                final isSmallHeight = constraints.maxHeight < 550;
                                if (isSmallHeight) {
                                  return SingleChildScrollView(
                                    child: Column(
                                      children: [
                                        _buildSelectionCard(),
                                        const SizedBox(height: 10),
                                        _buildCameraPreview(true),
                                        const SizedBox(height: 10),
                                        _buildControlCard(),
                                      ],
                                    ),
                                  );
                                } else {
                                  return Column(
                                    children: [
                                      _buildSelectionCard(),
                                      const Spacer(),
                                      _buildCameraPreview(false),
                                      const Spacer(),
                                      _buildControlCard(),
                                    ],
                                  );
                                }
                              },
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
                onPressed: _fetchRegisteredEmployees,
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

  Widget _buildEmptyDirectoryWidget() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppTheme.cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_accounts_rounded, color: Colors.amber, size: 40),
            const SizedBox(height: 16),
            const Text(
              'No registered templates found.',
              style: TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            const Text(
              'Please enroll employee face profiles in the Web Portal first.',
              style: TextStyle(fontSize: 11, color: AppTheme.mutedText),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 40,
              child: ElevatedButton.icon(
                onPressed: _fetchRegisteredEmployees,
                icon: const Icon(Icons.sync_rounded, size: 16),
                label: const Text('Refresh Directory', style: TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.cardBg,
                  foregroundColor: AppTheme.neonCyan,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: const BorderSide(color: Colors.white10),
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
            'SELECT EMPLOYEE FOR SCAN',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.mutedText, letterSpacing: 0.8),
          ),
          const SizedBox(height: 4),
          DropdownButtonHideUnderline(
            child: DropdownButton<EmployeeModel>(
              value: _selectedEmployee,
              isExpanded: true,
              dropdownColor: AppTheme.cardBg,
              icon: const Icon(Icons.arrow_drop_down, color: AppTheme.neonCyan),
              items: _registeredEmployees.map((emp) {
                return DropdownMenuItem<EmployeeModel>(
                  value: emp,
                  child: Text(
                    '${emp.fullName} (${emp.employeeId})',
                    style: const TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                );
              }).toList(),
              onChanged: _isScanning
                  ? null
                  : (val) {
                      if (val != null) {
                        setState(() {
                          _selectedEmployee = val;
                          _stableEmbeddings.clear();
                          _verifyProgress = 0.0;
                          _scanError = null;
                          _isSuccess = false;
                          _isDuplicate = false;
                          _scanningStatus = _isRealDetection 
                              ? 'Loading face template...' 
                              : 'Face template ready. Align face to scan.';
                        });
                        if (_isRealDetection) {
                          _extractRegisteredTemplate();
                        }
                      }
                    },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCameraPreview(bool isSmallHeight) {
    final size = isSmallHeight ? 180.0 : 220.0;
    final borderColor = _isSuccess
        ? AppTheme.successGreen
        : _isDuplicate
            ? Colors.orange
            : _scanError != null
                ? AppTheme.errorRed
                : _isScanning
                    ? AppTheme.neonCyan
                    : Colors.white24;

    return Center(
      child: PulsingScannerRing(
        isScanning: _isScanning,
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
                                    padding: const EdgeInsets.all(16.0),
                                    child: Text(
                                      'Camera Init Blocked:\n$_cameraInitError',
                                      style: const TextStyle(color: AppTheme.errorRed, fontSize: 10),
                                      textAlign: TextAlign.center,
                                    ),
                                  )
                                : const CircularProgressIndicator(color: AppTheme.neonCyan),
                          ),
                        ),
                ),
                // HUD bracket alignment guide
                const Positioned.fill(
                  child: Padding(
                    padding: EdgeInsets.all(12.0),
                    child: ScannerCornerBrackets(),
                  ),
                ),
                // Dynamic animated scanner laser sweep line
                if (_isScanning)
                  const Positioned.fill(
                    child: ScanningLaserLine(),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildControlCard() {
    IconData stepIcon = Icons.videocam_rounded;
    String stepLabel = 'Camera Ready';
    Color stepColor = AppTheme.mutedText;
    bool showPulsing = false;

    switch (_currentStep) {
      case VerificationStep.liveCamera:
        stepIcon = Icons.videocam_rounded;
        stepLabel = 'Camera Ready';
        stepColor = AppTheme.neonCyan;
        showPulsing = true;
        break;
      case VerificationStep.detectingFace:
        stepIcon = Icons.face_retouching_natural_rounded;
        stepLabel = 'Detecting Face';
        stepColor = AppTheme.neonCyan;
        showPulsing = true;
        break;
      case VerificationStep.verifyingLiveness:
        stepIcon = Icons.remove_red_eye_rounded;
        stepLabel = 'Verifying Liveness';
        stepColor = Colors.purpleAccent;
        showPulsing = true;
        break;
      case VerificationStep.matchingIdentity:
        stepIcon = Icons.fingerprint_rounded;
        stepLabel = 'Matching Identity';
        stepColor = AppTheme.accentIndigo;
        showPulsing = true;
        break;
      case VerificationStep.recorded:
        stepIcon = Icons.check_circle_rounded;
        stepLabel = 'Attendance Recorded';
        stepColor = AppTheme.successGreen;
        break;
    }

    if (_scanError != null) {
      stepIcon = Icons.error_outline_rounded;
      stepLabel = _scanError!;
      stepColor = AppTheme.errorRed;
      showPulsing = false;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.cardBg.withOpacity(0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (showPulsing)
                _PulsingIndicator(color: stepColor)
              else
                Icon(stepIcon, size: 18, color: stepColor),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _isScanning ? stepLabel : (_scanError ?? _scanningStatus),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: stepColor,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _verifyProgress,
              backgroundColor: Colors.white10,
              valueColor: AlwaysStoppedAnimation<Color>(stepColor),
              minHeight: 4,
            ),
          ),
          const SizedBox(height: 10),
          if (!_isScanning) ...[
            GestureDetector(
              onTap: _templateError == null
                  ? null
                  : () => _showQualityDiagnosticModal(_templateError!),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: _loadingTemplate
                      ? Colors.white.withOpacity(0.04)
                      : _templateError != null
                          ? AppTheme.errorRed.withOpacity(0.08)
                          : AppTheme.successGreen.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _loadingTemplate
                        ? Colors.white10
                        : _templateError != null
                            ? AppTheme.errorRed.withOpacity(0.2)
                            : AppTheme.successGreen.withOpacity(0.2),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.max,
                  children: [
                    Icon(
                      _loadingTemplate
                          ? Icons.sync_rounded
                          : _templateError != null
                              ? Icons.error_outline_rounded
                              : Icons.check_circle_outline_rounded,
                      size: 14,
                      color: _loadingTemplate
                          ? AppTheme.mutedText
                          : _templateError != null
                              ? AppTheme.errorRed
                              : AppTheme.successGreen,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _loadingTemplate
                          ? 'VALIDATING BIOMETRIC PROFILE...'
                          : _templateError != null
                              ? 'EMPLOYEE PROFILE IMAGE INVALID (TAP TO DIAGNOSE)'
                              : 'EMPLOYEE BIOMETRIC PROFILE READY',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: _loadingTemplate
                            ? AppTheme.mutedText
                            : _templateError != null
                                ? AppTheme.errorRed
                                : AppTheme.successGreen,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: double.infinity,
              height: 40,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: _loadingTemplate || _templateError != null
                        ? [Colors.grey.shade800, Colors.grey.shade900]
                        : [AppTheme.neonCyan, AppTheme.neonCyan.withOpacity(0.7)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: _loadingTemplate || _templateError != null
                      ? []
                      : [
                          BoxShadow(
                            color: AppTheme.neonCyan.withOpacity(0.2),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          )
                        ],
                ),
                child: ElevatedButton(
                  onPressed: _loadingTemplate || _templateError != null ? null : _runFaceVerification,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.face_unlock_rounded, size: 16, color: AppTheme.darkBg),
                      const SizedBox(width: 8),
                      Text(
                        _loadingTemplate ? 'LOADING TEMPLATE...' : 'START GATE VERIFICATION',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 11,
                          color: AppTheme.darkBg,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ] else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(
                    height: 10,
                    width: 10,
                    child: CircularProgressIndicator(color: AppTheme.neonCyan, strokeWidth: 1.5),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      _currentStep == VerificationStep.verifyingLiveness
                          ? 'Liveness active: micro movement required'
                          : 'Secure scanning active...',
                      style: const TextStyle(fontSize: 10, color: AppTheme.mutedText, fontStyle: FontStyle.italic),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          if (kIsWeb) ...[
            const SizedBox(height: 8),
            const Text(
              '⚠️ DEMO MODE: Attendance logging is disabled on web.',
              style: TextStyle(
                fontSize: 10,
                color: Colors.orange,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------
// HUD animations & overlays
// ---------------------------------------------------------

class ScannerCornerBrackets extends StatelessWidget {
  const ScannerCornerBrackets({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _BracketsPainter(),
      child: const SizedBox.expand(),
    );
  }
}

class _BracketsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.neonCyan.withOpacity(0.5)
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    const len = 16.0;
    // Top Left
    canvas.drawPath(Path()..moveTo(0, len)..lineTo(0, 0)..lineTo(len, 0), paint);
    // Top Right
    canvas.drawPath(Path()..moveTo(size.width - len, 0)..lineTo(size.width, 0)..lineTo(size.width, len), paint);
    // Bottom Left
    canvas.drawPath(Path()..moveTo(0, size.height - len)..lineTo(0, size.height)..lineTo(len, size.height), paint);
    // Bottom Right
    canvas.drawPath(Path()..moveTo(size.width - len, size.height)..lineTo(size.width, size.height)..lineTo(size.width, size.height - len), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class ScanningLaserLine extends StatefulWidget {
  const ScanningLaserLine({super.key});

  @override
  State<ScanningLaserLine> createState() => _ScanningLaserLineState();
}

class _ScanningLaserLineState extends State<ScanningLaserLine> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          painter: _LaserPainter(_controller.value),
          child: const SizedBox.expand(),
        );
      },
    );
  }
}

class _LaserPainter extends CustomPainter {
  final double progress;

  _LaserPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.neonCyan
      ..strokeWidth = 2.0
      ..shader = LinearGradient(
        colors: [
          AppTheme.neonCyan.withOpacity(0.0),
          AppTheme.neonCyan,
          AppTheme.neonCyan.withOpacity(0.0),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final y = size.height * progress;
    canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);

    final glowPaint = Paint()
      ..color = AppTheme.neonCyan.withOpacity(0.15)
      ..style = PaintingStyle.fill;
    
    final glowRect = Rect.fromLTWH(0, y - 8, size.width, 16);
    canvas.drawRect(glowRect, glowPaint);
  }

  @override
  bool shouldRepaint(covariant _LaserPainter oldDelegate) => oldDelegate.progress != progress;
}

class PulsingScannerRing extends StatefulWidget {
  final bool isScanning;
  final Widget child;

  const PulsingScannerRing({super.key, required this.isScanning, required this.child});

  @override
  State<PulsingScannerRing> createState() => _PulsingScannerRingState();
}

class _PulsingScannerRingState extends State<PulsingScannerRing> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );
    if (widget.isScanning) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant PulsingScannerRing oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isScanning && !oldWidget.isScanning) {
      _controller.repeat();
    } else if (!widget.isScanning && oldWidget.isScanning) {
      _controller.stop();
      _controller.reset();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        if (widget.isScanning) ...[
          AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              final scale = 1.0 + (_controller.value * 0.12);
              final opacity = 1.0 - _controller.value;
              return Container(
                width: 220 * scale,
                height: 286 * scale,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.all(Radius.elliptical(110 * scale, 143 * scale)),
                  border: Border.all(
                    color: AppTheme.neonCyan.withOpacity(opacity * 0.4),
                    width: 2.0,
                  ),
                ),
              );
            },
          ),
          AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              final scale = 1.0 + (((_controller.value + 0.5) % 1.0) * 0.12);
              final opacity = 1.0 - ((_controller.value + 0.5) % 1.0);
              return Container(
                width: 220 * scale,
                height: 286 * scale,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.all(Radius.elliptical(110 * scale, 143 * scale)),
                  border: Border.all(
                    color: AppTheme.neonCyan.withOpacity(opacity * 0.25),
                    width: 1.5,
                  ),
                ),
              );
            },
          ),
        ],
        widget.child,
      ],
    );
  }
}

class _PulsingIndicator extends StatefulWidget {
  final Color color;
  const _PulsingIndicator({required this.color});

  @override
  State<_PulsingIndicator> createState() => _PulsingIndicatorState();
}

class _PulsingIndicatorState extends State<_PulsingIndicator> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.color,
            boxShadow: [
              BoxShadow(
                color: widget.color.withOpacity(0.6 * _controller.value),
                blurRadius: 6 * _controller.value,
                spreadRadius: 3 * _controller.value,
              ),
            ],
          ),
        );
      },
    );
  }
}
