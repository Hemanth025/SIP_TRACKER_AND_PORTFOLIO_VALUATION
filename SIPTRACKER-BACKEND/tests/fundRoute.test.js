jest.mock("../middlewares/authMiddleware.js", () => jest.fn((req, res, next) => {
    req.user = { investorId: 1, email: "test@example.com" };
    next();
}));

jest.mock("../controller/fundController.js", () => ({
    createFund: jest.fn((req, res) => res.status(201).json({
        route: "createFund",
        body: req.body
    })),
    getFunds: jest.fn((req, res) => res.status(200).json({
        route: "getFunds"
    })),
    updateFund: jest.fn((req, res) => res.status(201).json({
        route: "updateFund",
        params: req.params,
        body: req.body
    }))
}));

const request = require("supertest");
const app = require("../server");
const authenticateUser = require("../middlewares/authMiddleware.js");
const fundController = require("../controller/fundController.js");

describe("Fund routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /api/funds routes to createFund controller", async () => {
        const body = {
            amc_id: 1,
            fund_name: "Bluechip Fund",
            fund_code: "BF001",
            fund_type: "Equity"
        };

        const response = await request(app)
            .post("/api/funds")
            .send(body);

        expect(response.statusCode).toBe(201);
        expect(response.body).toEqual({ route: "createFund", body });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(fundController.createFund).toHaveBeenCalledTimes(1);
    });

    test("GET /api/funds routes to getFunds controller", async () => {
        const response = await request(app).get("/api/funds");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ route: "getFunds" });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(fundController.getFunds).toHaveBeenCalledTimes(1);
    });

    test("PUT /api/funds/:fund_id routes to updateFund controller", async () => {
        const body = {
            nav_value: 121.45,
            nav_date: "2026-05-15"
        };

        const response = await request(app)
            .put("/api/funds/5")
            .send(body);

        expect(response.statusCode).toBe(201);
        expect(response.body).toEqual({
            route: "updateFund",
            params: { fund_id: "5" },
            body
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(fundController.updateFund).toHaveBeenCalledTimes(1);
    });
});
