jest.mock("../middlewares/authMiddleware.js", () => jest.fn((req, res, next) => {
    req.user = { investorId: 1, email: "test@example.com" };
    next();
}));

jest.mock("../controller/profileController.js", () => ({
    getProfile: jest.fn((req, res) => res.status(200).json({
        route: "getProfile",
        user: req.user
    }))
}));

const request = require("supertest");
const app = require("../server");
const authenticateUser = require("../middlewares/authMiddleware.js");
const { getProfile } = require("../controller/profileController.js");

describe("Profile routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("GET /api/profile routes to getProfile controller", async () => {
        const response = await request(app).get("/api/profile");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            route: "getProfile",
            user: {
                investorId: 1,
                email: "test@example.com"
            }
        });
        expect(authenticateUser).toHaveBeenCalledTimes(1);
        expect(getProfile).toHaveBeenCalledTimes(1);
    });
});
