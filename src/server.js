import app from "./app.js";
import env from "./config/env.js";

const server = app.listen(env.port, () => {
  console.log(`🚀 RouteK9 Backend running on http://localhost:${env.port}`);
});
