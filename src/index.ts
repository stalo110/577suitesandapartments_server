import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import cors, { CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import createError from 'http-errors';
import serverless from 'serverless-http';
import { connectDB, sequelize } from './db';
import { ensureDemoUsers } from './models/UserModel';

import AuthRouter from './routes/authRoutes';
import SuitesRouter from './routes/suitesRoutes';
import AdminSuitesRouter from './routes/adminSuitesRoutes';
import AvailabilityRouter from './routes/availabilityRoutes';
import BookingsRouter from './routes/bookingsRoutes';
import PaymentsRouter from './routes/paymentsRoutes';

dotenv.config();

const app = express();

const allowedOrigins: string[] = [
  'http://localhost:5173',
  `http://localhost:3039`,
  'http://localhost:3040',
  'http://localhost:4000',
  process.env.PUBLIC_CLIENT_URL || '',
].filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', async (_req: Request, res: Response) => {
  try {
    await connectDB();
    res.json({ status: 'ok', database: 'mysql' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'mysql' });
  }
});

app.use(AuthRouter);
app.use(SuitesRouter);
app.use(AdminSuitesRouter);
app.use(AvailabilityRouter);
app.use(BookingsRouter);
app.use(PaymentsRouter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(createError(404, 'Not Found'));
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

export const handler = serverless(app);

if (process.env.NODE_ENV !== 'production') {
  const PORT = Number(process.env.PORT || 4000);
  sequelize
    .sync()
    .then(async () => {
      await ensureDemoUsers();
      await connectDB();
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
