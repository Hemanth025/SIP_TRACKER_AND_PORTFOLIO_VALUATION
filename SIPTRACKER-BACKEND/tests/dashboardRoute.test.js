jest.mock("../middlewares/authMiddleware.js", () => jest.fn((req, res, next) => {
    req.user = { investorId: 1, email: "test@example.com" };
    next();
}));

jest.mock("../controller/dashboardController.js", () => ({
    getDashboardData: jest.fn((req, res) => res.status(200).json({
        route: "getDashboardData",
        user: req.user
    }))
}));

const request = require("supertest");
const app = require("../server");
const authenticateUser = require("../middlewares/authMiddleware.js");
const { getDashboardData } = require("../controller/dashboardController.js");

describe("Dashboard routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("GET /api/dashboard routes to getDashboardData controller", async () => {
        const response = await request(app).get("/api/dashboard");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            route: "getDashboardData",
            user: {
                investorId: 1,
                email: "test@example.com"
            }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(getDashboardData).toHaveBeenCalledTimes(1);
    });
});
