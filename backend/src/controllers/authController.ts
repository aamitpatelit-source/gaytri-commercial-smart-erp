import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_commercial_smart_erp_jwt_secret_2026';

// 1. Mobile App Login (Repurposed to authenticate ONLY MANAGER accounts from the 'admins' table)
export const login = async (req: Request, res: Response) => {
  const { employee_id, password } = req.body; // mobile app passes 'employee_id' (which is the email now)

  if (!employee_id || !password) {
    return res.status(400).json({ success: false, message: 'Manager Email and password are required.' });
  }

  try {
    const inputEmail = employee_id.trim().toLowerCase();
    console.log(`[Auth Login] Attempting login for: ${inputEmail}`);

    // Query ONLY the admins table, looking for MANAGER role
    const adminRes = await query(
      `SELECT id, email, password_hash, full_name, role, is_active, must_change_password 
       FROM admins WHERE email = $1`,
      [inputEmail]
    );

    if (adminRes.rows.length === 0) {
      console.warn(`[Auth Login] Account not found: ${inputEmail}`);
      return res.status(401).json({ success: false, message: 'Invalid manager credentials.' });
    }

    const admin = adminRes.rows[0];
    console.log(`[Auth Login] Account found. Role detected: ${admin.role}`);

    // Restrict mobile app access to MANAGER roles only
    if (admin.role !== 'MANAGER') {
      console.warn(`[Auth Login] Access denied: role is ${admin.role}, expected MANAGER`);
      return res.status(403).json({ success: false, message: 'Access denied. Manager privileges required.' });
    }

    if (!admin.is_active) {
      console.warn(`[Auth Login] Inactive state check failed: Account is deactivated for ${inputEmail}`);
      return res.status(403).json({ success: false, message: 'Your account has been disabled.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    console.log(`[Auth Login] Password match result: ${match}`);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid manager credentials.' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        must_change_password: admin.must_change_password,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    console.log(`[Auth Login] JWT generation success for: ${inputEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Manager login successful.',
      token,
      access_token: token,
      refresh_token: token,
      user: {
        id: admin.id,
        employee_id: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        must_change_password: admin.must_change_password,
      },
    });
  } catch (error) {
    console.error('[Auth Error] Manager login failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// 2. Web Admin Login (Authenticates SUPER_ADMIN or ADMIN roles from the 'admins' table)
export const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const adminRes = await query(
      'SELECT id, email, password_hash, full_name, role, is_active, must_change_password FROM admins WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (adminRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const admin = adminRes.rows[0];

    // Restrict web admin login to SUPER_ADMIN and ADMIN roles only
    if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
    }

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Administrator account has been deactivated.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        must_change_password: admin.must_change_password,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Admin login successful.',
      token,
      access_token: token,
      refresh_token: token,
      user: {
        id: admin.id,
        employee_id: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        must_change_password: admin.must_change_password,
      },
    });
  } catch (error) {
    console.error('[Auth Error] Admin login failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// 3. Retrieve Currently Authenticated User Session
export const getMe = async (req: any, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  try {
    const { id } = req.user;

    const adminRes = await query(
      'SELECT id, email, full_name, role, is_active, must_change_password FROM admins WHERE id = $1',
      [id]
    );

    if (adminRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    const admin = adminRes.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: admin.id,
        employee_id: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        must_change_password: admin.must_change_password,
      },
    });
  } catch (error) {
    console.error('[Auth Error] Get profile failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// 4. Change Password for Currently Logged-in User
export const changePassword = async (req: any, res: Response) => {
  const { old_password, new_password } = req.body;
  
  if (!old_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
  }

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  try {
    const { id } = req.user;

    const adminRes = await query('SELECT password_hash FROM admins WHERE id = $1', [id]);
    if (adminRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    
    const admin = adminRes.rows[0];
    const match = await bcrypt.compare(old_password, admin.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Incorrect current password.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await query(
      'UPDATE admins SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2', 
      [newHash, id]
    );
    
    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[Auth Error] Change password failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// 5. Update Profile details for currently logged-in Admin User
export const updateProfile = async (req: any, res: Response) => {
  const { full_name, email } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ success: false, message: 'Full name and email are required.' });
  }

  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }

  try {
    const { id } = req.user;

    // Check if email already taken by another user
    const existing = await query('SELECT id FROM admins WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email address is already in use.' });
    }

    await query(
      'UPDATE admins SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [full_name.trim(), email.trim().toLowerCase(), id]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id,
        employee_id: email.trim().toLowerCase(),
        full_name: full_name.trim(),
        role: req.user.role,
      }
    });
  } catch (error) {
    console.error('[Auth Error] Update profile failed:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// ==========================================
// MANAGER MANAGEMENT CRUD ENDPOINTS (For Admins)
// ==========================================

// Get All Manager/Admin Accounts
export const getManagers = async (req: any, res: Response) => {
  try {
    const managers = await query(
      `SELECT id, email, full_name, role, is_active, must_change_password, created_at 
       FROM admins WHERE id != $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      managers: managers.rows
    });
  } catch (error) {
    console.error('[Managers API] Failed to fetch managers:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Create a New Manager/Admin Account
export const createManager = async (req: any, res: Response) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'All fields (full_name, email, password, role) are required.' });
  }

  const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role assigned.' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();

    // Check if email already in use
    const checkUser = await query('SELECT id FROM admins WHERE email = $1', [cleanEmail]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email address is already in use.' });
    }

    const { v4: uuidv4 } = require('uuid');
    const passwordHash = await bcrypt.hash(password, 10);
    const newId = uuidv4();

    await query(
      `INSERT INTO admins (id, email, password_hash, full_name, role, is_active, must_change_password, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [newId, cleanEmail, passwordHash, full_name.trim(), role]
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      manager: {
        id: newId,
        email: cleanEmail,
        full_name: full_name.trim(),
        role,
        is_active: true,
        must_change_password: true
      }
    });
  } catch (error) {
    console.error('[Managers API] Failed to create account:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Update Manager/Admin Account (Update properties or Reset Password)
export const updateManager = async (req: any, res: Response) => {
  const { id } = req.params;
  const { full_name, email, role, is_active, password } = req.body;

  try {
    // Check if target account exists
    const checkUser = await query('SELECT role FROM admins WHERE id = $1', [id]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    // Check for self-modification restriction
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Self-modification of status/role not allowed via this panel.' });
    }

    let queryParts = [];
    let queryParams = [];
    let counter = 1;

    if (full_name !== undefined) {
      queryParts.push(`full_name = $${counter++}`);
      queryParams.push(full_name.trim());
    }

    if (email !== undefined) {
      const cleanEmail = email.trim().toLowerCase();
      // Check if email already in use by another account
      const checkEmail = await query('SELECT id FROM admins WHERE email = $1 AND id != $2', [cleanEmail, id]);
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email address is already in use.' });
      }
      queryParts.push(`email = $${counter++}`);
      queryParams.push(cleanEmail);
    }

    if (role !== undefined) {
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role assigned.' });
      }
      queryParts.push(`role = $${counter++}`);
      queryParams.push(role);
    }

    if (is_active !== undefined) {
      queryParts.push(`is_active = $${counter++}`);
      queryParams.push(!!is_active);
    }

    if (password !== undefined && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password, 10);
      queryParts.push(`password_hash = $${counter++}`);
      queryParams.push(passwordHash);
      // Reset must_change_password flag when password is reset by admin
      queryParts.push(`must_change_password = $${counter++}`);
      queryParams.push(true);
    }

    if (queryParts.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update provided.' });
    }

    queryParts.push(`updated_at = CURRENT_TIMESTAMP`);
    queryParams.push(id);

    const updateQuery = `
      UPDATE admins SET ${queryParts.join(', ')} 
      WHERE id = $${counter}
    `;

    await query(updateQuery, queryParams);

    return res.status(200).json({
      success: true,
      message: 'Account updated successfully.'
    });
  } catch (error) {
    console.error('[Managers API] Failed to update account:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};

// Delete Manager/Admin Account
export const deleteManager = async (req: any, res: Response) => {
  const { id } = req.params;

  try {
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Self-deletion not allowed.' });
    }

    const checkUser = await query('SELECT id FROM admins WHERE id = $1', [id]);
    if (checkUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    await query('DELETE FROM admins WHERE id = $1', [id]);

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully.'
    });
  } catch (error) {
    console.error('[Managers API] Failed to delete account:', error);
    return res.status(500).json({ success: false, message: 'Server temporarily unavailable' });
  }
};
