const express = require("express");
const router = express.Router();

const { getDashboardData } = require("../controller/dashboardController.js");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/", authMiddleware, getDashboardData);

module.exports = router;