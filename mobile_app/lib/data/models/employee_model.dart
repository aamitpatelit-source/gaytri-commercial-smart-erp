class EmployeeModel {
  final String id;
  final String employeeId;
  final String fullName;
  final String department;
  final String shift;
  final String mobile;
  final List<double>? biometricEmbedding;
  final bool biometricEnrolled;
  final String? profilePhotoUrl;

  EmployeeModel({
    required this.id,
    required this.employeeId,
    required this.fullName,
    required this.department,
    required this.shift,
    required this.mobile,
    this.biometricEmbedding,
    required this.biometricEnrolled,
    this.profilePhotoUrl,
  });

  factory EmployeeModel.fromJson(Map<String, dynamic> json) {
    final hasBiometricEmbedding = json['biometric_embedding'] != null;
    final List<dynamic>? embeddingList = hasBiometricEmbedding 
        ? json['biometric_embedding'] as List<dynamic>?
        : json['face_embedding'] as List<dynamic>?;
        
    final enrolled = json['biometric_enrolled'] as bool? ?? (embeddingList != null && embeddingList.isNotEmpty);

    return EmployeeModel(
      id: json['id'] as String,
      employeeId: json['employee_id'] as String,
      fullName: json['full_name'] as String,
      department: json['department'] as String? ?? 'Production',
      shift: json['shift'] as String? ?? 'Morning Shift',
      mobile: json['mobile'] as String? ?? '',
      biometricEnrolled: enrolled,
      biometricEmbedding: embeddingList != null
          ? List<double>.from(embeddingList.map((x) => double.parse(x.toString())))
          : null,
      profilePhotoUrl: json['profile_photo_url'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'employee_id': employeeId,
      'full_name': fullName,
      'department': department,
      'shift': shift,
      'mobile': mobile,
      'biometric_enrolled': biometricEnrolled,
      'biometric_embedding': biometricEmbedding,
      'face_embedding': biometricEmbedding,
      'profile_photo_url': profilePhotoUrl,
    };
  }
}
