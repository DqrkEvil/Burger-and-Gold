require("dotenv").config();
const express = require("express");
const path = require("path");
const os = require("os");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { Pool } = require("pg");
const sendEmail = require("./utils/sendEmail");


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
app.use(express.static(path.join(__dirname, "../public")));
app.use(
  session({
    secret: "hemlig_session_nyckel",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,         // sätt till true om du kör HTTPS
      maxAge: 30 * 60 * 1000 // 30 minuter i millisekunder
    }
  })
);


// Middleware: inloggningskontroll
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login.html");
}

// Middleware: adminkontroll
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  res.status(403).send("Endast administratörer har tillgång");
}

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Skyddade sidor
app.get("/user_panel", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/user_panel.html"));
});

app.get("/checkout", isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/checkout.html"));
});

// Admin-skyddade sidor
app.get("/admin_panel", isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/admin_panel.html"));
});

app.get("/add_product", isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/add_product.html"));
});

app.get("/update_price", isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/update_price.html"));
});

app.get("/remove_product", isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/remove_product.html"));
});

app.get("/order_history", isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "protected/order_history.html"))
})

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// API: Produkter
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send("Fel vid hämtning av produkter");
  }
});

app.post("/api/products", async (req, res) => {
  const { name, price, info, image, calories, ingredients } = req.body;

  // Grundläggande validering
  if (!name || !price || !info || !image || !calories || !ingredients) {
    return res.status(400).send("Alla fält krävs");
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, info, image, calories, ingredients)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, price, info, image, calories, ingredients]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Kunde inte lägga till produkt");
  }
});

// Hämta en enskild produkt via ID
app.get("/api/product/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).send("Produkten hittades inte");
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fel vid hämtning av produkt:", err);
    res.status(500).send("Kunde inte hämta produkt");
  }
});


app.delete("/api/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("Ingen produkt hittades med det ID:t");
    }

    res.status(200).json({
      message: "Produkten togs bort",
      product: result.rows[0],
    });
  } catch (err) {
    res.status(500).send("Kunde inte ta bort produkt");
  }
});

// API: Ordrar & användare
app.get("/api/orders", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        orders.*,
        users.name AS customer_name,
        users.email AS customer_email,
        users.address,
        users.city,
        users.postal_code,
        users.nummer
      FROM orders
      JOIN users ON orders.customer_id = users.id
      ORDER BY orders.order_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Fel vid hämtning av ordrar:", err);
    res.status(500).send("Serverfel vid hämtning av ordrar");
  }
});

app.get("/api/users", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    res.status(500).send("Fel vid hämtning av användare");
  }
});

// API: Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("E-post och lösenord krävs");
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).send("Fel e-post eller lösenord");
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).send("Fel e-post eller lösenord");
    }

    // Spara session
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
    };

    res.status(200).json({
      message: "Inloggad",
      role: user.role,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    res.status(500).send("Serverfel vid inloggning");
  }
});

// API: Register
app.post("/api/register", async (req, res) => {
  const { name, email, password, nummer, address, city, postal_code } =
    req.body;

  if (!name || !email || !password) {
    return res.status(400).send("Namn, e-post och lösenord krävs");
  }

  try {
    const checkUser = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (checkUser.rows.length > 0) {
      return res.status(400).send("E-postadressen är redan registrerad");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, nummer, address, city, postal_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, hashedPassword, nummer, address, city, postal_code]
    );

    res.status(201).json({
      message: "Användare registrerad",
      user: result.rows[0],
    });
  } catch (err) {
    res.status(500).send("Serverfel vid registrering");
  }
});

// GET – Hämta inloggad användare
app.get("/api/me", (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).send("Inte inloggad");
  }
});


app.get("/api/user/me", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const result = await pool.query(
      `SELECT id, name, email, nummer, address, city, postal_code
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Användare hittades inte");
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fel vid hämtning av användare:", err);
    res.status(500).send("Serverfel");
  }
});

app.put("/api/user/me", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;
  const { name, email, nummer, address, city, postal_code } = req.body;

  try {
    await pool.query(
      `UPDATE users SET
         name = $1,
         email = $2,
         nummer = $3,
         address = $4,
         city = $5,
         postal_code = $6
       WHERE id = $7`,
      [name, email, nummer, address, city, postal_code, userId]
    );

    // Uppdatera sessionsinfo
    req.session.user.name = name;
    req.session.user.email = email;

    res.status(200).send("Informationen har uppdaterats");
  } catch (err) {
    console.error("Fel vid uppdatering av användare:", err);
    res.status(500).send("Serverfel");
  }
});

app.put("/api/user/password", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).send("Både nuvarande och nytt lösenord krävs");
  }

  try {
    const result = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Användare hittades inte");
    }

    const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!passwordMatch) {
      return res.status(401).send("Fel nuvarande lösenord");
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [newHashedPassword, userId]
    );

    res.status(200).send("Lösenordet har uppdaterats");
  } catch (err) {
    console.error("Fel vid lösenordsbyte:", err);
    res.status(500).send("Serverfel");
  }
});


// IP-funktion
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "localhost";
}
app.post("/api/checkout", isAuthenticated, async (req, res) => {
  try {
    const cart = req.body.cart;
    const user = req.session.user;

    if (!cart || cart.length === 0) {
      return res.status(400).send("Varukorgen är tom");
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const delivery_address = req.body.delivery_address || user.address || "-";
    const special_instruction = req.body.special_instruction || "";

    // 1. Spara order i databasen
    const orderResult = await pool.query(
      `INSERT INTO orders (customer_id, order_date, status, total_amount, delivery_address, special_instruction)
       VALUES ($1, NOW(), $2, $3, $4, $5)
       RETURNING order_id`,
      [user.id, 'mottagen', total, delivery_address, special_instruction]
    );

    const orderId = orderResult.rows[0].order_id;

    // 2. Skapa orderbekräftelse
    const items = cart.map(
      (item) => `${item.name} (${item.quantity} st) – ${item.price}:-`
    ).join("\n");

    const message = `
Hej ${user.name}!

Tack för din beställning hos Burger & Gold.

Ordernummer: ${orderId}
-----------------------
${items}

Totalt: ${total.toFixed(2)}:-
Leveransadress: ${delivery_address}
Noteringar: ${special_instruction}

Vi återkommer med leveransinfo inom 45 minuter.

Med vänlig hälsning,
Burger & Gold
    `;

    // 3. Skicka e-post
    await sendEmail(user.email, "Orderbekräftelse – Burger & Gold", message);

    res.status(200).send("Order sparad och e-post skickad");

  } catch (err) {
    console.error("Fel vid checkout:", err);
    res.status(500).send("Kunde inte spara order");
  }
});

app.get("/api/my-orders", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const result = await pool.query(
      `SELECT 
         o.order_id,
         o.order_date,
         o.status,
         o.total_amount,
         o.delivery_address,
         o.special_instruction,
         u.name,
         u.email,
         u.address,
         u.city,
         u.postal_code,
         u.nummer
       FROM orders o
       JOIN users u ON o.customer_id = u.id
       WHERE o.customer_id = $1
       ORDER BY o.order_date DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fel vid hämtning av orderhistorik:", err);
    res.status(500).send("Kunde inte hämta orderhistorik");
  }
});



// Starta server
app.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`Servern körs på:
  → Local:   http://localhost:${PORT}
  → Network: http://${ip}:${PORT}`);
});
