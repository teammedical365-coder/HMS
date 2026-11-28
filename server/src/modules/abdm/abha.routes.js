/**
 * abha.routes.js — ABDM ABHA Endpoints for Medical365
 *
 * Base mount: /api/abdm/abha
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/auth.middleware');
const {
    abdmOtpGenerateLimiter,
    abdmOtpGenerateUserLimiter,
    abdmOtpVerifyLimiter,
    abdmStatusLimiter
} = require('../../middleware/rateLimiter');
const abhaController = require('./abha.controller');

// All ABHA routes require verified authentication + strict RBAC & tenant/ownership checks
router.use(verifyToken);

// 1. Get ABHA status for a patient
router.get('/status/:patientId', abhaController.authorizeAbhaAccess, abdmStatusLimiter, abhaController.getStatus);

// 2. Link Existing ABHA flow
router.post('/link/start', abhaController.authorizeAbhaAccess, abdmOtpGenerateUserLimiter, abdmOtpGenerateLimiter, abhaController.startLink);
router.post('/link/verify', abhaController.authorizeAbhaAccess, abdmOtpVerifyLimiter, abhaController.verifyLink);

// 3. Create New ABHA flow
router.post('/create/start', abhaController.authorizeAbhaAccess, abdmOtpGenerateUserLimiter, abdmOtpGenerateLimiter, abhaController.startCreate);
router.post('/create/verify', abhaController.authorizeAbhaAccess, abdmOtpVerifyLimiter, abhaController.verifyCreate);

module.exports = router;
