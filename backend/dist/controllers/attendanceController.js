"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceHistory = exports.getDashboardStats = exports.verifyAndRecordAttendance = void 0;
const db_1 = require("../config/db");
const FACTORY_LAT = 23.0225;
const FACTORY_LNG = 72.5714;
const GEOFENCE_RADIUS_METERS = 150.0;
const SHIFT_START_HOUR = 9;
const SHIFT_START_MINUTE = 0;
const GRACE_PERIOD_MINUTES = 15;
// Calculate distance using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
// Cosine similarity matching
const calculateSimilarity = (vecA, vecB) => {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < 128; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0)
        return 0.0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};
const verifyAndRecordAttendance = async (req, res) => {
    const { face_embedding, gps_lat, gps_lng, device_id } = req.body;
    if (!face_embedding || !Array.isArray(face_embedding) || face_embedding.length !== 128) {
        return res.status(400).json({ success: false, message: 'Invalid or missing face embedding vector.' });
    }
    // 1. Geofence Check
    if (gps_lat === undefined || gps_lng === undefined) {
        return res.status(400).json({ success: false, message: 'GPS coordinates are required.' });
    }
    const distance = calculateDistance(gps_lat, gps_lng, FACTORY_LAT, FACTORY_LNG);
    if (distance > GEOFENCE_RADIUS_METERS) {
        return res.status(403).json({
            success: false,
            message: `Geofence block: You are ${distance.toFixed(0)} meters from the factory. Allowed range is 150m.`,
        });
    }
    try {
        // 2. Fetch registered face embeddings
        const result = await (0, db_1.query)('SELECT id, employee_id, full_name, face_embedding FROM employees WHERE face_embedding IS NOT NULL');
        let bestMatch = null;
        let highestScore = 0.0;
        const MATCH_THRESHOLD = 0.82;
        for (const employee of result.rows) {
            const score = calculateSimilarity(face_embedding, employee.face_embedding);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = employee;
            }
        }
        if (!bestMatch || highestScore < MATCH_THRESHOLD) {
            return res.status(401).json({
                success: false,
                message: 'Face match failed. Employee not recognized.',
                highestScore,
            });
        }
        const employee = bestMatch;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const timeString = now.toTimeString().split(' ')[0]; // HH:MM:SS
        // Check duplicate check-in
        const duplicateCheck = await (0, db_1.query)('SELECT id FROM attendance_records WHERE employee_id = $1 AND date = $2', [employee.id, today]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `${employee.full_name} has already logged attendance today.`,
            });
        }
        // 3. Late Arrival Check (Standard start: 09:00:00, Grace: 15 mins)
        let status = 'PRESENT';
        const shiftStart = new Date();
        shiftStart.setHours(SHIFT_START_HOUR, SHIFT_START_MINUTE, 0, 0);
        const graceLimit = new Date(shiftStart.getTime() + GRACE_PERIOD_MINUTES * 60 * 1000);
        if (now > graceLimit) {
            status = 'LATE';
        }
        await (0, db_1.query)(`INSERT INTO attendance_records (employee_id, date, check_in_time, gps_lat, gps_lng, device_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [employee.id, today, timeString, gps_lat, gps_lng, device_id || null, status]);
        return res.status(200).json({
            success: true,
            message: `${employee.full_name} verified successfully. Status: ${status}`,
            match: {
                employee_id: employee.employee_id,
                full_name: employee.full_name,
                confidence: highestScore,
            },
        });
    }
    catch (error) {
        console.error('Attendance match error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.verifyAndRecordAttendance = verifyAndRecordAttendance;
// Retrieve dashboard statistics for today
const getDashboardStats = async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const totalEmpRes = await (0, db_1.query)('SELECT COUNT(*) as count FROM employees');
        const totalStaff = parseInt(totalEmpRes.rows[0].count);
        const attendanceRes = await (0, db_1.query)(`SELECT status, COUNT(*) as count 
       FROM attendance_records 
       WHERE date = $1 
       GROUP BY status`, [today]);
        let present = 0;
        let late = 0;
        let absent = 0;
        attendanceRes.rows.forEach((row) => {
            if (row.status === 'PRESENT')
                present += parseInt(row.count);
            if (row.status === 'LATE') {
                present += parseInt(row.count);
                late += parseInt(row.count);
            }
            if (row.status === 'ABSENT')
                absent += parseInt(row.count);
        });
        const autoAbsent = Math.max(0, totalStaff - present - absent);
        absent += autoAbsent;
        // Recent Scans Feed
        const feedRes = await (0, db_1.query)(`SELECT a.check_in_time, a.status, e.full_name, e.employee_id, e.department
       FROM attendance_records a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = $1
       ORDER BY a.created_at DESC
       LIMIT 10`, [today]);
        return res.status(200).json({
            success: true,
            stats: {
                totalStaff,
                present,
                absent,
                late,
            },
            feed: feedRes.rows,
        });
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getDashboardStats = getDashboardStats;
// Fetch attendance logs history
const getAttendanceHistory = async (req, res) => {
    try {
        const result = await (0, db_1.query)(`SELECT a.date, a.check_in_time, a.status, a.gps_lat, a.gps_lng, a.device_id,
              e.full_name, e.employee_id, e.department, e.shift
       FROM attendance_records a
       JOIN employees e ON a.employee_id = e.id
       ORDER BY a.date DESC, a.check_in_time DESC`);
        return res.status(200).json({
            success: true,
            logs: result.rows,
        });
    }
    catch (error) {
        console.error('Fetch history error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getAttendanceHistory = getAttendanceHistory;
