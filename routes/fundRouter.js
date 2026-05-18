const express = require("express");
const { createFund,getFunds, updateFund} = require("../controller/fundController.js");
const authenticateUser = require("../middlewares/authMiddleware.js")
const router = express.Router();

router.post("/", authenticateUser, createFund);
router.get("/", authenticateUser, getFunds);
router.put("/:fund_id", authenticateUser, updateFund);

module.exports = router;