// ─── Mock ALL external deps before any require() ────────────────────────────
jest.mock("../utility/pgManager.js", () => ({
    query: jest.fn(),
    pool: { query: jest.fn() },
    connect: jest.fn()
}));

jest.mock("../utility/redis.js", () => ({
    redisClient: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn()
    },
    connectRedis: jest.fn()
}));

jest.mock("../utility/portfolioManager.js", () => ({
    getOrCreatePortfolioId: jest.fn()
}));

// Bypass auth middleware
jest.mock("../middlewares/authMiddleware.js", () =>
    jest.fn((req, res, next) => {
        req.user = { investorId: 5, investor_id: 5, email: "profile@example.com" };
        next();
    })
);

// ─── Imports ─────────────────────────────────────────────────────────────────
const request  = require("supertest");
const app      = require("../server");
const db       = require("../utility/pgManager.js");
const { getOrCreatePortfolioId } = require("../utility/portfolioManager.js");

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE CONTROLLER — getProfile
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfileController — getProfile", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockProfile = {
        investor_id: 5,
        user_id: 3,
        first_name: "Test",
        last_name: "Investor",
        phone: "9876543210",
        dob: "1995-06-15",
        pan_number: "ABCDE1234F",
        adhaar_number: "123456789012",
        address: "123 Test Street",
        email: "profile@example.com",
        portfolio_id: 20
    };

    // ── Happy path ────────────────────────────────────────────────────────────
    test("200 — returns complete profile for authenticated investor", async () => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockResolvedValue({ rows: [mockProfile] });

        const res = await request(app).get("/api/profile");

        expect(res.statusCode).toBe(200);
        expect(res.body.user).toMatchObject({
            investor_id: 5,
            email: "profile@example.com",
            portfolio_id: 20
        });
        expect(getOrCreatePortfolioId).toHaveBeenCalledWith(5); // investorId from req.user
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test("200 — query is called with correct investorId and portfolioId params", async () => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockResolvedValue({ rows: [mockProfile] });

        await request(app).get("/api/profile");

        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining("SELECT"),
            [5, 20]   // investorId=5, portfolioId=20
        );
    });

    test("200 — creates portfolio if none exists (getOrCreatePortfolioId called)", async () => {
        // New investor with no portfolio yet
        getOrCreatePortfolioId.mockResolvedValue(99); // new portfolio ID
        db.query.mockResolvedValue({ rows: [{ ...mockProfile, portfolio_id: 99 }] });

        const res = await request(app).get("/api/profile");

        expect(res.statusCode).toBe(200);
        expect(res.body.user.portfolio_id).toBe(99);
        expect(getOrCreatePortfolioId).toHaveBeenCalledWith(5);
    });

    test("200 — user field is undefined when investor not found in DB", async () => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockResolvedValue({ rows: [] }); // no matching investor

        const res = await request(app).get("/api/profile");

        expect(res.statusCode).toBe(200);
        // rows[0] is undefined → res.body.user should be undefined/null
        expect(res.body.user).toBeUndefined();
    });

    // ── portfolioManager error ─────────────────────────────────────────────────
    test("500 — returns 500 when getOrCreatePortfolioId throws", async () => {
        getOrCreatePortfolioId.mockRejectedValue(new Error("Portfolio insert failed"));

        const res = await request(app).get("/api/profile");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/Portfolio insert failed/i);
        expect(db.query).not.toHaveBeenCalled(); // DB never reached
    });

    // ── DB query error ────────────────────────────────────────────────────────
    test("500 — returns 500 when DB query throws", async () => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockRejectedValue(new Error("DB query timeout"));

        const res = await request(app).get("/api/profile");

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/DB query timeout/i);
    });

    // ── Response shape ────────────────────────────────────────────────────────
    test("200 — response is wrapped in { user: ... } key", async () => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockResolvedValue({ rows: [mockProfile] });

        const res = await request(app).get("/api/profile");

        expect(res.body).toHaveProperty("user");
        expect(Object.keys(res.body)).toEqual(["user"]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — Profile endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("ProfileController — Autocannon Benchmarks", () => {
    let server;
    let port;

    const mockProfile = {
        investor_id: 5,
        first_name: "Test",
        email: "profile@example.com",
        portfolio_id: 20
    };

    beforeAll((done) => {
        getOrCreatePortfolioId.mockResolvedValue(20);
        db.query.mockResolvedValue({ rows: [mockProfile] });

        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("GET /api/profile sustains ≥ 100 req/s with p99 < 200ms", (done) => {
        const autocannon = require("autocannon");

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/profile`,
                connections: 10,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] GET /api/profile");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);
                console.log(`  Throughput    : ${(result.throughput.average / 1024).toFixed(1)} KB/s`);

                expect(result.requests.average).toBeGreaterThanOrEqual(100);
                expect(result.latency.p99).toBeLessThan(200);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);
});
