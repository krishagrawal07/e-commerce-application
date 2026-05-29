# E-Commerce Web Application

A complete basic online store with product catalog, cart, checkout, user login, role-based admin access, backend APIs, order tracking, and persistent database storage.

## Run

```bash
npm.cmd start
```

Open `http://localhost:3000`.

## Deploy

This app is Vercel-ready. Static files are served from `public/`, and API requests are handled by the serverless function in `api/index.js`.

```bash
vercel.cmd --prod
```

On Vercel, the demo database is stored in temporary function storage, so it is suitable for demos. For production, replace the local JSON adapter in `server.js` with PostgreSQL, MySQL, MongoDB, or another hosted database.

## Demo Accounts

- Admin: `admin@store.test` / `admin123`
- User: `user@store.test` / `user123`

## Features

- Product catalog with search, category filters, stock display, and add-to-cart
- Cart drawer with quantity controls, tax, shipping, and checkout
- User registration and login
- Role-based access: users can shop and track orders, admins can manage products and all orders
- Backend API for products, authentication, checkout, and order status updates
- Persistent local database in `data/store.json`

## API Overview

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/products`
- `POST /api/products` admin only
- `PUT /api/products/:id` admin only
- `DELETE /api/products/:id` admin only
- `POST /api/orders` signed-in users
- `GET /api/orders` signed-in users
- `PUT /api/orders/:id` admin only

## Database Note

This project uses a local JSON database so it runs immediately without installing MySQL, PostgreSQL, or MongoDB. The API layer is intentionally separated in `server.js`, so the read/write functions can be replaced with a SQL or MongoDB adapter later.
