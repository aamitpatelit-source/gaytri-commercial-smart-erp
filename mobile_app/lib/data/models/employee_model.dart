class EmployeeModel {
  final String id;
  final String employeeId;
  final String fullName;
  final String department;
  final String shift;
  final String mobile;
  final List<double>? faceEmbedding;
  final String? profilePhotoUrl;

  EmployeeModel({
    required this.id,
    required this.employeeId,
    required this.fullName,
    required this.department,
    required this.shift,
    required this.mobile,
    this.faceEmbedding,
    this.profilePhotoUrl,
  });

  factory EmployeeModel.fromJson(Map<String, dynamic> json) {
    return EmployeeModel(
      id: json['id'] as String,
      employeeId: json['employee_id'] as String,
      fullName: json['full_name'] as String,
      department: json['department'] as String? ?? 'Production',
      shift: json['shift'] as String? ?? 'Morning Shift',
      mobile: json['mobile'] as String? ?? '',
      faceEmbedding: json['face_embedding'] != null
          ? List<double>.from((json['face_embedding'] as List).map((x) => double.parse(x.toString())))
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
      'face_embedding': faceEmbedding,
      'profile_photo_url': profilePhotoUrl,
    };
  }
}
