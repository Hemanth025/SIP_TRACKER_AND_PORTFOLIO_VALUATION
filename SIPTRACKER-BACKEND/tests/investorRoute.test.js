jest.mock("../middlewares/authMiddleware.js", () => jest.fn((req, res, next) => {
    req.user = {
        investorId: 1,
        investor_id: 1,
        email: "test@example.com"
    };
    next();
}));

jest.mock("../controller/InvestorController.js", () => ({
    displayInvestors: jest.fn((req, res) => res.status(200).json({
        route: "displayInvestors",
        user: req.user
    })),
    getInvestorById: jest.fn((req, res) => res.status(200).json({
        route: "getInvestorById",
        params: req.params,
        user: req.user
    })),
    getInvestorHoldings: jest.fn((req, res) => res.status(200).json({
        route: "getInvestorHoldings",
        params: req.params,
        user: req.user
    })),
    getInvestorNetWorth: jest.fn((req, res) => res.status(200).json({
        route: "getInvestorNetWorth",
        params: req.params,
        user: req.user
    }))
}));

const request = require("supertest");
const app = require("../server");
const authenticateUser = require("../middlewares/authMiddleware.js");
const investorController = require("../controller/InvestorController.js");

describe("Investor routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("GET /api/investors routes to displayInvestors controller", async () => {
        const response = await request(app).get("/api/investors");

        expect(response.statusCode).toBe(200);
        expect(response.body.route).toBe("displayInvestors");
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(investorController.displayInvestors).toHaveBeenCalledTimes(1);
    });

    test("GET /api/investors/:investor_id routes to getInvestorById controller", async () => {
        const response = await request(app).get("/api/investors/7");

        expect(response.statusCode).toBe(200);
        expect(response.body).toMatchObject({
            route: "getInvestorById",
            params: { investor_id: "7" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(investorController.getInvestorById).toHaveBeenCalledTimes(1);
    });

    test("GET /api/investors/:investor_id/holdings routes to getInvestorHoldings controller", async () => {
        const response = await request(app).get("/api/investors/7/holdings");

        expect(response.statusCode).toBe(200);
        expect(response.body).toMatchObject({
            route: "getInvestorHoldings",
            params: { investor_id: "7" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(investorController.getInvestorHoldings).toHaveBeenCalledTimes(1);
    });

    test("GET /api/investors/:investor_id/networth routes to getInvestorNetWorth controller", async () => {
        const response = await request(app).get("/api/investors/7/networth");

        expect(response.statusCode).toBe(200);
        expect(response.body).toMatchObject({
            route: "getInvestorNetWorth",
            params: { investor_id: "7" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(investorController.getInvestorNetWorth).toHaveBeenCalledTimes(1);
    });
});
