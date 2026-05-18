const express = require("express");
const router = express.Router();

const { getProfile } = require("../controller/profileController.js");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/", authMiddleware, getProfile);

module.exports = router;