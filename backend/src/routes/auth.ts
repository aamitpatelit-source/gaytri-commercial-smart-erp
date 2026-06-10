import { Router } from 'express';
import { login, getMe } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public login route
router.post('/login', login);

// Protected status query
router.get('/me', authenticateToken as any, getMe as any);

export default router;
