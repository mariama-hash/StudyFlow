const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));
router.get('/me', authenticate, asyncHandler(authController.me));
router.put('/me', authenticate, asyncHandler(authController.updateMe));
router.get('/users', authenticate, authorize('ADMIN'), asyncHandler(authController.listUsers));

module.exports = router;
