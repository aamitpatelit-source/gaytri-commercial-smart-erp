import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'gaytri_face_attendance_mvp_secret_key';

export const login = async (req: Request, res: Response) => {
  const { employee_id, password } = req.body; // mobile uses employee_id (Email) or username

  const email = employee_id; // Accept email input

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  // Enforce demo credentials
  if (email === 'admin@gaytri.com' && password === '123456') {
    const token = jwt.sign(
      {
        id: 'admin-static-id-001',
        email: 'admin@gaytri.com',
        role: 'ADMIN',
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      access_token: token,
      refresh_token: token,
      user: {
        id: 'admin-static-id-001',
        employee_id: 'admin@gaytri.com',
        full_name: 'Gaytri Admin',
        role: 'ADMIN',
      },
    });
  }

  return res.status(401).json({ success: false, message: 'Invalid email or password. Use admin@gaytri.com / 123456' });
};

export const getMe = async (req: any, res: Response) => {
  return res.status(200).json({
    success: true,
    user: {
      id: 'admin-static-id-001',
      employee_id: 'admin@gaytri.com',
      full_name: 'Gaytri Admin',
      role: 'ADMIN',
    },
  });
};
