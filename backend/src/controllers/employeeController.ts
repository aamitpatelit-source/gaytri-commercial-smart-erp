import { Request, Response } from 'express';
import { query } from '../config/db';

const sanitizeAndValidateBase64Image = (base64Str: string | null | undefined): string | null => {
  if (!base64Str || typeof base64Str !== 'string') return null;
  
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
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err) {
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
export const getEmployees = async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, department, shift, mobile, profile_photo_url,
              is_active,
              face_embedding,
              face_embedding IS NOT NULL as has_face_data
       FROM employees
       ORDER BY employee_id ASC`
    );

    console.log(`[Employee Info] Fetched ${result.rows.length} employees from database.`);

    return res.status(200).json({
      success: true,
      employees: result.rows,
    });
  } catch (error) {
    console.error('[Employee Error] Get employees failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Create a new employee (No passwords/logins)
export const createEmployee = async (req: Request, res: Response) => {
  const {
    employee_id,
    full_name,
    department,
    shift,
    mobile,
    profile_photo_url,
  } = req.body;

  if (!employee_id || !full_name || !department || !shift || !mobile) {
    return res.status(400).json({ success: false, message: 'Missing required information' });
  }

  try {
    // Check duplicate
    const duplicateCheck = await query('SELECT id FROM employees WHERE employee_id = $1', [employee_id]);
    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Employee ID already exists' });
    }

    const joiningDate = req.body.joining_date ? new Date(req.body.joining_date) : new Date();
    const salary_type = (req.body.salary_type || 'MONTHLY').toUpperCase();
    const role = 'EMPLOYEE';
    const is_active = req.body.is_active !== undefined ? req.body.is_active : true;

    let sanitizedPhotoUrl: string | null = null;
    try {
      sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const result = await query(
      `INSERT INTO employees (
        employee_id, full_name, department, shift, mobile, profile_photo_url,
        joining_date, salary_type, role, password_hash, is_active, require_password_change, created_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, FALSE, $11, $12)
       RETURNING id, employee_id, full_name, is_active`,
      [
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
      ]
    );

    console.log(`[Employee Info] Created new employee profile: ${employee_id} (${full_name}) - UUID: ${result.rows[0].id}`);

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      employee: result.rows[0],
    });
  } catch (error) {
    console.error('[Employee Error] Create employee failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Update employee (No password parameters)
export const updateEmployee = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { full_name, department, shift, mobile, profile_photo_url, is_active } = req.body;

  if (!full_name || !department || !shift || !mobile) {
    return res.status(400).json({ success: false, message: 'Missing required information' });
  }

  try {
    const empCheck = await query('SELECT id FROM employees WHERE id = $1', [id]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const activeStatus = is_active !== false;

    let sanitizedPhotoUrl: string | null = null;
    try {
      sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }

    await query(
      `UPDATE employees SET
        full_name = $1, department = $2, shift = $3, mobile = $4, profile_photo_url = $5,
        is_active = $6, updated_at = $7
       WHERE id = $8`,
      [full_name, department, shift, mobile, sanitizedPhotoUrl, activeStatus, new Date(), id]
    );

    console.log(`[Employee Info] Updated employee profile: ${id} (${full_name}). Active: ${activeStatus}`);

    return res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
    });
  } catch (error) {
    console.error('[Employee Error] Update employee failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Register face embeddings
export const registerFace = async (req: Request, res: Response) => {
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
    const empCheck = await query(
      'SELECT id, employee_id, full_name FROM employees WHERE id::text = $1 OR employee_id = $1',
      [employeeId]
    );
    if (empCheck.rows.length === 0) {
      console.warn(`[Biometric Sync] Face enrollment failed: Employee '${employeeId}' not found in database.`);
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const employee = empCheck.rows[0];

    let sanitizedPhotoUrl: string | null = null;
    try {
      sanitizedPhotoUrl = sanitizeAndValidateBase64Image(profile_photo_url);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }

    await query(
      `UPDATE employees 
       SET face_embedding = $1, profile_photo_url = $2, updated_at = $3
       WHERE id = $4`,
      [face_embedding, sanitizedPhotoUrl, new Date(), employee.id]
    );

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
  } catch (error) {
    console.error('[Biometric Sync Error] Register face failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Delete employee
export const deleteEmployee = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query('DELETE FROM employees WHERE id = $1 RETURNING id, employee_id, full_name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const employee = result.rows[0];
    console.log(`[Employee Info] Deleted employee profile: ${employee.full_name} (${employee.employee_id}) - UUID: ${employee.id}`);

    return res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error) {
    console.error('[Employee Error] Delete employee failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};
