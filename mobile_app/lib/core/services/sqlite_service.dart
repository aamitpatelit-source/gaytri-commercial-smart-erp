import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../../data/models/employee_model.dart';
import '../../data/models/attendance_model.dart';

class SqliteService {
  static Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'gaytri_commercial.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        // Create Cached Employees table
        await db.execute('''
          CREATE TABLE employees (
            id TEXT PRIMARY KEY,
            employee_id TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            department TEXT NOT NULL,
            shift TEXT NOT NULL,
            mobile TEXT NOT NULL,
            profile_photo_url TEXT
          )
        ''');

        // Create Offline Attendance Logs table
        await db.execute('''
          CREATE TABLE attendance (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL,
            date TEXT NOT NULL,
            check_in TEXT,
            check_out TEXT,
            work_duration_seconds INTEGER,
            status TEXT NOT NULL,
            overtime_seconds INTEGER,
            verified_by_manager_id TEXT,
            device_id TEXT,
            gps_lat REAL,
            gps_lng REAL,
            is_synced INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees (id)
          )
        ''');
      },
    );
  }

  // --- EMPLOYEE CACHE METHODS ---
  Future<void> cacheEmployees(List<EmployeeModel> employees) async {
    final db = await database;
    final batch = db.batch();

    for (var emp in employees) {
      final jsonMap = emp.toJson();
      batch.insert('employees', jsonMap, conflictAlgorithm: ConflictAlgorithm.replace);
    }

    await batch.commit(noResult: true);
  }

  Future<List<EmployeeModel>> getCachedEmployees() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query('employees');

    return List.generate(maps.length, (i) {
      final item = Map<String, dynamic>.from(maps[i]);
      return EmployeeModel.fromJson(item);
    });
  }

  // --- OFFLINE ATTENDANCE METHODS ---
  Future<void> saveAttendanceLog(AttendanceModel log) async {
    final db = await database;
    await db.insert(
      'attendance',
      log.toJson(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<AttendanceModel>> getUnsyncedLogs() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query('attendance', where: 'is_synced = 0');

    return List.generate(maps.length, (i) {
      return AttendanceModel.fromJson(maps[i]);
    });
  }

  Future<void> markLogsAsSynced(List<String> logIds) async {
    final db = await database;
    await db.update(
      'attendance',
      {'is_synced': 1},
      where: 'id IN (${logIds.map((_) => '?').join(', ')})',
      whereArgs: logIds,
    );
  }
}
