import 'dart:math';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

class FaceRecognitionService {
  late FaceDetector _faceDetector;

  FaceRecognitionService() {
    final options = FaceDetectorOptions(
      performanceMode: FaceDetectorMode.accurate,
      enableLandmarks: true,
      enableClassification: true,
      enableTracking: true,
    );
    _faceDetector = FaceDetector(options: options);
  }

  Future<List<Face>> detectFaces(InputImage inputImage) async {
    return await _faceDetector.processImage(inputImage);
  }

  /// Extracts a scale, rotation, and translation-invariant 128-dimensional biometric embedding.
  List<double> getLandmarkEmbedding(Face face) {
    final leftEye = face.landmarks[FaceLandmarkType.leftEye]?.position;
    final rightEye = face.landmarks[FaceLandmarkType.rightEye]?.position;
    final noseBase = face.landmarks[FaceLandmarkType.noseBase]?.position;
    final leftMouth = face.landmarks[FaceLandmarkType.leftMouth]?.position;
    final rightMouth = face.landmarks[FaceLandmarkType.rightMouth]?.position;
    final bottomMouth = face.landmarks[FaceLandmarkType.bottomMouth]?.position;
    final leftCheek = face.landmarks[FaceLandmarkType.leftCheek]?.position;
    final rightCheek = face.landmarks[FaceLandmarkType.rightCheek]?.position;

    // Core landmarks required for the spatial normalization coordinate frame
    if (leftEye == null || rightEye == null || noseBase == null) {
      return List<double>.filled(128, 0.0);
    }

    // 1. Compute stable center origin (midpoint of the eyes)
    final double originX = (leftEye.x + rightEye.x) / 2.0;
    final double originY = (leftEye.y + rightEye.y) / 2.0;

    // 2. Compute eye distance as scale factor
    final double dx = (rightEye.x - leftEye.x).toDouble();
    final double dy = (rightEye.y - leftEye.y).toDouble();
    final double eyeDist = sqrt(dx * dx + dy * dy);
    if (eyeDist == 0) return List<double>.filled(128, 0.0);

    // 3. Compute rotation angle (yaw/roll tilt) of the eyes
    final double angle = atan2(dy, dx);
    final double cosA = cos(angle);
    final double sinA = sin(angle);

    // Helper to translate, rotate (align horizontally), and scale coordinate points
    List<double> normalizePoint(Point<int>? p) {
      if (p == null) return [0.0, 0.0];
      // Translate relative to eye midpoint
      final double tx = p.x - originX;
      final double ty = p.y - originY;
      // Rotate by -angle to align the eye line horizontally
      final double rx = tx * cosA + ty * sinA;
      final double ry = -tx * sinA + ty * cosA;
      // Scale by eye distance
      return [rx / eyeDist, ry / eyeDist];
    }

    final List<double> features = [];

    // Add normalized 2D coordinates for all 8 key features
    features.addAll(normalizePoint(leftEye));
    features.addAll(normalizePoint(rightEye));
    features.addAll(normalizePoint(noseBase));
    features.addAll(normalizePoint(leftMouth));
    features.addAll(normalizePoint(rightMouth));
    features.addAll(normalizePoint(bottomMouth));
    features.addAll(normalizePoint(leftCheek));
    features.addAll(normalizePoint(rightCheek));

    // Helper to compute Euclidean distance between two points
    double getDist(Point<int>? p1, Point<int>? p2) {
      if (p1 == null || p2 == null) return 0.0;
      final double idx = (p2.x - p1.x).toDouble();
      final double idy = (p2.y - p1.y).toDouble();
      return sqrt(idx * idx + idy * idy);
    }

    // Add 8 absolute face landmark distance ratios (highly rotation, translation, and scale invariant)
    // Ratio 1: Nose to mouth center / Eye distance
    final mouthCenterX = leftMouth != null && rightMouth != null ? (leftMouth.x + rightMouth.x) ~/ 2 : originX.toInt();
    final mouthCenterY = leftMouth != null && rightMouth != null ? (leftMouth.y + rightMouth.y) ~/ 2 : originY.toInt();
    final mouthCenter = Point<int>(mouthCenterX, mouthCenterY);
    features.add(getDist(noseBase, mouthCenter) / eyeDist);

    // Ratio 2: Mouth width / Eye distance
    features.add(getDist(leftMouth, rightMouth) / eyeDist);

    // Ratio 3: Cheek width / Eye distance
    features.add(getDist(leftCheek, rightCheek) / eyeDist);

    // Ratio 4: Nose base to bottom mouth lip / Eye distance
    features.add(getDist(noseBase, bottomMouth) / eyeDist);

    // Ratio 5: Left eye to left cheek / Eye distance
    features.add(getDist(leftEye, leftCheek) / eyeDist);

    // Ratio 6: Right eye to right cheek / Eye distance
    features.add(getDist(rightEye, rightCheek) / eyeDist);

    // Ratio 7: Left eye to nose base / Eye distance
    features.add(getDist(leftEye, noseBase) / eyeDist);

    // Ratio 8: Right eye to nose base / Eye distance
    features.add(getDist(rightEye, noseBase) / eyeDist);

    // Expand coordinate and ratio descriptor (24 values) into a high-dimensional vector
    // using sinusoidal positional encoding (multi-frequency basis functions)
    final List<double> embedding = [];
    for (int i = 0; i < features.length; i++) {
      final val = features[i];
      embedding.add(val);
      for (int freq = 1; freq <= 2; freq++) {
        embedding.add(sin(val * freq * pi));
        embedding.add(cos(val * freq * pi));
      }
    }

    // Pad embedding deterministically to exactly 128 elements
    while (embedding.length < 128) {
      embedding.add(embedding[embedding.length - 24] * 0.5);
    }

    // Normalize final embedding vector to unit L2 length (Cosine Similarity = Dot Product)
    double sumSq = 0.0;
    for (final val in embedding) {
      sumSq += val * val;
    }
    final norm = sqrt(sumSq);
    if (norm > 0) {
      for (int i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / norm;
      }
    }

    return embedding;
  }

  /// Calculates cosine similarity between two 128-dimensional unit vectors.
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

  void dispose() {
    _faceDetector.close();
  }
}
