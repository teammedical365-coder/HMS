/**
 * abha.routes.js — ABDM ABHA Endpoints for Medical365
 *
 * Base mount: /api/abdm/abha
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/auth.middleware');
const abhaController = require('./abha.controller');

// All ABHA routes require valid authenticated user session
router.use(verifyToken);

// 1. Get ABHA status for a patient
router.get('/status/:patientId', abhaController.getStatus);

// 2. Link Existing ABHA flow
router.post('/link/start', abhaController.startLink);
router.post('/link/verify', abhaController.verifyLink);

// 3. Create New ABHA flow
router.post('/create/start', abhaController.startCreate);
router.post('/create/verify', abhaController.verifyCreate);

module.exports = router;
