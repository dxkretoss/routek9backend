import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import env from "./config/env.js";

import routes from "./routes/index.js";
import notFoundMiddleware from "./middlewares/notFound.middleware.js";
import errorMiddleware from "./middlewares/error.middleware.js";

const app = express();

/**
 * Security
 */
app.use(helmet());

/**
 * CORS
 */
app.use(
    cors({
        origin: env.corsOrigin,
        credentials: true,
    }),
);

/**
 * Raw body parser strictly for Stripe Webhooks (Required for cryptographic signature verification)
 */
app.use(
    `${env.apiPrefix}/payments/webhook`,
    express.raw({ type: "*/*" })
);

/**
 * Body parser for standard API routes (excludes webhook route)
 */
app.use((req, res, next) => {
    if (req.originalUrl.includes("/payments/webhook") || req.path.includes("/payments/webhook")) {
        return next();
    }
    express.json({ limit: "10mb" })(req, res, (err) => {
        if (err) return next(err);
        express.urlencoded({ extended: true })(req, res, next);
    });
});

/**
 * Logging
 */
if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
}


/**
 * API routes
 */
app.use(env.apiPrefix, routes);

/**
 * 404
 */
app.use(notFoundMiddleware);

/**
 * Global error handler
 */
app.use(errorMiddleware);

export default app;