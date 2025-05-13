require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL-anslutning
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: 'hemlig_session_nyckel',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Middleware: inloggningskontroll
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}

// Middleware: adminkontroll
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Endast administratörer har tillgång');
}

// Root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Skyddade sidor
app.get('/user_panel', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/user_panel.html'));
});

app.get('/checkout', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/checkout.html'));
});

// Admin-skyddade sidor
app.get('/admin_panel', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/admin_panel.html'));
});

app.get('/add_product', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/add_product.html'));
});

app.get('/update_price', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/update_price.html'));
});

app.get('/remove_product', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'protected/remove_product.html'));
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

// API: Produkter
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fel vid hämtning av produkter');
  }
});

app.post('/api/products', async (req, res) => {
  const { name, price, info, image } = req.body;
  if (!name || !price || !info || !image) {
    return res.status(400).send('Alla fält krävs');
  }

  try {
    const result = await pool.query(
      'INSERT INTO products (name, price, info, image) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, price, info, image]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Kunde inte lägga till produkt');
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).send('Ingen produkt hittades med det ID:t');
    }

    res.status(200).json({ message: 'Produkten togs bort', product: result.rows[0] });
  } catch (err) {
    res.status(500).send('Kunde inte ta bort produkt');
  }
});

// API: Ordrar & användare
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fel vid hämtning av ordrar');
  }
});

app.get('/api/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Fel vid hämtning av användare');
  }
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send('E-post och lösenord krävs');
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).send('Fel e-post eller lösenord');
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).send('Fel e-post eller lösenord');
    }

    // Spara session
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email
    };

    res.status(200).json({
      message: 'Inloggad',
      role: user.role,
      name: user.name,
      email: user.email
    });

  } catch (err) {
    res.status(500).send('Serverfel vid inloggning');
  }
});

// API: Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, nummer, address, city, postal_code } = req.body;

  if (!name || !email || !password) {
    return res.status(400).send('Namn, e-post och lösenord krävs');
  }

  try {
    const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).send('E-postadressen är redan registrerad');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, nummer, address, city, postal_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, hashedPassword, nummer, address, city, postal_code]
    );

    res.status(201).json({ message: 'Användare registrerad', user: result.rows[0] });
  } catch (err) {
    res.status(500).send('Serverfel vid registrering');
  }
});

// GET – Hämta inloggad användare
app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).send('Inte inloggad');
  }
});


// IP-funktion
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) {
        return config.address;
      }
    }
  }
  return 'localhost';
}

// Starta server
app.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`Servern körs på:
  → Local:   http://localhost:${PORT}
  → Network: http://${ip}:${PORT}`);
});
