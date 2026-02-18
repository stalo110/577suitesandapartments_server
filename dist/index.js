"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const http_errors_1 = __importDefault(require("http-errors"));
const db_1 = require("./db");
const UserModel_1 = require("./models/UserModel");
require("./events/registerPaymentListeners");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const suitesRoutes_1 = __importDefault(require("./routes/suitesRoutes"));
const adminSuitesRoutes_1 = __importDefault(require("./routes/adminSuitesRoutes"));
const availabilityRoutes_1 = __importDefault(require("./routes/availabilityRoutes"));
const bookingsRoutes_1 = __importDefault(require("./routes/bookingsRoutes"));
const paymentsRoutes_1 = __importDefault(require("./routes/paymentsRoutes"));
const contactRoutes_1 = __importDefault(require("./routes/contactRoutes"));
const adminContactRoutes_1 = __importDefault(require("./routes/adminContactRoutes"));
const galleryRoutes_1 = __importDefault(require("./routes/galleryRoutes"));
const adminGalleryRoutes_1 = __importDefault(require("./routes/adminGalleryRoutes"));
const reportsRoutes_1 = __importDefault(require("./routes/reportsRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const restaurantOrderRoutes_1 = __importDefault(require("./routes/restaurantOrderRoutes"));
const promotionRoutes_1 = __importDefault(require("./routes/promotionRoutes"));
const teamRoutes_1 = __importDefault(require("./routes/teamRoutes"));
const googleReviewsRoutes_1 = __importDefault(require("./routes/googleReviewsRoutes"));
const adminUserRoutes_1 = __importDefault(require("./routes/adminUserRoutes"));
const rbacService_1 = require("./services/rbacService");
dotenv_1.default.config();
const app = (0, express_1.default)();
const allowedOrigins = [
    "http://localhost:5173",
    `https://517vipsuitesandapartments.org`,
    `https://www.517vipsuitesandapartments.org`,
    `517vipsuitesandapartments.org`,
    `http://localhost:3039`,
    "http://localhost:3040",
    "http://localhost:4000",
    process.env.PUBLIC_CLIENT_URL || "",
].filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.options("*", (0, cors_1.default)(corsOptions));
app.use((0, morgan_1.default)("dev"));
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
    },
}));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.get("/health", async (_req, res) => {
    try {
        await (0, db_1.connectDB)();
        res.json({ status: "ok", database: "mysql" });
    }
    catch (error) {
        res.status(500).json({ status: "error", database: "mysql" });
    }
});
app.use(authRoutes_1.default);
app.use(suitesRoutes_1.default);
app.use(adminSuitesRoutes_1.default);
app.use(availabilityRoutes_1.default);
app.use(bookingsRoutes_1.default);
app.use(paymentsRoutes_1.default);
app.use(contactRoutes_1.default);
app.use(adminContactRoutes_1.default);
app.use(galleryRoutes_1.default);
app.use(adminGalleryRoutes_1.default);
app.use(reportsRoutes_1.default);
app.use(webhookRoutes_1.default);
app.use(restaurantOrderRoutes_1.default);
app.use(promotionRoutes_1.default);
app.use(teamRoutes_1.default);
app.use(googleReviewsRoutes_1.default);
app.use(adminUserRoutes_1.default);
app.use((req, _res, next) => {
    next((0, http_errors_1.default)(404, "Not Found"));
});
app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || "Internal server error" });
});
const startServer = async () => {
    const PORT = Number(process.env.PORT || 4000);
    const shouldSeedDemoUsers = process.env.SEED_DEMO_USERS === "true" || process.env.NODE_ENV !== "production";
    if (process.env.DB_SYNC === "true") {
        await db_1.sequelize.sync();
    }
    await (0, db_1.connectDB)();
    if (shouldSeedDemoUsers) {
        await (0, UserModel_1.ensureDemoUsers)();
    }
    await (0, rbacService_1.ensureDefaultRolesAndPermissions)();
    console.log("Database connected");
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};
startServer().catch((error) => {
    console.error("Unable to start server:", error);
});
