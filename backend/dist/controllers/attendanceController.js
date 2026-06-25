"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAutoCheckoutScheduler = exports.runStartupSelfHealing = exports.updateAttendanceSettings = exports.getAttendanceSettings = exports.getAttendanceHistory = exports.getDashboardStats = exports.verifyAndRecordAttendance = exports.calculateWorkingHours = exports.getISTDateTime = void 0;
const db_1 = require("../config/db");
const employeeController_1 = require("./employeeController");
const biometricService_1 = require("../services/biometricService");
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
const getISTDateTime = (date) => {
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 5.5));
};
exports.getISTDateTime = getISTDateTime;
const calculateWorkingHours = (checkInStr, checkOutStr) => {
    try {
        if (!checkInStr || !checkOutStr)
            return '0h 0m';
        const [hIn, mIn] = checkInStr.split(':').map(Number);
        const [hOut, mOut] = checkOutStr.split(':').map(Number);
        const inMin = hIn * 60 + mIn;
        const outMin = hOut * 60 + mOut;
        let diff = outMin - inMin;
        if (diff <= 0)
            return '0h 0m';
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        return `${h}h ${m}m`;
    }
    catch (err) {
        console.error('Error calculating working hours:', err);
        return '0h 0m';
    }
};
exports.calculateWorkingHours = calculateWorkingHours;
const writeAuditLog = async (employeeUuid, similarityScore, result, deviceId, ipAddress, livenessStatus, failureReason, nonce) => {
    try {
        await (0, db_1.query)(`INSERT INTO biometric_audit_logs (employee_id, similarity_score, result, device_id, ip_address, liveness_status, failure_reason, nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            employeeUuid,
            similarityScore,
            result,
            deviceId,
            ipAddress,
            livenessStatus ? JSON.stringify(livenessStatus) : null,
            failureReason,
            nonce
        ]);
    }
    catch (err) {
        console.error('[Audit Log Error] Failed to write biometric audit log:', err);
    }
};
const verifyAndRecordAttendance = async (req, res) => {
    const { employee_id, face_embedding, gps_lat, gps_lng, device_id, nonce, timestamp, liveness_metadata } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    // 0. Enforce strict identity matching for employees
    if (req.user && req.user.role === 'EMPLOYEE') {
        if (!employee_id || employee_id !== req.user.employee_id) {
            console.warn(`[Security Alert] Employee ${req.user.employee_id} tried to log attendance for: ${employee_id}`);
            return res.status(403).json({
                success: false,
                message: 'Security Violation: You can only log attendance for your own account.',
            });
        }
    }
    // Find employee first to associate with audit logs if possible
    let employee = null;
    let employeeUuid = null;
    if (employee_id) {
        try {
            const candidates = await biometricService_1.BiometricService.getMatchingCandidates(employee_id);
            if (candidates && candidates.length > 0) {
                employee = candidates[0];
                employeeUuid = employee.id;
            }
        }
        catch (err) {
            console.error('[Biometric Verification] Error fetching candidate:', err);
        }
    }
    // 1. Replay Prevention: Check nonce and timestamp
    if (!nonce) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'MISSING_NONCE', null);
        return res.status(400).json({ success: false, error_code: 'REPLAY_ATTEMPT_DETECTED', message: 'Request nonce is required.' });
    }
    if (!timestamp) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'MISSING_TIMESTAMP', nonce);
        return res.status(400).json({ success: false, error_code: 'REPLAY_ATTEMPT_DETECTED', message: 'Request timestamp is required.' });
    }
    const clientTime = Number(timestamp);
    if (isNaN(clientTime) || Math.abs(Date.now() - clientTime) > 10000) { // 10 seconds boundary
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'TIMESTAMP_OUT_OF_BOUNDS', nonce);
        return res.status(400).json({
            success: false,
            error_code: 'REPLAY_ATTEMPT_DETECTED',
            message: 'Request timestamp is invalid or expired.'
        });
    }
    try {
        const nonceCheck = await (0, db_1.query)('SELECT id FROM biometric_audit_logs WHERE nonce = $1 LIMIT 1', [nonce]);
        if (nonceCheck.rows.length > 0) {
            await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'DUPLICATE_NONCE', nonce);
            return res.status(400).json({
                success: false,
                error_code: 'REPLAY_ATTEMPT_DETECTED',
                message: 'Duplicate request detected (replay prevention).'
            });
        }
    }
    catch (err) {
        console.error('[Biometric Verification] Nonce check error:', err);
    }
    // 2. Liveness Validation Check
    if (!liveness_metadata || liveness_metadata.success !== true) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'LIVENESS_CHECK_FAILED', nonce);
        return res.status(400).json({
            success: false,
            error_code: 'LIVENESS_CHECK_FAILED',
            message: '❌ Liveness validation check failed. Please look at the camera and perform the prompt.'
        });
    }
    // 3. Rate Limiting Check
    try {
        const rateLimitRes = await (0, db_1.query)(`SELECT COUNT(*) FROM biometric_audit_logs 
       WHERE (employee_id = $1 OR device_id = $2) 
         AND result = 'FAILED' 
         AND timestamp >= NOW() - INTERVAL '1 minute'`, [employeeUuid, device_id || null]);
        const failedAttempts = parseInt(rateLimitRes.rows[0].count);
        if (failedAttempts >= 5) {
            await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'RATE_LIMIT_EXCEEDED', nonce);
            return res.status(429).json({
                success: false,
                error_code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many failed attempts. Please wait 1 minute before trying again.'
            });
        }
    }
    catch (err) {
        console.error('[Biometric Verification] Rate limit check error:', err);
    }
    // 4. Face embedding validation
    if (!face_embedding || !Array.isArray(face_embedding) || face_embedding.length !== 128) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'INVALID_EMBEDDING', nonce);
        return res.status(400).json({ success: false, message: 'Invalid or missing face embedding vector.' });
    }
    // 5. Geofence Check
    if (gps_lat === undefined || gps_lng === undefined) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'MISSING_GPS', nonce);
        return res.status(400).json({ success: false, message: 'GPS coordinates are required.' });
    }
    const distance = calculateDistance(gps_lat, gps_lng, FACTORY_LAT, FACTORY_LNG);
    if (distance > GEOFENCE_RADIUS_METERS) {
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'GEOFENCE_VIOLATION', nonce);
        return res.status(403).json({
            success: false,
            message: `Geofence block: You are ${distance.toFixed(0)} meters from the factory. Allowed range is 150m.`,
        });
    }
    try {
        let similarity = 0.0;
        const MATCH_THRESHOLD = Number(process.env.BIOMETRIC_MATCH_THRESHOLD) || 0.82;
        const REJECT_THRESHOLD = Number(process.env.BIOMETRIC_REJECT_THRESHOLD) || 0.70;
        if (employee_id) {
            if (!employee) {
                await writeAuditLog(null, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'EMPLOYEE_NOT_FOUND', nonce);
                return res.status(404).json({
                    success: false,
                    message: '❌ Employee records not found or face profile not enrolled.',
                });
            }
            let storedEmbedding = null;
            if (employee.biometric_enrolled && employee.biometric_embedding) {
                try {
                    const decrypted = (0, employeeController_1.decryptBiometric)(employee.biometric_embedding);
                    storedEmbedding = JSON.parse(decrypted);
                }
                catch (err) {
                    console.error('[Biometric Verification] Failed to decrypt/parse biometric_embedding:', err);
                }
            }
            if (!storedEmbedding) {
                storedEmbedding = employee.face_embedding;
            }
            if (!storedEmbedding || storedEmbedding.length !== 128) {
                await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'INVALID_STORED_EMBEDDING', nonce);
                return res.status(400).json({ success: false, message: 'Invalid stored face profile embedding.' });
            }
            similarity = biometricService_1.BiometricService.calculateSimilarity(face_embedding, storedEmbedding);
        }
        else {
            // 1:N fallback matching if employee_id not provided
            const candidates = await biometricService_1.BiometricService.getMatchingCandidates();
            let bestMatch = null;
            let highestScore = 0.0;
            for (const emp of candidates) {
                let storedEmbedding = null;
                if (emp.biometric_enrolled && emp.biometric_embedding) {
                    try {
                        const decrypted = (0, employeeController_1.decryptBiometric)(emp.biometric_embedding);
                        storedEmbedding = JSON.parse(decrypted);
                    }
                    catch (err) {
                        // ignore
                    }
                }
                if (!storedEmbedding) {
                    storedEmbedding = emp.face_embedding;
                }
                if (storedEmbedding && storedEmbedding.length === 128) {
                    const score = biometricService_1.BiometricService.calculateSimilarity(face_embedding, storedEmbedding);
                    if (score > highestScore) {
                        highestScore = score;
                        bestMatch = emp;
                    }
                }
            }
            employee = bestMatch;
            employeeUuid = employee ? employee.id : null;
            similarity = highestScore;
        }
        // Check reject threshold
        if (!employee || similarity < REJECT_THRESHOLD) {
            console.warn(`[Attendance Gateway] Face verification failed: Match confidence ${(similarity * 100).toFixed(1)}% is below reject threshold ${(REJECT_THRESHOLD * 100).toFixed(1)}%`);
            await writeAuditLog(employeeUuid, similarity, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'BIOMETRIC_VERIFICATION_FAILED', nonce);
            return res.status(401).json({
                success: false,
                error_code: 'BIOMETRIC_VERIFICATION_FAILED',
                message: '❌ Face does not match employee records.\nPlease try again with the correct person.',
                confidence: Math.round(similarity * 100),
            });
        }
        // Check match threshold (retry state)
        if (similarity < MATCH_THRESHOLD) {
            console.warn(`[Attendance Gateway] Face verification warning: Match confidence ${(similarity * 100).toFixed(1)}% is below match threshold ${(MATCH_THRESHOLD * 100).toFixed(1)}%`);
            await writeAuditLog(employeeUuid, similarity, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'BIOMETRIC_RETRY_REQUIRED', nonce);
            return res.status(400).json({
                success: false,
                error_code: 'BIOMETRIC_RETRY_REQUIRED',
                message: '❌ Face match confidence is low. Please adjust lighting and retry.',
                confidence: Math.round(similarity * 100),
            });
        }
        // Biometric replay / exact match protection (indicator of spoofing/replay)
        if (similarity > 0.999) {
            console.warn(`[Security Alert] Biometric replay detected for employee: ${employee.full_name} (${employee.employee_id}). Similarity: ${similarity}`);
            await writeAuditLog(employeeUuid, similarity, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'SPOOF_ATTEMPT_DETECTED', nonce);
            return res.status(400).json({
                success: false,
                error_code: 'SPOOF_ATTEMPT_DETECTED',
                message: '❌ Biometric spoof/replay attempt detected. Attendance not marked.',
            });
        }
        const now = new Date();
        const istDate = (0, exports.getISTDateTime)(now);
        // YYYY-MM-DD in IST
        const yyyy = istDate.getFullYear();
        const mm = (istDate.getMonth() + 1).toString().padStart(2, '0');
        const dd = istDate.getDate().toString().padStart(2, '0');
        const today = `${yyyy}-${mm}-${dd}`;
        // HH:MM:SS in IST
        const hh = istDate.getHours().toString().padStart(2, '0');
        const min = istDate.getMinutes().toString().padStart(2, '0');
        const ss = istDate.getSeconds().toString().padStart(2, '0');
        const timeString = `${hh}:${min}:${ss}`;
        // Check duplicate check-in
        const duplicateCheck = await (0, db_1.query)('SELECT id, check_in_time, check_out FROM attendance_records WHERE employee_id = $1 AND date = $2 LIMIT 1', [employee.id, today]);
        if (duplicateCheck.rows.length > 0) {
            const record = duplicateCheck.rows[0];
            const prevCheckin = record.check_in_time;
            const prevCheckout = record.check_out;
            if (prevCheckout) {
                // Attendance already completed today.
                console.warn(`[Attendance Gateway] Blocked checkout scan: ${employee.full_name} (${employee.employee_id}) already completed shift for date ${today}.`);
                await writeAuditLog(employeeUuid, similarity, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'ATTENDANCE_COMPLETED', nonce);
                return res.status(409).json({
                    success: false,
                    error_code: "ATTENDANCE_COMPLETED",
                    message: "Attendance already completed for today."
                });
            }
            // If check_out is null, we perform early checkout override
            const checkoutTime = new Date(); // Standard Date object (UTC for database serialization)
            const checkoutIstDate = (0, exports.getISTDateTime)(checkoutTime);
            const hhOut = checkoutIstDate.getHours().toString().padStart(2, '0');
            const minOut = checkoutIstDate.getMinutes().toString().padStart(2, '0');
            const ssOut = checkoutIstDate.getSeconds().toString().padStart(2, '0');
            const checkoutTimeString = `${hhOut}:${minOut}:${ssOut}`;
            // Enforce 5-minute cooldown between check-in and checkout to prevent duplicate scans
            const [hIn, mIn, sIn] = prevCheckin.split(':').map(Number);
            const [hOutVal, mOutVal, sOutVal] = checkoutTimeString.split(':').map(Number);
            const inTotalSeconds = hIn * 3600 + mIn * 60 + (sIn || 0);
            const outTotalSeconds = hOutVal * 3600 + mOutVal * 60 + (sOutVal || 0);
            const diffSeconds = outTotalSeconds - inTotalSeconds;
            if (diffSeconds < 300) {
                console.warn(`[Attendance Gateway] Blocked checkout scan: ${employee.full_name} (${employee.employee_id}) scanned again within 5 minutes (diff: ${diffSeconds}s).`);
                await writeAuditLog(employeeUuid, similarity, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'DUPLICATE_SCAN', nonce);
                return res.status(429).json({
                    success: false,
                    error_code: 'DUPLICATE_SCAN',
                    message: 'Duplicate scan detected. Please wait 5 minutes before checking out.',
                });
            }
            const workingHours = (0, exports.calculateWorkingHours)(prevCheckin, checkoutTimeString);
            await (0, db_1.query)(`UPDATE attendance_records 
         SET check_out = $1, checkout_type = $2, working_hours = $3
         WHERE id = $4`, [checkoutTime, 'MANUAL_CHECKOUT', workingHours, record.id]);
            console.log(`[Attendance Gateway] Success: ${employee.full_name} (${employee.employee_id}) early checkout recorded. Working hours: ${workingHours}`);
            await writeAuditLog(employeeUuid, similarity, 'SUCCESS', device_id || null, ipAddress, liveness_metadata, null, nonce);
            return res.status(200).json({
                success: true,
                message: `👋 Early checkout recorded successfully.`,
                employee: {
                    employee_id: employee.employee_id,
                    full_name: employee.full_name
                },
                checkout: {
                    check_out: checkoutTime.toISOString(),
                    checkout_type: 'MANUAL_CHECKOUT',
                    working_hours: workingHours
                }
            });
        }
        // Load dynamic shift settings
        const settingsRes = await (0, db_1.query)('SELECT * FROM attendance_settings LIMIT 1');
        let shiftStartHour = SHIFT_START_HOUR;
        let shiftStartMinute = SHIFT_START_MINUTE;
        let gracePeriodMinutes = GRACE_PERIOD_MINUTES;
        if (settingsRes.rows.length > 0) {
            const settings = settingsRes.rows[0];
            if (settings.checkin_start) {
                const parts = settings.checkin_start.split(':');
                shiftStartHour = parseInt(parts[0]);
                shiftStartMinute = parseInt(parts[1]);
            }
            gracePeriodMinutes = settings.grace_minutes ?? 15;
        }
        // 3. Late Arrival Check
        let status = 'PRESENT';
        const shiftStart = new Date(istDate);
        shiftStart.setHours(shiftStartHour, shiftStartMinute, 0, 0);
        const graceLimit = new Date(shiftStart.getTime() + gracePeriodMinutes * 60 * 1000);
        if (istDate > graceLimit) {
            status = 'LATE';
        }
        await (0, db_1.query)(`INSERT INTO attendance_records (employee_id, date, check_in_time, gps_lat, gps_lng, device_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [employee.id, today, timeString, gps_lat, gps_lng, device_id || null, status]);
        console.log(`[Attendance Gateway] Success: ${employee.full_name} (${employee.employee_id}) checked in. Confidence: ${(similarity * 100).toFixed(1)}%, Status: ${status}, GPS: [${gps_lat}, ${gps_lng}]`);
        await writeAuditLog(employeeUuid, similarity, 'SUCCESS', device_id || null, ipAddress, liveness_metadata, null, nonce);
        return res.status(200).json({
            success: true,
            message: `✅ Check-in marked successfully.\nHave a productive day!`,
            match: {
                employee_id: employee.employee_id,
                full_name: employee.full_name,
                confidence: Math.round(similarity * 100),
            },
        });
    }
    catch (error) {
        console.error('[Attendance Gateway Error] Verification failed:', error);
        await writeAuditLog(employeeUuid, null, 'FAILED', device_id || null, ipAddress, liveness_metadata, 'INTERNAL_SERVER_ERROR', nonce);
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
        const feedRes = await (0, db_1.query)(`SELECT a.check_in_time, a.check_out, a.checkout_type, a.working_hours, a.status, e.full_name, e.employee_id, e.department
       FROM attendance_records a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = $1
       ORDER BY a.created_at DESC
       LIMIT 10`, [today]);
        console.log(`[Console Sync] Successfully aggregated dashboard statistics for date: ${today}`);
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
        console.error('[Console Sync Error] Dashboard stats aggregation failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getDashboardStats = getDashboardStats;
// Fetch attendance logs history
const getAttendanceHistory = async (req, res) => {
    try {
        let result;
        if (req.user && req.user.role === 'EMPLOYEE') {
            result = await (0, db_1.query)(`SELECT a.date, a.check_in_time, a.check_out, a.checkout_type, a.working_hours, a.status, a.gps_lat, a.gps_lng, a.device_id,
                e.full_name, e.employee_id, e.department, e.shift
         FROM attendance_records a
         JOIN employees e ON a.employee_id = e.id
         WHERE e.id = $1
         ORDER BY a.date DESC, a.check_in_time DESC`, [req.user.id]);
            console.log(`[Console Sync] Fetched personal attendance logs history for employee ID ${req.user.employee_id}. Total records: ${result.rows.length}`);
        }
        else {
            result = await (0, db_1.query)(`SELECT a.date, a.check_in_time, a.check_out, a.checkout_type, a.working_hours, a.status, a.gps_lat, a.gps_lng, a.device_id,
                e.full_name, e.employee_id, e.department, e.shift
         FROM attendance_records a
         JOIN employees e ON a.employee_id = e.id
         ORDER BY a.date DESC, a.check_in_time DESC`);
            console.log(`[Console Sync] Fetched all attendance logs history. Total records: ${result.rows.length}`);
        }
        return res.status(200).json({
            success: true,
            logs: result.rows,
        });
    }
    catch (error) {
        console.error('[Console Sync Error] Fetch history failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};
exports.getAttendanceHistory = getAttendanceHistory;
// GET dynamic attendance settings
const getAttendanceSettings = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT * FROM attendance_settings LIMIT 1');
        if (result.rows.length === 0) {
            await (0, db_1.query)(`
        INSERT INTO attendance_settings (shift_name, checkin_start, late_after, checkout_time, grace_minutes)
        VALUES ('Morning Shift', '09:00:00', '09:15:00', '17:00:00', 15)
      `);
            const retryResult = await (0, db_1.query)('SELECT * FROM attendance_settings LIMIT 1');
            return res.status(200).json({
                success: true,
                settings: retryResult.rows[0]
            });
        }
        return res.status(200).json({
            success: true,
            settings: result.rows[0],
        });
    }
    catch (error) {
        console.error('[Settings API Error] Get settings failed, attempting self-healing table check:', error);
        try {
            await (0, db_1.query)(`
        CREATE TABLE IF NOT EXISTS attendance_settings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          shift_name VARCHAR(100) DEFAULT 'Morning Shift',
          checkin_start TIME DEFAULT '09:00:00',
          late_after TIME DEFAULT '09:15:00',
          checkout_time TIME DEFAULT '17:00:00',
          grace_minutes INTEGER DEFAULT 15,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
            await (0, db_1.query)(`
        INSERT INTO attendance_settings (shift_name, checkin_start, late_after, checkout_time, grace_minutes)
        VALUES ('Morning Shift', '09:00:00', '09:15:00', '17:00:00', 15)
        ON CONFLICT DO NOTHING
      `);
            const fallbackResult = await (0, db_1.query)('SELECT * FROM attendance_settings LIMIT 1');
            return res.status(200).json({
                success: true,
                settings: fallbackResult.rows[0]
            });
        }
        catch (dbError) {
            console.error('[Settings API Self-Healing Error] Table creation/seeding failed, using memory defaults:', dbError);
            // Fallback: return default settings from memory if database is down
            const memoryFallback = {
                shift_name: 'Morning Shift (Default Fallback)',
                checkin_start: '09:00:00',
                late_after: '09:15:00',
                checkout_time: '17:00:00',
                grace_minutes: 15,
            };
            return res.status(200).json({
                success: true,
                settings: memoryFallback,
                warning: 'Database is currently offline. Loaded default configurations from cache.'
            });
        }
    }
};
exports.getAttendanceSettings = getAttendanceSettings;
// PUT dynamic attendance settings
const updateAttendanceSettings = async (req, res) => {
    const { shift_name, checkin_start, late_after, checkout_time, grace_minutes } = req.body;
    // Validation checks
    if (!shift_name || typeof shift_name !== 'string' || !shift_name.trim()) {
        return res.status(400).json({ success: false, message: 'Invalid shift name. It cannot be empty.' });
    }
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!checkin_start || !timeRegex.test(checkin_start)) {
        return res.status(400).json({ success: false, message: 'Invalid check-in start time. Must be HH:MM or HH:MM:SS.' });
    }
    if (!late_after || !timeRegex.test(late_after)) {
        return res.status(400).json({ success: false, message: 'Invalid late marking time. Must be HH:MM or HH:MM:SS.' });
    }
    if (!checkout_time || !timeRegex.test(checkout_time)) {
        return res.status(400).json({ success: false, message: 'Invalid check-out time. Must be HH:MM or HH:MM:SS.' });
    }
    if (grace_minutes === undefined || grace_minutes === null || isNaN(Number(grace_minutes)) || Number(grace_minutes) < 0) {
        return res.status(400).json({ success: false, message: 'Grace period must be a non-negative number.' });
    }
    try {
        const checkSettings = await (0, db_1.query)('SELECT id FROM attendance_settings LIMIT 1');
        if (checkSettings.rows.length === 0) {
            await (0, db_1.query)(`INSERT INTO attendance_settings (shift_name, checkin_start, late_after, checkout_time, grace_minutes)
         VALUES ($1, $2, $3, $4, $5)`, [shift_name.trim(), checkin_start, late_after, checkout_time, Number(grace_minutes)]);
        }
        else {
            const id = checkSettings.rows[0].id;
            await (0, db_1.query)(`UPDATE attendance_settings 
         SET shift_name = $1, checkin_start = $2, late_after = $3, checkout_time = $4, grace_minutes = $5, updated_at = NOW()
         WHERE id = $6`, [shift_name.trim(), checkin_start, late_after, checkout_time, Number(grace_minutes), id]);
        }
        console.log(`[Console Sync] Attendance settings updated successfully: ${shift_name} (${checkin_start} - ${checkout_time})`);
        return res.status(200).json({
            success: true,
            message: 'Attendance settings updated successfully.',
        });
    }
    catch (error) {
        console.error('[Settings API Error] Update settings failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update settings in the database. Please try again.',
            error: error.message
        });
    }
};
exports.updateAttendanceSettings = updateAttendanceSettings;
const runStartupSelfHealing = async () => {
    try {
        const now = new Date();
        const istDateNow = (0, exports.getISTDateTime)(now);
        const today = `${istDateNow.getFullYear()}-${(istDateNow.getMonth() + 1).toString().padStart(2, '0')}-${istDateNow.getDate().toString().padStart(2, '0')}`;
        console.log('[Auto Checkout Self-Healing] Scanning for incomplete past attendance records...');
        // Find all attendance records from past dates where check_out is NULL
        const openRecords = await (0, db_1.query)(`SELECT id, date, check_in_time FROM attendance_records 
       WHERE date < $1 AND check_out IS NULL`, [today]);
        if (openRecords.rows.length === 0) {
            console.log('[Auto Checkout Self-Healing] No incomplete past records found.');
            return;
        }
        console.log(`[Auto Checkout Self-Healing] Found ${openRecords.rows.length} open records from past dates. Closing them...`);
        for (const record of openRecords.rows) {
            let year, month, day;
            if (record.date instanceof Date) {
                year = record.date.getFullYear();
                month = record.date.getMonth();
                day = record.date.getDate();
            }
            else {
                const parts = record.date.split('-');
                year = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                day = parseInt(parts[2]);
            }
            // 5:00 PM IST is 11:30 AM UTC on that day
            const checkoutTime = new Date(Date.UTC(year, month, day, 11, 30, 0, 0));
            const workingHours = (0, exports.calculateWorkingHours)(record.check_in_time, '17:00:00');
            await (0, db_1.query)(`UPDATE attendance_records 
         SET check_out = $1, checkout_type = $2, working_hours = $3 
         WHERE id = $4`, [checkoutTime, 'AUTO_CHECKOUT', workingHours, record.id]);
        }
        console.log(`[Auto Checkout Self-Healing] Successfully closed ${openRecords.rows.length} past records.`);
    }
    catch (error) {
        console.error('[Auto Checkout Self-Healing Error] Failed to heal past records:', error);
    }
};
exports.runStartupSelfHealing = runStartupSelfHealing;
const startAutoCheckoutScheduler = () => {
    console.log('[Auto Checkout Scheduler] Initializing daily 5:00 PM auto-checkout process...');
    const scheduleNextRun = () => {
        const now = new Date();
        const istNow = (0, exports.getISTDateTime)(now);
        // Target 5:00 PM IST today
        const istTarget = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate(), 17, 0, 0, 0);
        if (istNow >= istTarget) {
            istTarget.setDate(istTarget.getDate() + 1);
        }
        const delay = istTarget.getTime() - istNow.getTime();
        const targetDisplay = new Date(now.getTime() + delay);
        console.log(`[Auto Checkout Scheduler] Next auto-checkout run scheduled in ${Math.round(delay / 1000 / 60)} minutes (at ${targetDisplay.toLocaleString()})`);
        setTimeout(async () => {
            await runDailyAutoCheckout();
            scheduleNextRun();
        }, delay);
    };
    scheduleNextRun();
};
exports.startAutoCheckoutScheduler = startAutoCheckoutScheduler;
const runDailyAutoCheckout = async () => {
    try {
        const now = new Date();
        const istNow = (0, exports.getISTDateTime)(now);
        const today = `${istNow.getFullYear()}-${(istNow.getMonth() + 1).toString().padStart(2, '0')}-${istNow.getDate().toString().padStart(2, '0')}`;
        console.log(`[Auto Checkout Scheduler] Running EOD auto-checkout for date: ${today}`);
        // Find all attendance records for today where check_out is NULL
        const openRecords = await (0, db_1.query)(`SELECT id, date, check_in_time FROM attendance_records 
       WHERE date = $1 AND check_out IS NULL`, [today]);
        if (openRecords.rows.length === 0) {
            console.log('[Auto Checkout Scheduler] No open records for today.');
            return;
        }
        console.log(`[Auto Checkout Scheduler] Found ${openRecords.rows.length} open records today. Automatically checking out...`);
        const year = istNow.getFullYear();
        const month = istNow.getMonth();
        const day = istNow.getDate();
        // 5:00 PM IST is 11:30 AM UTC on that day
        const checkoutTime = new Date(Date.UTC(year, month, day, 11, 30, 0, 0));
        for (const record of openRecords.rows) {
            const workingHours = (0, exports.calculateWorkingHours)(record.check_in_time, '17:00:00');
            await (0, db_1.query)(`UPDATE attendance_records 
         SET check_out = $1, checkout_type = $2, working_hours = $3 
         WHERE id = $4`, [checkoutTime, 'AUTO_CHECKOUT', workingHours, record.id]);
        }
        console.log(`[Auto Checkout Scheduler] Successfully auto-checked out ${openRecords.rows.length} employees.`);
    }
    catch (error) {
        console.error('[Auto Checkout Scheduler Error] Daily auto-checkout failed:', error);
    }
};
