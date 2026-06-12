import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_commercial_smart_erp_jwt_secret_2026';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    employee_id: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
    department_id?: number | null;
  };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Direct active status check for employees
    if (decoded.role === 'EMPLOYEE') {
      const { query } = require('../config/db');
      const statusRes = await query('SELECT is_active FROM employees WHERE id = $1', [decoded.id]);
      if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
        return res.status(403).json({ success: false, message: 'Your account has been disabled.' });
      }
    }

    // Direct active status check for admins/managers
    if (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN' || decoded.role === 'MANAGER' || decoded.role === 'HR_MANAGER') {
      const { query } = require('../config/db');
      const statusRes = await query('SELECT is_active FROM admins WHERE id = $1', [decoded.id]);
      if (statusRes.rows.length === 0 || !statusRes.rows[0].is_active) {
        return res.status(403).json({ success: false, message: 'Your account has been disabled.' });
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
  }
};

export const requireRole = (roles: ('SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Requires one of the following roles: ${roles.join(', ')}`,
      });
    }

    next();
  };
};
