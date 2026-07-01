import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

class FaceRecognitionService {
  static final FaceRecognitionService _instance = FaceRecognitionService._internal();
  static FaceDetector? _staticDetector;

  factory FaceRecognitionService() {
    return _instance;
  }

  FaceRecognitionService._internal();

  FaceDetector get _faceDetector {
    if (_staticDetector == null) {
      final options = FaceDetectorOptions(
        performanceMode: FaceDetectorMode.accurate,
        enableLandmarks: true,
        enableClassification: true,
        enableTracking: true,
      );
      _staticDetector = FaceDetector(options: options);
    }
    return _staticDetector!;
  }

  Future<List<Face>> detectFaces(InputImage inputImage) async {
    return _faceDetector.processImage(inputImage);
  }

  List<double> getLandmarkEmbedding(Face face) {
    final leftEye = face.landmarks[FaceLandmarkType.leftEye]?.position;
    final rightEye = face.landmarks[FaceLandmarkType.rightEye]?.position;
    final noseBase = face.landmarks[FaceLandmarkType.noseBase]?.position;
    final leftMouth = face.landmarks[FaceLandmarkType.leftMouth]?.position;
    final rightMouth = face.landmarks[FaceLandmarkType.rightMouth]?.position;
    final bottomMouth = face.landmarks[FaceLandmarkType.bottomMouth]?.position;
    final leftCheek = face.landmarks[FaceLandmarkType.leftCheek]?.position;
    final rightCheek = face.landmarks[FaceLandmarkType.rightCheek]?.position;

    if (leftEye == null || rightEye == null || noseBase == null) {
      return List<double>.filled(128, 0.0);
    }

    final originX = (leftEye.x + rightEye.x) / 2.0;
    final originY = (leftEye.y + rightEye.y) / 2.0;

    final dx = (rightEye.x - leftEye.x).toDouble();
    final dy = (rightEye.y - leftEye.y).toDouble();
    final eyeDist = sqrt(dx * dx + dy * dy);
    if (eyeDist == 0) return List<double>.filled(128, 0.0);

    final angle = atan2(dy, dx);
    final cosA = cos(angle);
    final sinA = sin(angle);

    List<double> normalizePoint(Point<int>? point) {
      if (point == null) return [0.0, 0.0];
      final tx = point.x - originX;
      final ty = point.y - originY;
      final rx = tx * cosA + ty * sinA;
      final ry = -tx * sinA + ty * cosA;
      return [rx / eyeDist, ry / eyeDist];
    }

    double distanceBetween(Point<int>? pointA, Point<int>? pointB) {
      if (pointA == null || pointB == null) return 0.0;
      final dx = (pointB.x - pointA.x).toDouble();
      final dy = (pointB.y - pointA.y).toDouble();
      return sqrt(dx * dx + dy * dy);
    }

    final features = <double>[];
    features.addAll(normalizePoint(leftEye));
    features.addAll(normalizePoint(rightEye));
    features.addAll(normalizePoint(noseBase));
    features.addAll(normalizePoint(leftMouth));
    features.addAll(normalizePoint(rightMouth));
    features.addAll(normalizePoint(bottomMouth));
    features.addAll(normalizePoint(leftCheek));
    features.addAll(normalizePoint(rightCheek));

    final mouthCenterX = leftMouth != null && rightMouth != null ? (leftMouth.x + rightMouth.x) ~/ 2 : originX.toInt();
    final mouthCenterY = leftMouth != null && rightMouth != null ? (leftMouth.y + rightMouth.y) ~/ 2 : originY.toInt();
    final mouthCenter = Point<int>(mouthCenterX, mouthCenterY);

    features.add(distanceBetween(noseBase, mouthCenter) / eyeDist);
    features.add(distanceBetween(leftMouth, rightMouth) / eyeDist);
    features.add(distanceBetween(leftCheek, rightCheek) / eyeDist);
    features.add(distanceBetween(noseBase, bottomMouth) / eyeDist);
    features.add(distanceBetween(leftEye, leftCheek) / eyeDist);
    features.add(distanceBetween(rightEye, rightCheek) / eyeDist);
    features.add(distanceBetween(leftEye, noseBase) / eyeDist);
    features.add(distanceBetween(rightEye, noseBase) / eyeDist);

    final embedding = <double>[];
    for (final value in features) {
      embedding.add(value);
      for (int freq = 1; freq <= 2; freq++) {
        embedding.add(sin(value * freq * pi));
        embedding.add(cos(value * freq * pi));
      }
    }

    while (embedding.length < 128) {
      embedding.add(embedding[embedding.length - 24] * 0.5);
    }

    double sumSq = 0.0;
    for (final value in embedding) {
      sumSq += value * value;
    }

    final norm = sqrt(sumSq);
    if (norm > 0) {
      for (int i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / norm;
      }
    }

    return embedding;
  }

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

  Future<Uint8List> preprocessImage(Uint8List rawBytes, {bool grayscale = false}) async {
    final codec = await ui.instantiateImageCodec(rawBytes);
    final frameInfo = await codec.getNextFrame();
    final image = frameInfo.image;

    int targetWidth = image.width;
    int targetHeight = image.height;
    const maxWidth = 512;
    if (targetWidth > maxWidth) {
      targetHeight = (targetHeight * maxWidth) ~/ targetWidth;
      targetWidth = maxWidth;
    }

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final paint = ui.Paint()
      ..isAntiAlias = true
      ..filterQuality = ui.FilterQuality.high;

    if (grayscale) {
      paint.colorFilter = const ui.ColorFilter.matrix([
        0.2126, 0.7152, 0.0722, 0, 0,
        0.2126, 0.7152, 0.0722, 0, 0,
        0.2126, 0.7152, 0.0722, 0, 0,
        0, 0, 0, 1, 0,
      ]);
    }

    canvas.drawRect(
      ui.Rect.fromLTWH(0, 0, targetWidth.toDouble(), targetHeight.toDouble()),
      ui.Paint()..color = const ui.Color(0xFFFFFFFF),
    );

    canvas.drawImageRect(
      image,
      ui.Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      ui.Rect.fromLTWH(0, 0, targetWidth.toDouble(), targetHeight.toDouble()),
      paint,
    );

    final picture = recorder.endRecording();
    final processedImage = await picture.toImage(targetWidth, targetHeight);
    final byteData = await processedImage.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) {
      throw Exception('Canvas rendering failed to compile image byte data.');
    }

    return byteData.buffer.asUint8List();
  }

  void dispose() {
    print('[FaceRecognitionService] dispose called (keeping static detector alive)');
  }
}
