const router = require("express").Router();
const authenticateUser = require("../middlewares/authMiddleware.js")
const {displayInvestors, getInvestorById, getInvestorHoldings, getInvestorNetWorth} = require("../controller/InvestorController.js");

router.get("/investors", authenticateUser, displayInvestors);
router.get("/investors/:investor_id", authenticateUser, getInvestorById);
router.get("/investors/:investor_id/holdings", authenticateUser, getInvestorHoldings);
router.get("/investors/:investor_id/networth",authenticateUser, getInvestorNetWorth);

module.exports = router;