import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { ensureSystemBootstrap } from './database/bootstrap.js';

import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import studentRoutes from './modules/students/student.routes.js';
import mentorshipRoutes from './modules/mentorship/mentorship.routes.js';
import meetingRoutes from './modules/meetings/meeting.routes.js';
import counsellingRoutes from './modules/counselling/counselling.routes.js';
import progressRoutes from './modules/monthly-progress/progress.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import pdfRoutes from './modules/pdf/pdf.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import reportRoutes from './modules/reports/report.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import schoolRoutes from './modules/schools/school.routes.js';

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

// Static Document Storage Server
const uploadsPath = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'KSRCE Digital Mentor-Mentee API',
    institution: 'K.S.R. College of Engineering (Autonomous)',
    timestamp: new Date().toISOString(),
  });
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

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    statusCode: err.status || 500,
    message: err.message || 'Internal institutional server error.',
    meta: { timestamp: new Date().toISOString() },
  });
});

// Server Initialization
async function startServer() {
  try {
    // Clean Institutional Bootstrap: Synchronize schema indexes, master lookups & admin account only
    await ensureSystemBootstrap();

    app.listen(PORT, () => {
      console.log(`============================================================`);
      console.log(`KSRCE Digital Mentor-Mentee Management Server`);
      console.log(`K.S.R. College of Engineering (Tiruchengode)`);
      console.log(`Running on: http://localhost:${PORT}`);
      console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
      console.log(`Static file storage: ${uploadsPath}`);
      console.log(`============================================================`);
    });
  } catch (err: any) {
    console.error('Failed to initialize server:', err.message);
    process.exit(1);
  }
}

startServer();

export default app;
