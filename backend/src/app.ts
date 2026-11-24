import express from 'express';
import cors from 'cors';
import groupsRouter from './routes/groupsRoutes.js';
import { env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { currentUser } from './middleware/currentUser.js';

export const app = express();

app.use(express.json());

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

app.use('/api/groups', currentUser, groupsRouter);

app.use(errorHandler);