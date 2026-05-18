const logger = require("./logger");
const UAParser = require("ua-parser-js");

const loggerMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress;

    const parser = new UAParser(req.headers["user-agent"]);
    const ua = parser.getResult();

    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip,
      browser: ua.browser.name,
      os: ua.os.name,
      device: ua.device.type || "desktop"
    });
  });

  next();
};

module.exports = loggerMiddleware;