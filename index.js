require('dotenv').config();

const express = require('express');
const dbConnect = require('./config/db.js');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middleware/errorHandler');

const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});
const port = process.env.PORT || 5200;

// Make io accessible in routes
app.set('io', io);

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`=== REQUEST: ${req.method} ${req.url} ===`);
  next();
});

app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Backend connecté à MongoDB 🚀"
  });
});

// MOMENT API Routes
app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/venues', require('./routes/venues.js'));
app.use('/api/moments', require('./routes/moments.js'));
app.use('/api/bookings', require('./routes/bookings.js'));
app.use('/api/events', require('./routes/events.js'));
app.use('/api/partners', require('./routes/partners.js'));
app.use('/api/users', require('./routes/users.js'));
app.use('/api/admin', require('./routes/admin.js'));
app.use('/api/reviews', require('./routes/reviews.js'));
app.use('/api/venue-requests', require('./routes/venueRequests.js'));
app.use('/api/reports', require('./routes/reports.js'));
app.use('/api/chat', require('./routes/chat.js'));

// Error handling middleware
app.use(errorHandler);

// Socket.IO — real-time chat
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Authenticate socket with JWT
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      // Join user-specific room
      socket.join(`user:${decoded.id}`);
      console.log(`👤 Socket auth: ${decoded.id}`);
    } catch (e) {
      console.log('Socket auth failed');
    }
  }

  // Join a conversation room
  socket.on('join', (conversationId) => {
    socket.join(`conv:${conversationId}`);
  });

  // Leave a conversation room
  socket.on('leave', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
  });

  // === Voice Call Signaling ===
  socket.on('call-init', (data) => {
    io.to(`user:${data.to}`).emit('call-init', { ...data, from: data.from });
  });

  socket.on('call-answer', (data) => {
    io.to(`user:${data.to}`).emit('call-answer', data);
  });

  socket.on('call-ice-candidate', (data) => {
    io.to(`user:${data.to}`).emit('call-ice-candidate', data);
  });

  socket.on('call-end', (data) => {
    io.to(`user:${data.to}`).emit('call-ended', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// For local development
if (require.main === module) {
  const dbConnect = require('./config/db');
  dbConnect().then(() => {
    server.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`);
    });
  }).catch(err => {
    console.error("Erreur de connexion à MongoDB :", err);
  });
}

module.exports = app;
