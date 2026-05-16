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

jest.mock("bcrypt", () => ({
    hash: jest.fn(),
    compare: jest.fn()
}));

jest.mock("jsonwebtoken", () => ({
    sign: jest.fn(),
    verify: jest.fn()
}));

jest.mock("../utility/authManager.js", () => ({
    generateToken: jest.fn()
}));

// ─── Imports ────────────────────────────────────────────────────────────────
const request   = require("supertest");
const app       = require("../server");
const db        = require("../utility/pgManager.js");
const { redisClient } = require("../utility/redis.js");
const bcrypt    = require("bcrypt");
const { generateToken } = require("../utility/authManager.js");

// ─── Middleware bypass so protected routes work in isolation ─────────────────
jest.mock("../middlewares/authMiddleware.js", () =>
    jest.fn((req, res, next) => {
        req.user = { investorId: 1, investor_id: 1, email: "test@example.com" };
        next();
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// AUTH CONTROLLER — Unit / Integration Tests
// ─────────────────────────────────────────────────────────────────────────────
describe("AuthController — register", () => {
    beforeEach(() => jest.clearAllMocks());

    // ── Happy path ────────────────────────────────────────────────────────────
    test("201 — registers a new user successfully", async () => {
        // No existing user
        db.query
            .mockResolvedValueOnce({ rows: [] })                           // checkUserQuery
            .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })           // insertQuery
            .mockResolvedValueOnce({ rows: [{ investor_id: 20 }] });      // insertInvestorQuery

        bcrypt.hash.mockResolvedValue("hashed_password");

        const body = {
            email: "new@example.com",
            password: "secret123",
            first_name: "John",
            last_name: "Doe",
            phone: "9999999999",
            dob: "1990-01-01",
            pan_number: "ABCDE1234F",
            adhaar_number: "123456789012",
            address: "123 Main St"
        };

        const res = await request(app).post("/api/auth/register").send(body);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({ user_id: 10, investor_id: 20 });
        expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 10);
        expect(db.query).toHaveBeenCalledTimes(3);
    });

    // ── Duplicate email ───────────────────────────────────────────────────────
    test("400 — returns error when email already exists", async () => {
        db.query.mockResolvedValueOnce({ rows: [{ user_id: 1 }] }); // existing user

        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: "dupe@example.com", password: "pass" });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/Email already Exists/i);
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    // ── DB error ──────────────────────────────────────────────────────────────
    test("500 — returns 500 on DB failure", async () => {
        db.query.mockRejectedValueOnce(new Error("DB connection refused"));

        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: "err@example.com", password: "pass" });

        expect(res.statusCode).toBe(500);
        expect(res.body.message).toMatch(/DB connection refused/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("AuthController — login", () => {
    beforeEach(() => jest.clearAllMocks());

    const mockUser = {
        user_id: 1,
        email: "test@example.com",
        password: "hashed_pass",
        investor_id: 7,
        first_name: "Test",
        last_name: "User"
    };

    // ── Missing credentials ───────────────────────────────────────────────────
    test("400 — missing email or password", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "only@example.com" }); // no password

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/Required/i);
    });

    // ── Cache miss → DB hit → success ────────────────────────────────────────
    test("200 — logs in from DB when cache miss", async () => {
        redisClient.get.mockResolvedValue(null);           // cache miss
        db.query.mockResolvedValueOnce({ rows: [mockUser] });
        redisClient.set.mockResolvedValue("OK");
        bcrypt.compare.mockResolvedValue(true);
        generateToken.mockReturnValue("jwt_token_abc");
        redisClient.set.mockResolvedValue("OK");           // token cache

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "secret" });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBe("jwt_token_abc");
        expect(res.body.data.investor).toMatchObject({ email: "test@example.com" });
        expect(generateToken).toHaveBeenCalledTimes(1);
    });

    // ── Cache hit → success ───────────────────────────────────────────────────
    test("200 — logs in from Redis cache when available", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockUser));
        bcrypt.compare.mockResolvedValue(true);
        generateToken.mockReturnValue("jwt_token_from_cache");
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "secret" });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.token).toBe("jwt_token_from_cache");
        expect(db.query).not.toHaveBeenCalled(); // DB skipped
    });

    // ── User not found ────────────────────────────────────────────────────────
    test("401 — invalid credentials when user not found in DB", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockResolvedValueOnce({ rows: [] }); // no user found

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "ghost@example.com", password: "pass" });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toMatch(/Invalid Email or Password/i);
    });

    // ── Wrong password ────────────────────────────────────────────────────────
    test("401 — wrong password returns 401", async () => {
        redisClient.get.mockResolvedValue(JSON.stringify(mockUser));
        bcrypt.compare.mockResolvedValue(false); // password mismatch

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "wrong" });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toMatch(/Invalid Email or Password/i);
    });

    // ── DB error ──────────────────────────────────────────────────────────────
    test("500 — returns 500 on unexpected DB error during login", async () => {
        redisClient.get.mockResolvedValue(null);
        db.query.mockRejectedValueOnce(new Error("Unexpected DB error"));

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "pass" });

        expect(res.statusCode).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("AuthController — logout", () => {
    beforeEach(() => jest.clearAllMocks());

    test("200 — logs out successfully with valid auth header", async () => {
        redisClient.set.mockResolvedValue("OK");

        const res = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", "Bearer valid_token_xyz");

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/LogOut Successfull/i);
        expect(redisClient.set).toHaveBeenCalledWith(
            "blacklist_valid_token_xyz",
            "true",
            { EX: 3600 }
        );
    });

    test("401 — missing Authorization header returns 401", async () => {
        const res = await request(app).post("/api/auth/logout");

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toMatch(/Authorization Header Missing/i);
    });

    test("500 — returns 500 when Redis throws during logout", async () => {
        redisClient.set.mockRejectedValueOnce(new Error("Redis down"));

        const res = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", "Bearer some_token");

        expect(res.statusCode).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCANNON BENCHMARK — Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe("AuthController — Autocannon Benchmarks", () => {
    let server;
    let port;

    beforeAll((done) => {
        // Seed mocks so every autocannon request gets a valid fast path
        redisClient.get.mockResolvedValue(
            JSON.stringify({
                user_id: 1,
                email: "bench@example.com",
                password: "hashed",
                investor_id: 99,
                first_name: "Bench",
                last_name: "User"
            })
        );
        redisClient.set.mockResolvedValue("OK");
        bcrypt.compare.mockResolvedValue(true);
        generateToken.mockReturnValue("bench_token");
        db.query.mockResolvedValue({ rows: [] });

        server = app.listen(0, () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test("POST /api/auth/login sustains ≥ 50 req/s with p99 < 500ms", (done) => {
        const autocannon = require("autocannon");

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/auth/login`,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "bench@example.com", password: "secret" }),
                connections: 5,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] POST /api/auth/login");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);
                console.log(`  Throughput    : ${(result.throughput.average / 1024).toFixed(1)} KB/s`);

                expect(result.requests.average).toBeGreaterThanOrEqual(50);
                expect(result.latency.p99).toBeLessThan(500);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);

    test("POST /api/auth/register sustains ≥ 30 req/s with p99 < 500ms", (done) => {
        const autocannon = require("autocannon");

        // Register path: no existing user → insert user → insert investor
        db.query
            .mockResolvedValue({ rows: [] })             // checkUserQuery (no existing)
        bcrypt.hash.mockResolvedValue("hashed_pw");
        db.query
            .mockResolvedValueOnce({ rows: [{ user_id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ investor_id: 1 }] });

        const instance = autocannon(
            {
                url: `http://localhost:${port}/api/auth/register`,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "bench@example.com",
                    password: "secret",
                    first_name: "Bench"
                }),
                connections: 5,
                duration: 3,
                pipelining: 1
            },
            (err, result) => {
                if (err) return done(err);

                console.log("\n📊 [Autocannon] POST /api/auth/register");
                console.log(`  Requests/sec  : ${result.requests.average}`);
                console.log(`  Latency p99   : ${result.latency.p99} ms`);

                expect(result.requests.average).toBeGreaterThanOrEqual(30);
                expect(result.latency.p99).toBeLessThan(500);
                done();
            }
        );

        autocannon.track(instance, { renderProgressBar: false });
    }, 15000);
});
