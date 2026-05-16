const express = require('express');
const router = express.Router();
const authenticateUser = require("../middlewares/authMiddleware.js")
const sipController = require('../controller/sipController.js');

router.post('/', authenticateUser, sipController.createSIP);
router.get('/', authenticateUser, sipController.getAllSIPs);
router.get('/:sip_id', authenticateUser, sipController.getSipById);
router.post('/:sip_id/process', authenticateUser, sipController.processSips);
router.get('/:sip_id/transactions', authenticateUser, sipController.getSIPTransactions);

module.exports = router;