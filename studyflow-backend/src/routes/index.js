const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.use('/auth', require('./authRoutes')); // register/login publics, /me et /users protégés en interne

router.use('/pedagogique', authenticate, require('./pedagogiqueRoutes'));
router.use('/personnel', authenticate, require('./personnelRoutes'));
router.use('/economique', authenticate, require('./economiqueRoutes'));
router.use('/transversal', authenticate, require('./transversalRoutes'));

module.exports = router;
