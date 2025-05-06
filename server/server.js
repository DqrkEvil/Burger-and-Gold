const express = require('express');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',           // Change this if needed
  host: 'localhost',
  database: 'burgerngold',
  password: 'majd1324', // Replace with your password
  port: 5432,
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API ROUTES
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching products');
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching orders');
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching users');
  }
});

// Get local IP
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

// Start server
app.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`Server is running at:
  → Local:   http://localhost:${PORT}
  → Network: http://${ip}:${PORT}`);
});


app.post('/api/products', async (req, res) => {
  const { name, price, info } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO products (name, price, info) VALUES ($1, $2, $3) RETURNING *',
      [name, price, info]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Fel vid produktinläggning:', err);
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
    console.error('Fel vid borttagning:', err);
    res.status(500).send('Kunde inte ta bort produkt');
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;

  try {
    const result = await pool.query(
      'UPDATE products SET price = $1 WHERE id = $2 RETURNING *',
      [price, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send('Ingen produkt hittades med det ID:t');
    }

    res.status(200).json({ message: 'Pris uppdaterat', product: result.rows[0] });
  } catch (err) {
    console.error('Fel vid prisuppdatering:', err);
    res.status(500).send('Kunde inte uppdatera pris');
  }
});


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND password = $2',
      [email, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).send('Fel e-post eller lösenord');
    }

    // Inloggning lyckades
    res.status(200).json({ message: 'Inloggad', user: result.rows[0] });
  } catch (err) {
    console.error('Fel vid inloggning:', err);
    res.status(500).send('Serverfel vid inloggning');
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password, nummer, address, city, postal_code } = req.body;

  try {
    const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      return res.status(400).send('E-postadressen är redan registrerad');
    }

    const result = await pool.query(
      `INSERT INTO users (name, email, password, nummer, address, city, postal_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, password, nummer, address, city, postal_code]
    );

    res.status(201).json({ message: 'Användare registrerad', user: result.rows[0] });
  } catch (err) {
    console.error('Fel vid registrering:', err);
    res.status(500).send('Serverfel vid registrering');
  }
});
