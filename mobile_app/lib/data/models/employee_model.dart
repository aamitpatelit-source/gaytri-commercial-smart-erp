class EmployeeModel {
  final String id;
  final String employeeId;
  final String fullName;
  final String department;
  final String shift;
  final String mobile;
  final String? profilePhotoUrl;

  EmployeeModel({
    required this.id,
    required this.employeeId,
    required this.fullName,
    required this.department,
    required this.shift,
    required this.mobile,
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
      'profile_photo_url': profilePhotoUrl,
    };
  }

  EmployeeModel copyWith({
    String? id,
    String? employeeId,
    String? fullName,
    String? department,
    String? shift,
    String? mobile,
    String? profilePhotoUrl,
  }) {
    return EmployeeModel(
      id: id ?? this.id,
      employeeId: employeeId ?? this.employeeId,
      fullName: fullName ?? this.fullName,
      department: department ?? this.department,
      shift: shift ?? this.shift,
      mobile: mobile ?? this.mobile,
      profilePhotoUrl: profilePhotoUrl ?? this.profilePhotoUrl,
    );
  }
}
