import { Router } from 'express';
import { login, getMe } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Public login route
router.post('/login', asyncHandler(login));

// Protected status query
router.get('/me', authenticateToken as any, asyncHandler(getMe));

export default router;
