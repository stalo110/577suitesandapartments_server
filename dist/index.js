"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const serverless_http_1 = __importDefault(require("serverless-http"));
const http_errors_1 = __importDefault(require("http-errors"));
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const eventsRoutes_1 = __importDefault(require("./routes/eventsRoutes"));
const guestRoutes_1 = __importDefault(require("./routes/guestRoutes"));
const whatsappRoutes_1 = __importDefault(require("./routes/whatsappRoutes"));
const dbConnect_1 = require("./library/middlewares/dbConnect");
dotenv_1.default.config();
const app = (0, express_1.default)();
const allowedOrigins = [
    "http://localhost:3039",
    "localhost:3039",
    "http://192.168.0.197:3039",
    "http://100.64.100.6:3039",
    "https://www.softinvite.com",
    "https://softinvite.com",
    "http://localhost:3000",
    "https://softinvite-scan.vercel.app",
];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
// --- Middleware ---
app.use((0, morgan_1.default)("dev"));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use(dbConnect_1.dbConnect); // ensures DB connection before any route
// --- Routes ---
app.use("/admin", adminRoutes_1.default);
app.use("/events", eventsRoutes_1.default);
app.use("/guest", guestRoutes_1.default);
app.use("/whatsapp", whatsappRoutes_1.default);
// --- Error handler ---
app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    const response = {
        message: err.message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    };
    res.status(status).json(response);
});
// --- 404 handler ---
app.use((req, res, next) => {
    next((0, http_errors_1.default)(404, "Not Found"));
});
// --- Lambda handler ---
exports.handler = (0, serverless_http_1.default)(app);
// --- Local dev server ---
if (process.env.NODE_ENV === "development") {
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
