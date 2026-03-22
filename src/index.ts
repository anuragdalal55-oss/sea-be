import dns from 'dns';
dns.setDefaultResultOrder('ipv4first'); // Fix: Supabase ENOTFOUND on Windows Node.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import profileRoutes from './routes/profiles';
import mawbRoutes from './routes/mawbs';
import hawbRoutes from './routes/hawbs';
import transmissionRoutes from './routes/transmissions';
import locationRoutes from './routes/locations';
import igmRoutes from './routes/igm';
import egmRoutes from './routes/egm';
import reportsRoutes from './routes/reports';
import path from 'path/win32';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Your Firebase URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/mawbs', mawbRoutes);
app.use('/api/hawbs', hawbRoutes);
app.use('/api/transmissions', transmissionRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/igm', igmRoutes);
app.use('/api/egm', egmRoutes);
app.use('/api/reports', reportsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Serve React Static Files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Handle React Routing (SPA)
app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 EDISS Backend running on http://localhost:${PORT}`);
});

export default app;
