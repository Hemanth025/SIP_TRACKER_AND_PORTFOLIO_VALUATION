jest.mock("../middlewares/authMiddleware.js", () => jest.fn((req, res, next) => {
    req.user = { investorId: 1, email: "test@example.com" };
    next();
}));

jest.mock("../controller/sipController.js", () => ({
    createSIP: jest.fn((req, res) => res.status(201).json({
        route: "createSIP",
        body: req.body
    })),
    getAllSIPs: jest.fn((req, res) => res.status(200).json({
        route: "getAllSIPs"
    })),
    getSipById: jest.fn((req, res) => res.status(200).json({
        route: "getSipById",
        params: req.params
    })),
    processSips: jest.fn((req, res) => res.status(200).json({
        route: "processSips",
        params: req.params
    })),
    getSIPTransactions: jest.fn((req, res) => res.status(200).json({
        route: "getSIPTransactions",
        params: req.params
    }))
}));

const request = require("supertest");
const app = require("../server");
const authenticateUser = require("../middlewares/authMiddleware.js");
const sipController = require("../controller/sipController.js");

describe("SIP routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /api/sips routes to createSIP controller", async () => {
        const body = {
            fund_id: 3,
            sip_amount: 1000,
            sip_date: 15,
            start_date: "2026-05-15",
            end_date: "2027-05-15"
        };

        const response = await request(app)
            .post("/api/sips")
            .send(body);

        expect(response.statusCode).toBe(201);
        expect(response.body).toEqual({ route: "createSIP", body });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(sipController.createSIP).toHaveBeenCalledTimes(1);
    });

    test("GET /api/sips routes to getAllSIPs controller", async () => {
        const response = await request(app).get("/api/sips");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ route: "getAllSIPs" });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(sipController.getAllSIPs).toHaveBeenCalledTimes(1);
    });

    test("GET /api/sips/:sip_id routes to getSipById controller", async () => {
        const response = await request(app).get("/api/sips/9");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            route: "getSipById",
            params: { sip_id: "9" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(sipController.getSipById).toHaveBeenCalledTimes(1);
    });

    test("POST /api/sips/:sip_id/process routes to processSips controller", async () => {
        const response = await request(app).post("/api/sips/9/process");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            route: "processSips",
            params: { sip_id: "9" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(sipController.processSips).toHaveBeenCalledTimes(1);
    });

    test("GET /api/sips/:sip_id/transactions routes to getSIPTransactions controller", async () => {
        const response = await request(app).get("/api/sips/9/transactions");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            route: "getSIPTransactions",
            params: { sip_id: "9" }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(sipController.getSIPTransactions).toHaveBeenCalledTimes(1);
    });
});
