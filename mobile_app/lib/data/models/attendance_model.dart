class AttendanceModel {
  final String? id;
  final String employeeId;
  final String date; // YYYY-MM-DD
  final String? checkIn; // ISO Timestamp
  final String? checkOut; // ISO Timestamp
  final int workDurationSeconds;
  final String status; // PRESENT, ABSENT, HALF_DAY, LATE
  final int overtimeSeconds;
  final String? verifiedByManagerId;
  final String? deviceId;
  final double? gpsLat;
  final double? gpsLng;
  final bool isSynced;

  AttendanceModel({
    this.id,
    required this.employeeId,
    required this.date,
    this.checkIn,
    this.checkOut,
    this.workDurationSeconds = 0,
    required this.status,
    this.overtimeSeconds = 0,
    this.verifiedByManagerId,
    this.deviceId,
    this.gpsLat,
    this.gpsLng,
    this.isSynced = true,
  });

  factory AttendanceModel.fromJson(Map<String, dynamic> json) {
    return AttendanceModel(
      id: json['id'] as String?,
      employeeId: json['employee_id'] as String,
      date: json['date'] as String,
      checkIn: json['check_in'] as String?,
      checkOut: json['check_out'] as String?,
      workDurationSeconds: json['work_duration_seconds'] as int? ?? 0,
      status: json['status'] as String,
      overtimeSeconds: json['overtime_seconds'] as int? ?? 0,
      verifiedByManagerId: json['verified_by_manager_id'] as String?,
      deviceId: json['device_id'] as String?,
      gpsLat: json['gps_lat'] != null ? double.tryParse(json['gps_lat'].toString()) : null,
      gpsLng: json['gps_lng'] != null ? double.tryParse(json['gps_lng'].toString()) : null,
      isSynced: json['is_synced'] == null ? true : (json['is_synced'] == 1 || json['is_synced'] == true),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) 'id': id,
      'employee_id': employeeId,
      'date': date,
      'check_in': checkIn,
      'check_out': checkOut,
      'work_duration_seconds': workDurationSeconds,
      'status': status,
      'overtime_seconds': overtimeSeconds,
      'verified_by_manager_id': verifiedByManagerId,
      'device_id': deviceId,
      'gps_lat': gpsLat,
      'gps_lng': gpsLng,
      'is_synced': isSynced ? 1 : 0,
    };
  }
}
