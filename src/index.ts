import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";
import { connectDB, sequelize } from "./db";
import { ensureDemoUsers } from "./models/UserModel";

import AuthRouter from "./routes/authRoutes";
import SuitesRouter from "./routes/suitesRoutes";
import AdminSuitesRouter from "./routes/adminSuitesRoutes";
import AvailabilityRouter from "./routes/availabilityRoutes";
import BookingsRouter from "./routes/bookingsRoutes";
import PaymentsRouter from "./routes/paymentsRoutes";
import ContactRouter from "./routes/contactRoutes";
import GalleryRouter from "./routes/galleryRoutes";
import AdminGalleryRouter from "./routes/adminGalleryRoutes";
import ReportsRouter from "./routes/reportsRoutes";

dotenv.config();

const app = express();

const allowedOrigins: string[] = [
  "http://localhost:5173",
  `https://517vipsuitesandapartments.org`,
  `https://www.517vipsuitesandapartments.org`,
  `517vipsuitesandapartments.org`,
  `http://localhost:3039`,
  "http://localhost:3040",
  "http://localhost:4000",
  process.env.PUBLIC_CLIENT_URL || "",
].filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await connectDB();
    res.json({ status: "ok", database: "mysql" });
  } catch (error) {
    res.status(500).json({ status: "error", database: "mysql" });
  }
});

app.use(AuthRouter);
app.use(SuitesRouter);
app.use(AdminSuitesRouter);
app.use(AvailabilityRouter);
app.use(BookingsRouter);
app.use(PaymentsRouter);
app.use(ContactRouter);
app.use(GalleryRouter);
app.use(AdminGalleryRouter);
app.use(ReportsRouter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(createError(404, "Not Found"));
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal server error" });
});

const startServer = async () => {
  const PORT = Number(process.env.PORT || 4000);
  const shouldSeedDemoUsers =
    process.env.SEED_DEMO_USERS === "true" || process.env.NODE_ENV !== "production";

  if (process.env.DB_SYNC === "true") {
    await sequelize.sync();
  }

  await connectDB();
  if (shouldSeedDemoUsers) {
    await ensureDemoUsers();
  }

  console.log("Database connected");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Unable to start server:", error);
});
