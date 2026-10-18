const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const config = require('./config');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientApiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set true if behind HTTPS reverse proxy
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

// Serve static uploads (logos, banners, mod files)
app.use('/uploads', express.static(config.UPLOADS_DIR));

// Serve Admin Dashboard
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// Mount routers
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api/client', clientApiRoutes);

// Root route redirects to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Start Server
app.listen(config.PORT, () => {
  console.log(`===============================================`);
  console.log(`  EsquizoStudios Server activo en puerto ${config.PORT}`);
  console.log(`  Panel Admin: http://localhost:${config.PORT}/admin`);
  console.log(`  API Cliente: http://localhost:${config.PORT}/api/client`);
  console.log(`===============================================`);
});
