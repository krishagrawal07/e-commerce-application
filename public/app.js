const state = {
  user: JSON.parse(localStorage.getItem("shop:user") || "null"),
  token: localStorage.getItem("shop:token") || "",
  products: [],
  categories: [],
  cart: JSON.parse(localStorage.getItem("shop:cart") || "[]"),
  orders: [],
  view: "store",
  authMode: "login"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Something went wrong.");
    return payload;
  });
}

function toast(message) {
  const toastEl = $("#toast");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

function saveSession(user, token) {
  state.user = user;
  state.token = token;
  if (user && token) {
    localStorage.setItem("shop:user", JSON.stringify(user));
    localStorage.setItem("shop:token", token);
  } else {
    localStorage.removeItem("shop:user");
    localStorage.removeItem("shop:token");
  }
  renderAuth();
}

function saveCart() {
  localStorage.setItem("shop:cart", JSON.stringify(state.cart));
  renderCart();
}

function setView(view) {
  state.view = view;
  $$(".view").forEach((item) => item.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".nav-link").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  if (view === "orders") loadOrders();
  if (view === "admin") renderAdminProducts();
}

async function loadProducts() {
  const q = encodeURIComponent($("#searchInput").value.trim());
  const category = encodeURIComponent($("#categoryFilter").value);
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (category) query.set("category", category);
  const payload = await api(`/api/products?${query.toString()}`);
  state.products = payload.products;
  state.categories = payload.categories;
  renderCategoryFilter();
  renderProducts();
  renderAdminProducts();
  renderCart();
}

async function loadOrders() {
  if (!state.user) {
    $("#ordersList").innerHTML = emptyState("Sign in to view your orders.");
    return;
  }
  const payload = await api("/api/orders");
  state.orders = payload.orders;
  renderOrders();
}

function renderAuth() {
  $("#authButton").textContent = state.user ? `${state.user.name} (${state.user.role})` : "Sign in";
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", state.user?.role !== "admin"));
  if (state.user?.role !== "admin" && state.view === "admin") setView("store");
}

function renderCategoryFilter() {
  const current = $("#categoryFilter").value;
  $("#categoryFilter").innerHTML = `<option value="">All categories</option>${state.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
  $("#categoryFilter").value = current;
}

function renderProducts() {
  const grid = $("#productGrid");
  if (!state.products.length) {
    grid.innerHTML = emptyState("No products match your filters.");
    return;
  }
  grid.innerHTML = state.products
    .map(
      (product) => `
      <article class="product-card">
        <div class="product-media">
          <img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy" />
          ${product.featured ? `<span class="badge">Featured</span>` : ""}
        </div>
        <div class="product-body">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.description)}</p>
          </div>
          <div class="product-meta">
            <span class="price">${money(product.price)}</span>
            <span class="stock ${product.stock < 10 ? "low" : ""}">${product.stock} in stock</span>
          </div>
          <button class="button" data-add="${product.id}" ${product.stock < 1 ? "disabled" : ""}>Add to cart</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount").textContent = count;
  if (!state.cart.length) {
    $("#cartItems").innerHTML = emptyState("Your cart is empty.");
  } else {
    $("#cartItems").innerHTML = state.cart
      .map((item) => {
        const product = state.products.find((entry) => entry.id === item.productId) || item;
        return `
          <div class="cart-item">
            <img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" />
            <div>
              <div class="cart-row">
                <strong>${escapeHtml(product.name)}</strong>
                <button class="icon-button" data-remove="${item.productId}" title="Remove" aria-label="Remove">x</button>
              </div>
              <p>${money(product.price)}</p>
              <div class="qty">
                <button data-dec="${item.productId}" type="button">-</button>
                <strong>${item.quantity}</strong>
                <button data-inc="${item.productId}" type="button">+</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }
  const subtotal = state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.productId) || item;
    return sum + product.price * item.quantity;
  }, 0);
  const shipping = subtotal === 0 || subtotal > 150 ? 0 : 12;
  const tax = subtotal * 0.0825;
  $("#cartSubtotal").textContent = money(subtotal);
  $("#cartShipping").textContent = money(shipping);
  $("#cartTax").textContent = money(tax);
  $("#cartTotal").textContent = money(subtotal + shipping + tax);
}

function renderOrders() {
  const list = $("#ordersList");
  if (!state.orders.length) {
    list.innerHTML = emptyState("No orders yet.");
    return;
  }
  list.innerHTML = state.orders
    .map(
      (order) => `
      <article class="order-card">
        <div class="order-head">
          <div>
            <strong>${order.id.slice(0, 12)}</strong>
            <p>${new Date(order.createdAt).toLocaleString()} - ${escapeHtml(order.customer)}</p>
          </div>
          ${
            state.user?.role === "admin"
              ? `<select data-status="${order.id}" aria-label="Update order status">
                  ${["Processing", "Packed", "Shipped", "Delivered", "Cancelled"]
                    .map((status) => `<option ${status === order.status ? "selected" : ""}>${status}</option>`)
                    .join("")}
                </select>`
              : `<span class="status">${escapeHtml(order.status)}</span>`
          }
        </div>
        <div class="order-items">
          ${order.items
            .map(
              (item) => `
              <div class="order-line">
                <img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" />
                <span>${escapeHtml(item.name)} x ${item.quantity}</span>
                <strong>${money(item.price * item.quantity)}</strong>
              </div>
            `
            )
            .join("")}
        </div>
        <div class="cart-row"><span>${escapeHtml(order.address || "No address entered")}</span><strong>${money(order.total)}</strong></div>
      </article>
    `
    )
    .join("");
}

function renderAdminProducts() {
  if (state.user?.role !== "admin") return;
  $("#adminProducts").innerHTML = state.products
    .map(
      (product) => `
      <div class="admin-product">
        <img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" />
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <p>${escapeHtml(product.category)} - ${money(product.price)} - ${product.stock} stock</p>
        </div>
        <div class="admin-actions">
          <button class="button secondary" data-edit="${product.id}">Edit</button>
          <button class="button danger" data-delete="${product.id}">Delete</button>
        </div>
      </div>
    `
    )
    .join("");
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || product.stock < 1) return;
  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) {
    if (existing.quantity >= product.stock) return toast("No more stock available for that item.");
    existing.quantity += 1;
  } else {
    state.cart.push({ productId, quantity: 1, name: product.name, price: product.price, image: product.image });
  }
  saveCart();
  $("#cartDrawer").classList.add("open");
}

function updateQuantity(productId, amount) {
  const item = state.cart.find((entry) => entry.productId === productId);
  const product = state.products.find((entry) => entry.id === productId);
  if (!item) return;
  item.quantity += amount;
  if (product && item.quantity > product.stock) item.quantity = product.stock;
  if (item.quantity < 1) state.cart = state.cart.filter((entry) => entry.productId !== productId);
  saveCart();
}

async function checkout(event) {
  event.preventDefault();
  if (!state.user) {
    openAuth();
    return toast("Sign in before checkout.");
  }
  const address = $("#checkoutAddress").value.trim();
  if (!address) return toast("Enter a delivery address.");
  const payload = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ address, items: state.cart })
  });
  state.cart = [];
  saveCart();
  $("#checkoutAddress").value = "";
  $("#cartDrawer").classList.remove("open");
  await loadProducts();
  setView("orders");
  toast(`Order ${payload.order.id.slice(0, 12)} placed.`);
}

async function submitAuth(event) {
  event.preventDefault();
  const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  const payload = await api(endpoint, {
    method: "POST",
    body: JSON.stringify({
      name: $("#authName").value,
      email: $("#authEmail").value,
      password: $("#authPassword").value
    })
  });
  saveSession(payload.user, payload.token);
  $("#authModal").classList.add("hidden");
  $("#authForm").reset();
  toast(`Welcome, ${payload.user.name}.`);
}

async function saveProduct(event) {
  event.preventDefault();
  const id = $("#productId").value;
  const payload = {
    name: $("#productName").value,
    category: $("#productCategory").value,
    price: $("#productPrice").value,
    stock: $("#productStock").value,
    image: $("#productImage").value,
    description: $("#productDescription").value,
    featured: $("#productFeatured").checked
  };
  await api(id ? `/api/products/${id}` : "/api/products", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetProductForm();
  await loadProducts();
  toast(id ? "Product updated." : "Product added.");
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  $("#formTitle").textContent = "Edit Product";
  $("#productId").value = product.id;
  $("#productName").value = product.name;
  $("#productCategory").value = product.category;
  $("#productPrice").value = product.price;
  $("#productStock").value = product.stock;
  $("#productImage").value = product.image;
  $("#productDescription").value = product.description;
  $("#productFeatured").checked = product.featured;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetProductForm() {
  $("#formTitle").textContent = "Add Product";
  $("#productForm").reset();
  $("#productId").value = "";
}

async function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  await api(`/api/products/${id}`, { method: "DELETE" });
  state.cart = state.cart.filter((item) => item.productId !== id);
  saveCart();
  await loadProducts();
  toast("Product deleted.");
}

async function updateOrderStatus(id, status) {
  await api(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
  await loadOrders();
  toast("Order status updated.");
}

function openAuth() {
  if (state.user) {
    saveSession(null, "");
    toast("Signed out.");
    return;
  }
  $("#authModal").classList.remove("hidden");
}

function setAuthMode(mode) {
  state.authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "Sign in" : "Create account";
  $$(".segment").forEach((item) => item.classList.toggle("active", item.dataset.authMode === mode));
  $$(".register-only").forEach((item) => item.classList.toggle("hidden", mode !== "register"));
}

function emptyState(message) {
  return `<div class="empty-state"><strong>${escapeHtml(message)}</strong></div>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.view) setView(target.dataset.view);
  if (target.dataset.add) addToCart(target.dataset.add);
  if (target.dataset.inc) updateQuantity(target.dataset.inc, 1);
  if (target.dataset.dec) updateQuantity(target.dataset.dec, -1);
  if (target.dataset.remove) {
    state.cart = state.cart.filter((item) => item.productId !== target.dataset.remove);
    saveCart();
  }
  if (target.dataset.edit) editProduct(target.dataset.edit);
  if (target.dataset.delete) deleteProduct(target.dataset.delete);
  if (target.dataset.authMode) setAuthMode(target.dataset.authMode);
  if (target.classList.contains("cart-toggle")) $("#cartDrawer").classList.add("open");
  if (target.classList.contains("cart-close")) $("#cartDrawer").classList.remove("open");
});

document.addEventListener("change", (event) => {
  if (event.target.id === "categoryFilter") loadProducts().catch((error) => toast(error.message));
  if (event.target.dataset.status) updateOrderStatus(event.target.dataset.status, event.target.value).catch((error) => toast(error.message));
});

$("#searchInput").addEventListener("input", () => {
  clearTimeout($("#searchInput").timer);
  $("#searchInput").timer = setTimeout(() => loadProducts().catch((error) => toast(error.message)), 220);
});

$("#authButton").addEventListener("click", openAuth);
$("#closeAuth").addEventListener("click", () => $("#authModal").classList.add("hidden"));
$("#checkoutForm").addEventListener("submit", (event) => checkout(event).catch((error) => toast(error.message)));
$("#authForm").addEventListener("submit", (event) => submitAuth(event).catch((error) => toast(error.message)));
$("#productForm").addEventListener("submit", (event) => saveProduct(event).catch((error) => toast(error.message)));
$("#resetProductForm").addEventListener("click", resetProductForm);

renderAuth();
loadProducts().catch((error) => toast(error.message));
