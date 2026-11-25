import { env } from './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import healthRouter from './routes/healthRoutes.js';
import groupsRouter from './routes/groupsRoutes.js';
import authRouter from './routes/authRoutes.js'
import { pinoHttp } from 'pino-http';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { logger } from './logger.js';

export const app = express();

app.use(helmet())
app.use(pinoHttp({ logger }))

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use(healthRouter)
app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);

app.use(errorHandler);