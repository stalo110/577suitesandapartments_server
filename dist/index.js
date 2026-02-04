"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const http_errors_1 = __importDefault(require("http-errors"));
const serverless_http_1 = __importDefault(require("serverless-http"));
const db_1 = require("./db");
const UserModel_1 = require("./models/UserModel");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const suitesRoutes_1 = __importDefault(require("./routes/suitesRoutes"));
const adminSuitesRoutes_1 = __importDefault(require("./routes/adminSuitesRoutes"));
const availabilityRoutes_1 = __importDefault(require("./routes/availabilityRoutes"));
const bookingsRoutes_1 = __importDefault(require("./routes/bookingsRoutes"));
const paymentsRoutes_1 = __importDefault(require("./routes/paymentsRoutes"));
const contactRoutes_1 = __importDefault(require("./routes/contactRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const allowedOrigins = [
    'http://localhost:5173',
    `http://localhost:3039`,
    'http://localhost:3040',
    'http://localhost:4000',
    process.env.PUBLIC_CLIENT_URL || '',
].filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.get('/health', async (_req, res) => {
    try {
        await (0, db_1.connectDB)();
        res.json({ status: 'ok', database: 'mysql' });
    }
    catch (error) {
        res.status(500).json({ status: 'error', database: 'mysql' });
    }
});
app.use(authRoutes_1.default);
app.use(suitesRoutes_1.default);
app.use(adminSuitesRoutes_1.default);
app.use(availabilityRoutes_1.default);
app.use(bookingsRoutes_1.default);
app.use(paymentsRoutes_1.default);
app.use(contactRoutes_1.default);
app.use((req, _res, next) => {
    next((0, http_errors_1.default)(404, 'Not Found'));
});
app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Internal server error' });
});
exports.handler = (0, serverless_http_1.default)(app);
if (process.env.NODE_ENV !== 'production') {
    const PORT = Number(process.env.PORT || 4000);
    db_1.sequelize
        .sync()
        .then(async () => {
        await (0, UserModel_1.ensureDemoUsers)();
        await (0, db_1.connectDB)();
        // await sequelize.sync({ alter: true });
        console.log(`Database connected`);
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
        .catch((error) => {
        console.error('Unable to start server:', error);
    });
}
