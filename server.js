require("./middlewares/telemetry.js")
const express = require('express');
const cors = require("cors");
const app = express();
const tracer = require("./middlewares/telemetry.js");
const authRouter = require('./routes/authRouter.js');
const investorRoutes = require('./routes/InvestorRoutes.js');
const fundRouter = require('./routes/fundRouter.js');
const sipRoutes = require('./routes/sipRoutes.js');
const dashboardRouter = require('./routes/dashboardRouter.js');
const profileRouter = require('./routes/profileRouter.js');
const pgd = require('./utility/pgManager.js');
const loggerMiddleware = require("./middlewares/loggerMiddleware.js")

app.use(express.json());
app.use(cors())
app.use(loggerMiddleware);
app.use('/api/auth', authRouter);
app.use('/api', investorRoutes);
app.use('/api/funds', fundRouter);
app.use('/api/sips', sipRoutes);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/profile', profileRouter);

app.get("/", (req, res) => {
  res.json({
    success : true,
    message : "SIP Tracker Backend Running"
  });
});


// 1. Export the app for Supertest
module.exports = app; 

// 2. Wrap side effects in a conditional block
if (require.main === module) {
    const { connectRedis } = require("./utility/redis.js");
    const { pool, connectDB } = require("./utility/pgManager.js")
    connectRedis();
    connectDB();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
