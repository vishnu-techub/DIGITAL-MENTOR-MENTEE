import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB, isDBConnected } from './config/database.js';
import { ensureSystemBootstrap } from './database/bootstrap.js';
import { authenticate } from './middleware/auth.middleware.js';
import { serveLegacyUpload } from './modules/documents/document.controller.js';

import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import studentRoutes from './modules/students/student.routes.js';
import mentorshipRoutes from './modules/mentorship/mentorship.routes.js';
import meetingRoutes from './modules/meetings/meeting.routes.js';
import counsellingRoutes from './modules/counselling/counselling.routes.js';
import progressRoutes from './modules/monthly-progress/progress.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import { scheduleMeetingNotificationSync } from './modules/notifications/notification.service.js';
import pdfRoutes from './modules/pdf/pdf.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import schoolRoutes from './modules/schools/school.routes.js';
import studentProgressRoutes from './modules/student-progress/student-progress.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5050;

// Security & Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// ---------------------------------------------------------------------------
// Document storage is PRIVATE student data.
// The previous public `express.static('/uploads')` mount allowed anyone holding
// a URL to read any student's certificates. It is replaced by an authenticated,
// ownership-checked handler that resolves the file through its StudentDocument
// record, so existing stored fileUrl values keep working without being public.
// ---------------------------------------------------------------------------
app.get('/uploads/*', authenticate, (req, res, next) => {
  const params = req.params as Record<string, string | undefined>;
  const wildcard = params['0'] ?? params['splat'];
  if (wildcard) (req.params as any)[0] = wildcard;
  return serveLegacyUpload(req as any, res).catch(next);
});

// Institutional Database Health Check Endpoint (Requirement 13)
app.get('/api/health', (req, res) => {
  if (isDBConnected()) {
    return res.status(200).json({
      status: 'ok',
      database: 'connected',
    });
  }

  return res.status(503).json({
    status: 'error',
    database: 'disconnected',
  });
});

// Guard: API routes require active MongoDB connection before processing operations
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      statusCode: 503,
      message: 'Service Unavailable: MongoDB Atlas connection is currently inactive. Please wait.',
    });
  }
  next();
});

// Mount Institutional API Modules
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/mentor', mentorshipRoutes); // Alias for mentor-scoped paths
app.use('/api/meetings', meetingRoutes);
app.use('/api/counselling', counsellingRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/student/progress', studentProgressRoutes);
app.use('/api/students/progress', studentProgressRoutes);

// Catch-all 404 for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `API endpoint '${req.method} ${req.path}' not found.`,
    meta: { timestamp: new Date().toISOString() },
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  const status = Number(err.status || err.statusCode) || 500;
  // In production or for 500s, never expose raw exception stack traces or DB errors to client
  const safeMessage = status === 500
    ? 'Something went wrong on our side. Please try again later.'
    : (err.message || 'An unexpected institutional error occurred.');

  res.status(status).json({
    success: false,
    statusCode: status,
    message: safeMessage,
    meta: { timestamp: new Date().toISOString() },
  });
});

// Server Initialization
async function startServer() {
  try {
    // 1. Establish persistent MongoDB Atlas connection and wait for it before any operations
    await connectDB();

    // 2. Synchronize indexes and non-destructive system defaults (Admin account, Feeder schools, master lookups)
    await ensureSystemBootstrap();

    // 3. Start automatic meeting-reminder synchronisation. Reminders must fire
    //    without an operator pressing a button, so the scheduler runs at boot
    //    and then hourly. It shares its logic with the manual admin endpoint.
    scheduleMeetingNotificationSync();

    // 4. Start listening for incoming API requests
    app.listen(PORT, () => {
      console.log(`============================================================`);
      console.log(`KSRCE Digital Mentor-Mentee Management Server`);
      console.log(`K.S.R. College of Engineering (Tiruchengode)`);
      console.log(`Running on: http://localhost:${PORT}`);
      console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
      console.log(`Secure document storage (authenticated): ${path.resolve(process.cwd(), 'uploads', 'documents')}`);
      console.log(`============================================================`);
    });
  } catch (err: any) {
    console.error('Failed to initialize server:', err.message);
    process.exit(1);
  }
}

startServer();

export default app;
