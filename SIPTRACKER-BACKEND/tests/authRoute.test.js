jest.mock("../controller/authController.js", () => ({
    register: jest.fn((req, res) => res.status(201).json({
        route: "register",
        body: req.body
    })),
    login: jest.fn((req, res) => res.status(200).json({
        route: "login",
        body: req.body
    })),
    logout: jest.fn((req, res) => res.status(200).json({
        route: "logout"
    }))
}));

const request = require("supertest");
const app = require("../server");
const { register, login } = require("../controller/authController.js");

describe("Auth routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /api/auth/register routes to register controller", async () => {
        const body = {
            email: "test@example.com",
            password: "secret",
            first_name: "Test"
        };

        const response = await request(app)
            .post("/api/auth/register")
            .send(body);

        expect(response.statusCode).toBe(201);
        expect(response.body).toEqual({ route: "register", body });
        expect(register).toHaveBeenCalledTimes(1);
    });

    test("POST /api/auth/login routes to login controller", async () => {
        const body = {
            email: "test@example.com",
            password: "secret"
        };

        const response = await request(app)
            .post("/api/auth/login")
            .send(body);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ route: "login", body });
        expect(login).toHaveBeenCalledTimes(1);
    });
});
