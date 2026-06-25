"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectReEnrollment = exports.approveReEnrollment = exports.requestReEnrollment = exports.deleteEmployee = exports.registerFace = exports.updateEmployee = exports.createEmployee = exports.getEmployees = exports.enrollBiometric = exports.decryptBiometric = exports.encryptBiometric = void 0;
const db_1 = require("../config/db");
const crypto_1 = __importDefault(require("crypto"));
const ENCRYPTION_KEY = process.env.BIOMETRIC_ENCRYPTION_KEY || 'gaytri_biometric_secure_key_2026_!';
const hashKey = crypto_1.default.createHash('sha256').update(ENCRYPTION_KEY).digest();
const encryptBiometric = (text) => {
    const iv = crypto_1.default.randomBytes(12); // GCM standard IV is 12 bytes
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', hashKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};
exports.encryptBiometric = encryptBiometric;
const decryptBiometric = (encryptedText) => {
    if (!encryptedText)
        return '';
    const parts = encryptedText.split(':');
    // GCM Decryption (3 parts: iv:authTag:ciphertext)
    if (parts.length === 3) {
        try {
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = Buffer.from(parts[2], 'hex');
            const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', hashKey, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, undefined, 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (err) {
            console.error('GCM Decryption failed, attempting CBC fallback:', err);
        }
    }
    // Legacy CBC Decryption fallback (2 parts: iv:ciphertext)
    if (parts.length === 2) {
        try {
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = Buffer.from(parts[1], 'hex');
            const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', hashKey, iv);
            let decrypted = decipher.update(encrypted, undefined, 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (err) {
            console.error('CBC Decryption failed, returning plaintext:', err);
            return encryptedText;
        }
    }
    return encryptedText; // Plaintext fallback
};
exports.decryptBiometric = decryptBiometric;
const validateBiometricEmbedding = (embedding) => {
    if (!embedding || !Array.isArray(embedding) || embedding.length !== 128) {
        throw new Error('A 128-dimensional face embedding array is required.');
    }
    const numericVector = [];
    let sumSq = 0.0;
    for (let i = 0; i < 128; i++) {
        const val = Number(embedding[i]);
        if (isNaN(val) || !isFinite(val)) {
            throw new Error('Embedding contains NaN or infinite values.');
        }
        numericVector.push(val);
        sumSq += val * val;
    }
    const magnitude = Math.sqrt(sumSq);
    if (Math.abs(magnitude - 1.0) > 0.05) {
        throw new Error('Embedding vector is not L2 normalized.');
    }
    return numericVector;
};
const enrollBiometric = async (req, res) => {
    const { employee_id, embedding } = req.body;
    if (!employee_id) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    try {
        const empCheck = await (0, db_1.query)('SELECT id, employee_id, full_name FROM employees WHERE id::text = $1 OR employee_id = $1', [employee_id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = empCheck.rows[0];
        let numericVector;
        try {
            numericVector = validateBiometricEmbedding(embedding);
        }
        catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        const serialized = JSON.stringify(numericVector);
        const encrypted = (0, exports.encryptBiometric)(serialized);
        await (0, db_1.query)(`UPDATE employees 
       SET biometric_embedding = $1, 
           biometric_enrolled = TRUE, 
           biometric_enrolled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`, [encrypted, employee.id]);
        console.log(`[Biometric Sync] Successfully enrolled direct embedding for employee: ${employee.full_name} (${employee.employee_id})`);
        return res.status(200).json({
            success: true,
            message: 'Biometric embedding enrolled successfully.',
            employee: {
                id: employee.id,
                employee_id: employee.employee_id,
                full_name: employee.full_name,
            }
        });
    }
    catch (error) {
        console.error('[Biometric Sync Error] Enroll biometric failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.enrollBiometric = enrollBiometric;
const sanitizeAndValidateBase64Image = (base64Str) => {
    if (!base64Str || typeof base64Str !== 'string')
        return null;
    const trimmed = base64Str.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed; // Allow external placeholder URLs
    }
    // Strip spaces, newlines, tabs
    let cleaned = trimmed.replace(/\s/g, '');
    let mimeType = 'image/jpeg';
    let base64Data = cleaned;
    // Match data URI prefix if present
    const dataUriMatch = cleaned.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        base64Data = dataUriMatch[2];
    }
    // Validate standard base64 characters
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Regex.test(base64Data)) {
        throw new Error('Invalid Base64 encoding for profile photo.');
    }
    // Try to decode to check if it's a valid Base64 string
    let buffer;
    try {
        buffer = Buffer.from(base64Data, 'base64');
    }
    catch (err) {
        throw new Error('Invalid Base64 encoding for profile photo.');
    }
    if (buffer.length === 0) {
        throw new Error('Profile photo binary is empty.');
    }
    // Enforce size limits (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Profile photo exceeds the 5MB size limit.');
    }
    // Validate magic numbers to ensure it is a valid JPEG or PNG file
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (!isJpeg && !isPng) {
        throw new Error('Unsupported profile photo format. Only JPEG and PNG formats are accepted.');
    }
    const finalMimeType = isJpeg ? 'image/jpeg' : 'image/png';
    return `data:${finalMimeType};base64,${base64Data}`;
};
// Get all employees (for directory view)
const getEmployees = async (req, res) => {
    try {
        const result = await (0, db_1.query)(`SELECT id, employee_id, full_name, department, shift, mobile, profile_photo_url,
              is_active,
              face_embedding,
              biometric_embedding,
              biometric_enrolled,
              biometric_enrolled_at
       FROM employees
       ORDER BY employee_id ASC`);
        const mappedEmployees = result.rows.map(row => {
            let parsedEmbedding = null;
            if (row.biometric_embedding) {
                try {
                    const parts = row.biometric_embedding.split(':');
                    const decrypted = (0, exports.decryptBiometric)(row.biometric_embedding);
                    parsedEmbedding = JSON.parse(decrypted);
                    // On-the-fly migration from legacy CBC (2 parts) to AES-256-GCM
                    if (parts.length === 2 && decrypted) {
                        const reEncrypted = (0, exports.encryptBiometric)(decrypted);
                        (0, db_1.query)('UPDATE employees SET biometric_embedding = $1 WHERE id = $2', [reEncrypted, row.id])
                            .then(() => console.log(`[Biometric Migration] Upgraded employee ${row.id} from CBC to GCM`))
                            .catch(err => console.error(`[Biometric Migration Error] Failed to upgrade employee ${row.id} to GCM:`, err));
                    }
                }
                catch (err) {
                    console.error(`Failed to decrypt/parse biometric_embedding for employee ${row.id}:`, err);
                }
            }
            const { biometric_embedding, ...rest } = row;
            return {
                ...rest,
                biometric_embedding: parsedEmbedding
            };
        });
        console.log(`[Employee Info] Fetched ${mappedEmployees.length} employees from database.`);
        return res.status(200).json({
            success: true,
            employees: mappedEmployees,
        });
    }
    catch (error) {
        console.error('[Employee Error] Get employees failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.getEmployees = getEmployees;
// Create a new employee (No passwords/logins)
const createEmployee = async (req, res) => {
    const { employee_id, full_name, department, shift, mobile, profile_photo_url, } = req.body;
    if (!employee_id || !full_name || !department || !shift || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information' });
    }
    try {
        // Check duplicate
        const duplicateCheck = await (0, db_1.query)('SELECT id FROM employees WHERE employee_id = $1', [employee_id]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
        const joiningDate = req.body.joining_date ? new Date(req.body.joining_date) : new Date();
        const salary_type = (req.body.salary_type || 'MONTHLY').toUpperCase();
        const role = 'EMPLOYEE';
        const is_active = req.body.is_active !== undefined ? req.body.is_active : true;
        let sanitizedPhotoUrl = null;
        try {
            sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
        }
        catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        const result = await (0, db_1.query)(`INSERT INTO employees (
        employee_id, full_name, department, shift, mobile, profile_photo_url,
        joining_date, salary_type, role, password_hash, is_active, require_password_change, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, FALSE, $11, $12)
       RETURNING id, employee_id, full_name, is_active`, [
            employee_id,
            full_name,
            department,
            shift,
            mobile,
            sanitizedPhotoUrl,
            joiningDate,
            salary_type,
            role,
            is_active,
            new Date(),
            new Date()
        ]);
        console.log(`[Employee Info] Created new employee profile: ${employee_id} (${full_name}) - UUID: ${result.rows[0].id}`);
        return res.status(201).json({
            success: true,
            message: 'Employee created successfully',
            employee: result.rows[0],
        });
    }
    catch (error) {
        console.error('[Employee Error] Create employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.createEmployee = createEmployee;
// Update employee (No password parameters)
const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { full_name, department, shift, mobile, profile_photo_url, is_active } = req.body;
    if (!full_name || !department || !shift || !mobile) {
        return res.status(400).json({ success: false, message: 'Missing required information' });
    }
    try {
        const empCheck = await (0, db_1.query)('SELECT id FROM employees WHERE id = $1', [id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const activeStatus = is_active !== false;
        let sanitizedPhotoUrl = null;
        try {
            sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
        }
        catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        await (0, db_1.query)(`UPDATE employees SET
        full_name = $1, department = $2, shift = $3, mobile = $4, profile_photo_url = $5,
        is_active = $6, updated_at = $7
       WHERE id = $8`, [full_name, department, shift, mobile, sanitizedPhotoUrl, activeStatus, new Date(), id]);
        console.log(`[Employee Info] Updated employee profile: ${id} (${full_name}). Active: ${activeStatus}`);
        return res.status(200).json({
            success: true,
            message: 'Employee updated successfully',
        });
    }
    catch (error) {
        console.error('[Employee Error] Update employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.updateEmployee = updateEmployee;
// Register face embeddings
const registerFace = async (req, res) => {
    const employeeId = req.params.id || req.body.id || req.body.employee_id;
    const { face_embedding, profile_photo_url } = req.body;
    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    if (!face_embedding || !Array.isArray(face_embedding) || face_embedding.length !== 128) {
        return res.status(400).json({ success: false, message: 'A 128-dimensional face embedding array is required.' });
    }
    try {
        // Check if employee exists by either UUID id or corporate employee_id
        const empCheck = await (0, db_1.query)('SELECT id, employee_id, full_name FROM employees WHERE id::text = $1 OR employee_id = $1', [employeeId]);
        if (empCheck.rows.length === 0) {
            console.warn(`[Biometric Sync] Face enrollment failed: Employee '${employeeId}' not found in database.`);
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = empCheck.rows[0];
        let sanitizedPhotoUrl = null;
        try {
            sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
        }
        catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        await (0, db_1.query)(`UPDATE employees 
       SET face_embedding = $1, profile_photo_url = $2, updated_at = $3
       WHERE id = $4`, [face_embedding, sanitizedPhotoUrl, new Date(), employee.id]);
        console.log(`[Biometric Sync] Successfully enrolled face signature for: ${employee.full_name} (${employee.employee_id})`);
        return res.status(200).json({
            success: true,
            message: 'Face signature enrolled successfully.',
            employee: {
                id: employee.id,
                employee_id: employee.employee_id,
                full_name: employee.full_name
            }
        });
    }
    catch (error) {
        console.error('[Biometric Sync Error] Register face failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.registerFace = registerFace;
// Delete employee
const deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, db_1.query)('DELETE FROM employees WHERE id = $1 RETURNING id, employee_id, full_name', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = result.rows[0];
        console.log(`[Employee Info] Deleted employee profile: ${employee.full_name} (${employee.employee_id}) - UUID: ${employee.id}`);
        return res.status(200).json({
            success: true,
            message: 'Employee deleted successfully',
        });
    }
    catch (error) {
        console.error('[Employee Error] Delete employee failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.deleteEmployee = deleteEmployee;
// Request re-enrollment (Face template update request)
const requestReEnrollment = async (req, res) => {
    const { employee_id, embedding, admin_notes } = req.body;
    if (!employee_id) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }
    try {
        // Check if employee exists
        const empCheck = await (0, db_1.query)('SELECT id, employee_id, full_name, biometric_enrolled_at FROM employees WHERE id::text = $1 OR employee_id = $1', [employee_id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const employee = empCheck.rows[0];
        // Check cooldown: must wait 24 hours between updates/requests
        if (employee.biometric_enrolled_at) {
            const msSinceEnrolled = Date.now() - new Date(employee.biometric_enrolled_at).getTime();
            if (msSinceEnrolled < 24 * 60 * 60 * 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Re-enrollment cooldown active. Please wait 24 hours between enrollment updates.'
                });
            }
        }
        // Check if there is a pending or approved request created in the last 24 hours
        const recentRequestCheck = await (0, db_1.query)(`SELECT created_at FROM re_enrollment_requests 
       WHERE employee_id = $1 AND status IN ('PENDING', 'APPROVED') 
       ORDER BY created_at DESC LIMIT 1`, [employee.id]);
        if (recentRequestCheck.rows.length > 0) {
            const msSinceRequest = Date.now() - new Date(recentRequestCheck.rows[0].created_at).getTime();
            if (msSinceRequest < 24 * 60 * 60 * 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Re-enrollment cooldown active. Please wait 24 hours between enrollment updates.'
                });
            }
        }
        let numericVector;
        try {
            numericVector = validateBiometricEmbedding(embedding);
        }
        catch (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        const serialized = JSON.stringify(numericVector);
        const encrypted = (0, exports.encryptBiometric)(serialized);
        const result = await (0, db_1.query)(`INSERT INTO re_enrollment_requests (employee_id, new_embedding, status, admin_notes)
       VALUES ($1, $2, 'PENDING', $3)
       RETURNING id, employee_id, status`, [employee.id, encrypted, admin_notes || null]);
        console.log(`[Re-Enrollment] Requested re-enrollment for employee: ${employee.full_name} (${employee.employee_id})`);
        return res.status(201).json({
            success: true,
            message: 'Re-enrollment request created successfully.',
            request: result.rows[0]
        });
    }
    catch (error) {
        console.error('[Re-Enrollment Error] Request re-enrollment failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.requestReEnrollment = requestReEnrollment;
// Approve re-enrollment request
const approveReEnrollment = async (req, res) => {
    const { id } = req.params; // request ID
    const adminId = req.user?.id; // Authenticated admin
    try {
        const reqCheck = await (0, db_1.query)('SELECT id, employee_id, new_embedding, status FROM re_enrollment_requests WHERE id = $1', [id]);
        if (reqCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Re-enrollment request not found.' });
        }
        const requestRow = reqCheck.rows[0];
        if (requestRow.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: `Cannot approve request with status: ${requestRow.status}`
            });
        }
        // Get current employee embedding to archive
        const empCheck = await (0, db_1.query)('SELECT id, biometric_embedding, biometric_enrolled FROM employees WHERE id = $1', [requestRow.employee_id]);
        if (empCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee associated with request not found.' });
        }
        const employee = empCheck.rows[0];
        // Transaction to update records
        await (0, db_1.query)('BEGIN');
        // Archive current embedding if enrolled
        if (employee.biometric_enrolled && employee.biometric_embedding) {
            await (0, db_1.query)('INSERT INTO biometric_history (employee_id, biometric_embedding) VALUES ($1, $2)', [employee.id, employee.biometric_embedding]);
        }
        // Update employee profile with new embedding
        await (0, db_1.query)(`UPDATE employees 
       SET biometric_embedding = $1, 
           biometric_enrolled = TRUE, 
           biometric_enrolled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`, [requestRow.new_embedding, employee.id]);
        // Approve the request
        await (0, db_1.query)(`UPDATE re_enrollment_requests 
       SET status = 'APPROVED', requested_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`, [adminId || null, id]);
        await (0, db_1.query)('COMMIT');
        console.log(`[Re-Enrollment] Approved request ${id} for employee ${employee.id}`);
        return res.status(200).json({
            success: true,
            message: 'Re-enrollment approved and face profile updated successfully.'
        });
    }
    catch (error) {
        await (0, db_1.query)('ROLLBACK');
        console.error('[Re-Enrollment Error] Approve re-enrollment failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.approveReEnrollment = approveReEnrollment;
// Reject re-enrollment request
const rejectReEnrollment = async (req, res) => {
    const { id } = req.params;
    const { admin_notes } = req.body;
    try {
        const reqCheck = await (0, db_1.query)('SELECT id, status FROM re_enrollment_requests WHERE id = $1', [id]);
        if (reqCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Re-enrollment request not found.' });
        }
        const requestRow = reqCheck.rows[0];
        if (requestRow.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: `Cannot reject request with status: ${requestRow.status}`
            });
        }
        await (0, db_1.query)(`UPDATE re_enrollment_requests 
       SET status = 'REJECTED', admin_notes = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`, [admin_notes || null, id]);
        console.log(`[Re-Enrollment] Rejected request ${id}`);
        return res.status(200).json({
            success: true,
            message: 'Re-enrollment request rejected successfully.'
        });
    }
    catch (error) {
        console.error('[Re-Enrollment Error] Reject re-enrollment failed:', error);
        return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
    }
};
exports.rejectReEnrollment = rejectReEnrollment;
