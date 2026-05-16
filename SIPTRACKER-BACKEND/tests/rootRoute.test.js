const request = require("supertest");
const app = require("../server");

describe("Root route", () => {
    test("GET / returns backend health message", async () => {
        const response = await request(app).get("/");

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: "SIP Tracker Backend Running"
        });
    });
});
