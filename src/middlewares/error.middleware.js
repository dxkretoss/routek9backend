import env from "../config/env.js";

const errorMiddleware = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
        ...(env.nodeEnv === "development" && { stack: err.stack }),
    });
};

export default errorMiddleware;
