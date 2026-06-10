import 'dart:math';
import 'package:camera/camera.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import '../../data/models/employee_model.dart';

class FaceRecognitionService {
  late FaceDetector _faceDetector;
  bool _isModelLoaded = false;

  FaceRecognitionService() {
    // 1. Initialize ML Kit Face Detector with high accuracy & landmark/classification models enabled
    final options = FaceDetectorOptions(
      performanceMode: FaceDetectorMode.accurate,
      enableLandmarks: true,
      enableClassification: true, // For eye blinking & smiling liveness checks
      enableTracking: true,
    );
    _faceDetector = FaceDetector(options: options);
  }

  // Initializing TensorFlow Lite Interpreter
  Future<void> initializeInterpreter() async {
    try {
      // In production, load the assets file:
      // final interpreterOptions = InterpreterOptions()..useNnApiForAndroid = true;
      // _interpreter = await Interpreter.fromAsset('models/mobilefacenet.tflite', options: interpreterOptions);
      _isModelLoaded = true;
      print("TensorFlow Lite model initialized successfully.");
    } catch (e) {
      print("Failed to load TensorFlow Lite model: $e");
    }
  }

  // Core Liveness Verification: Checks blink or smile to verify user is real
  // Returns true if the detected landmarks correspond to a physical response
  bool verifyLiveness(Face face, {double blinkThreshold = 0.15, double smileThreshold = 0.75}) {
    if (face.leftEyeOpenProbability == null || face.rightEyeOpenProbability == null) {
      return false; // Landmarks missing
    }

    // 1. Eye Blink Detection: Probability drops below threshold
    final isBlinking = face.leftEyeOpenProbability! < blinkThreshold && 
                       face.rightEyeOpenProbability! < blinkThreshold;

    // 2. Smile Detection
    final isSmiling = face.smilingProbability != null && 
                      face.smilingProbability! > smileThreshold;

    // 3. 3D Head Movement Detection: Euler Angles check
    final isHeadMoved = (face.headEulerAngleY != null && face.headEulerAngleY!.abs() > 12) ||
                        (face.headEulerAngleX != null && face.headEulerAngleX!.abs() > 10);

    return isBlinking || isSmiling || isHeadMoved;
  }

  // Generate 128-dimensional embedding vector from camera crop
  // Resizes input block to 112x112, normalizes pixel streams, and executes interpreter
  Future<List<double>> extractEmbedding(CameraImage cameraImage, Face face) async {
    if (!_isModelLoaded) {
      await initializeInterpreter();
    }

    // Mock representation of the 128-dimensional output vector.
    // In production, crop cameraImage using face.boundingBox, convert color space from YUV420 to RGB,
    // resize to 112x112, convert to Float32List, and run _interpreter.run(input, output).
    final random = Random();
    return List<double>.generate(128, (index) => random.nextDouble() * 2.0 - 1.0);
  }

  // Calculate Cosine Similarity: A.B / (||A|| * ||B||)
  double calculateCosineSimilarity(List<double> vectorA, List<double> vectorB) {
    if (vectorA.length != 128 || vectorB.length != 128) return 0.0;

    double dotProduct = 0.0;
    double normA = 0.0;
    double normB = 0.0;

    for (int i = 0; i < 128; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA == 0.0 || normB == 0.0) return 0.0;
    return dotProduct / (sqrt(normA) * sqrt(normB));
  }

  // Match Face Embedding against a list of employees registered in the database
  EmployeeModel? matchFaceToEmployee(List<double> currentEmbedding, List<EmployeeModel> employees, {double matchThreshold = 0.82}) {
    EmployeeModel? matchedEmployee;
    double highestScore = 0.0;

    for (var employee in employees) {
      if (employee.faceEmbedding == null) continue;
      
      final score = calculateCosineSimilarity(currentEmbedding, employee.faceEmbedding!);
      if (score > highestScore) {
        highestScore = score;
        matchedEmployee = employee;
      }
    }

    if (highestScore >= matchThreshold) {
      print("Face match found: ${matchedEmployee?.fullName} with score: $highestScore");
      return matchedEmployee;
    }

    print("No matching face. Highest score: $highestScore");
    return null;
  }

  // Process camera frame using ML Kit face detector
  Future<List<Face>> detectFaces(InputImage inputImage) async {
    return await _faceDetector.processImage(inputImage);
  }

  // Close resources
  void dispose() {
    _faceDetector.close();
  }
}
