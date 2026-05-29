const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "commerce-desk-data") : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "store.json");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "dev-secret-change-me";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const seed = {
  users: [
    {
      id: "usr_admin",
      name: "Admin Manager",
      email: "admin@store.test",
      role: "admin",
      passwordHash: hashPassword("admin123")
    },
    {
      id: "usr_customer",
      name: "Demo Customer",
      email: "user@store.test",
      role: "user",
      passwordHash: hashPassword("user123")
    }
  ],
  products: [
    {
      id: "prd_headphones",
      name: "AeroTune Wireless Headphones",
      category: "Audio",
      price: 129.99,
      stock: 32,
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
      description: "Comfortable over-ear headphones with active noise reduction and 32-hour battery life.",
      featured: true
    },
    {
      id: "prd_watch",
      name: "PulsePro Smart Watch",
      category: "Wearables",
      price: 189.0,
      stock: 18,
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
      description: "Fitness tracking, notifications, water resistance, and a bright always-on display.",
      featured: true
    },
    {
      id: "prd_bag",
      name: "MetroPack Laptop Backpack",
      category: "Accessories",
      price: 74.5,
      stock: 45,
      image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
      description: "Weather-resistant daily backpack with padded laptop storage and quick-access pockets.",
      featured: false
    },
    {
      id: "prd_keyboard",
      name: "KeyLite Mechanical Keyboard",
      category: "Computing",
      price: 98.25,
      stock: 21,
      image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",
      description: "Compact mechanical keyboard with hot-swap switches and soft white backlighting.",
      featured: true
    },
    {
      id: "prd_camera",
      name: "SnapFrame Travel Camera",
      category: "Photography",
      price: 349.99,
      stock: 9,
      image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
      description: "Lightweight camera with sharp 4K recording, travel lens, and fast autofocus.",
      featured: false
    },
    {
      id: "prd_lamp",
      name: "LumaDesk LED Lamp",
      category: "Home Office",
      price: 52.0,
      stock: 27,
      image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
      description: "Adjustable desk lamp with warm/cool modes, touch controls, and USB charging.",
      featured: false
    }
  ],
  orders: []
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDb(seed);
  }
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
}

async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function sign(value) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");
}

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 8 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (signature !== sign(payload)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

async function getCurrentUser(req, db) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parsed = parseToken(token);
  if (!parsed) return null;
  const user = db.users.find((item) => item.id === parsed.id);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function requireUser(user, res) {
  if (!user) {
    send(res, 401, { error: "Please sign in to continue." });
    return false;
  }
  return true;
}

function requireAdmin(user, res) {
  if (!requireUser(user, res)) return false;
  if (user.role !== "admin") {
    send(res, 403, { error: "Admin access is required." });
    return false;
  }
  return true;
}

function sanitizeProduct(body, existing = {}) {
  const price = Number(body.price);
  const stock = Number.parseInt(body.stock, 10);
  if (!body.name || !body.category || !body.description) {
    throw new Error("Name, category, and description are required.");
  }
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a valid number.");
  if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a valid whole number.");
  return {
    ...existing,
    name: String(body.name).trim(),
    category: String(body.category).trim(),
    price,
    stock,
    image: String(body.image || "").trim() || existing.image || "",
    description: String(body.description).trim(),
    featured: Boolean(body.featured)
  };
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function handleApi(req, res, url) {
  const db = await readDb();
  const user = await getCurrentUser(req, db);
  const method = req.method;
  const pathname = url.pathname;

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await getBody(req);
    const found = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!found || found.passwordHash !== hashPassword(body.password || "")) {
      send(res, 401, { error: "Invalid email or password." });
      return;
    }
    send(res, 200, { token: createToken(found), user: publicUser(found) });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await getBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    if (!name || !email.includes("@") || password.length < 6) {
      send(res, 400, { error: "Enter a name, valid email, and password with at least 6 characters." });
      return;
    }
    if (db.users.some((item) => item.email.toLowerCase() === email)) {
      send(res, 409, { error: "An account with this email already exists." });
      return;
    }
    const created = {
      id: `usr_${crypto.randomUUID()}`,
      name,
      email,
      role: "user",
      passwordHash: hashPassword(password)
    };
    db.users.push(created);
    await writeDb(db);
    send(res, 201, { token: createToken(created), user: publicUser(created) });
    return;
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    send(res, 200, { user });
    return;
  }

  if (method === "GET" && pathname === "/api/products") {
    const q = String(url.searchParams.get("q") || "").toLowerCase();
    const category = String(url.searchParams.get("category") || "");
    let products = db.products;
    if (q) {
      products = products.filter((item) =>
        [item.name, item.category, item.description].join(" ").toLowerCase().includes(q)
      );
    }
    if (category) products = products.filter((item) => item.category === category);
    send(res, 200, { products, categories: [...new Set(db.products.map((item) => item.category))].sort() });
    return;
  }

  if (method === "POST" && pathname === "/api/products") {
    if (!requireAdmin(user, res)) return;
    try {
      const product = sanitizeProduct(await getBody(req));
      product.id = `prd_${crypto.randomUUID()}`;
      db.products.unshift(product);
      await writeDb(db);
      send(res, 201, { product });
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method === "PUT") {
    if (!requireAdmin(user, res)) return;
    const product = db.products.find((item) => item.id === productMatch[1]);
    if (!product) return notFound(res);
    try {
      Object.assign(product, sanitizeProduct(await getBody(req), product));
      await writeDb(db);
      send(res, 200, { product });
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }

  if (productMatch && method === "DELETE") {
    if (!requireAdmin(user, res)) return;
    const before = db.products.length;
    db.products = db.products.filter((item) => item.id !== productMatch[1]);
    if (db.products.length === before) return notFound(res);
    await writeDb(db);
    send(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && pathname === "/api/orders") {
    if (!requireUser(user, res)) return;
    const body = await getBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      send(res, 400, { error: "Your cart is empty." });
      return;
    }
    const orderItems = [];
    for (const item of items) {
      const product = db.products.find((entry) => entry.id === item.productId);
      const quantity = Number.parseInt(item.quantity, 10);
      if (!product || !Number.isInteger(quantity) || quantity < 1) {
        send(res, 400, { error: "Cart contains an invalid item." });
        return;
      }
      if (product.stock < quantity) {
        send(res, 409, { error: `${product.name} has only ${product.stock} in stock.` });
        return;
      }
      orderItems.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.image
      });
    }
    for (const item of orderItems) {
      const product = db.products.find((entry) => entry.id === item.productId);
      product.stock -= item.quantity;
    }
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal > 150 ? 0 : 12;
    const tax = subtotal * 0.0825;
    const total = subtotal + shipping + tax;
    const order = {
      id: `ord_${crypto.randomUUID()}`,
      userId: user.id,
      customer: user.name,
      email: user.email,
      items: orderItems,
      subtotal,
      shipping,
      tax,
      total,
      status: "Processing",
      address: String(body.address || "").trim(),
      createdAt: new Date().toISOString()
    };
    db.orders.unshift(order);
    await writeDb(db);
    send(res, 201, { order });
    return;
  }

  if (method === "GET" && pathname === "/api/orders") {
    if (!requireUser(user, res)) return;
    const orders = user.role === "admin" ? db.orders : db.orders.filter((item) => item.userId === user.id);
    send(res, 200, { orders });
    return;
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && method === "PUT") {
    if (!requireAdmin(user, res)) return;
    const order = db.orders.find((item) => item.id === orderMatch[1]);
    if (!order) return notFound(res);
    const body = await getBody(req);
    const allowed = ["Processing", "Packed", "Shipped", "Delivered", "Cancelled"];
    if (!allowed.includes(body.status)) {
      send(res, 400, { error: "Choose a valid order status." });
      return;
    }
    order.status = body.status;
    await writeDb(db);
    send(res, 200, { order });
    return;
  }

  notFound(res);
}

async function serveStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) return notFound(res);
  try {
    const body = await fs.readFile(resolved);
    res.writeHead(200, { "Content-Type": MIME[path.extname(resolved)] || "application/octet-stream" });
    res.end(body);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(fallback);
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (error) {
      send(res, 500, { error: error.message || "Server error" });
    }
  });
}

async function handleVercelRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    await handleApi(req, res, url);
  } catch (error) {
    send(res, 500, { error: error.message || "Server error" });
  }
}

if (require.main === module) {
  ensureDb().then(() => {
    createServer().listen(PORT, () => {
      console.log(`E-commerce app running at http://localhost:${PORT}`);
      console.log("Demo admin: admin@store.test / admin123");
      console.log("Demo user: user@store.test / user123");
    });
  });
}

module.exports = {
  createServer,
  handleVercelRequest
};
