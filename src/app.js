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
 * Body parser
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

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