function fixImagePath(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  // If path already starts with ../ keep it
  if (src.startsWith('../')) return src;
  // Normalize leading slash
  return src.replace(/^\//, '');
}
function formatPrice(value) {
  const num = Number(value) || 0;
  return `$${num.toFixed(2)}`;
}
let cartItems = JSON.parse(localStorage.getItem('cartItems')) || [];
function saveCart() {
  localStorage.setItem('cartItems', JSON.stringify(cartItems));
}
function ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}
let currentToast = null;
let toastTimer = null;
function showToast(message, duration = 3000) {
  const container = ensureToastContainer();
  if (!currentToast) {
    currentToast = document.createElement('div');
    currentToast.className = 'toast';
    container.appendChild(currentToast);
  }
  currentToast.textContent = message;
  currentToast.classList.remove('show', 'hide');
  void currentToast.offsetWidth; 
  currentToast.classList.add('show');
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    currentToast.classList.remove('show');
    currentToast.classList.add('hide');
    setTimeout(() => {
      if (currentToast) {
        currentToast.remove();
        currentToast = null;
        toastTimer = null;
      }
    }, 400);
  }, duration);
}


function updateCartBadge() {
  const badge = document.getElementById('cart-badge') || document.querySelector('.cart-badge');
  if (!badge) return;
  const totalItems = cartItems.reduce((s, it) => s + (it.quantity || 0), 0);
  badge.textContent = totalItems;
  badge.style.display = totalItems > 0 ? 'flex' : 'none';
}

function updateBreadcrumbCount() {
  const bc = document.querySelector('.breadcrumb-current');
  if (bc) bc.textContent = `My Cart (${cartItems.length})`;
}
function addToCart(product) {
  const status = String(product?.status || '').toLowerCase();
  if (status === 'sold-out') {
    showToast('This product is sold out.');
    return false;
  }
  const id = product.id ?? String(Date.now());
  const size = product.size ?? 'M';
  const qty = product.quantity ? Number(product.quantity) : 1;
  const existing = cartItems.find(i => i.id === id && (i.size ?? 'M') === size);
  if (existing) {
    existing.quantity = (existing.quantity || 0) + qty;
  } else {
    cartItems.push({
      id,
      name: product.name ?? 'Product',
      price: Number(product.price) || 0,
      size,
      image: product.image ?? '',
      quantity: qty
    });
  }
  saveCart();
  loadCart();
  updateCartBadge();
  showToast(`${product.name} has been added to your cart.`);
  return true;
}

function removeFromCart(index) {
  if (index < 0 || index >= cartItems.length) return;
  const removed = cartItems.splice(index, 1)[0];
  saveCart();
  loadCart();
  updateCartBadge();
  showToast(`${removed.name} has been removed from your cart.`);
}
function updateQuantity(index, quantity) {
  const q = parseInt(quantity, 10);
  if (isNaN(q) || q < 1) {
    removeFromCart(index);
    return;
  }
  if (!cartItems[index]) return;
  cartItems[index].quantity = q;
  saveCart();
  loadCart();
  updateCartBadge();
  showToast(`${cartItems[index].name} quantity updated to ${q}.`);
}

function handleSizeChange(index, newSize) {
  if (!cartItems[index]) return;
  cartItems[index].size = newSize;
  saveCart();
  loadCart();
  showToast(`${cartItems[index].name} size set to ${newSize}.`);
}
function selectAllItems() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = true;
  });
  updateCheckboxes();
}

function updateCheckboxes() {
  const checked = document.querySelectorAll('.item-checkbox:checked').length;
  const deleteBtn = document.getElementById('delete-selected-btn');
  if (deleteBtn) deleteBtn.disabled = checked === 0;
}

function deleteSelected() {
  const checkedBoxes = Array.from(document.querySelectorAll('.item-checkbox:checked'));
  if (checkedBoxes.length === 0) {
    showToast('Please select items to delete', 2000);
    return;
  }
  if (!confirm(`Delete ${checkedBoxes.length} selected item(s)?`)) return;
  const indices = checkedBoxes.map(cb => parseInt(cb.dataset.index, 10)).sort((a,b)=>b-a);
  indices.forEach(i => {
    if (i >= 0 && i < cartItems.length) cartItems.splice(i, 1);
  });
  saveCart();
  loadCart();
  updateCartBadge();
  showToast(`${checkedBoxes.length} item(s) removed from cart.`);
}
function clearCart() {
  cartItems = [];
  saveCart();
  loadCart();
  updateCartBadge();
  showToast('Cart cleared successfully');
}
function handleCheckout() {
  if (cartItems.length === 0) {
    showToast('Your cart is empty!');
    return;
  }
  showToast('Proceeding to checkout...');
  setTimeout(() => {
    window.location.href = 'Checkout.html';
  }, 700);
}
function renderEmptyStateAsTableRow() {
  return `
    <tr>
      <td colspan="5" class="empty-cell-td" style="text-align:center; padding:60px 10px;">
        <div class="empty-cart">
          <i class="fas fa-shopping-cart" style="font-size:48px; color:#ccc; display:block; margin-bottom:12px;"></i>
          <div style="font-size:18px; color:#444;">Your cart is empty</div>
          <div style="margin-top:8px;">
            <a href="index.html" style="color:#666; text-decoration:underline;">Continue shopping</a>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function loadCart() {
  const tbody = document.getElementById('cart-tbody');
  const cartTable = document.getElementById('cart-table');
  const summary = document.querySelector('.summary-section');
  const cartActions = document.querySelector('.cart-actions');
  const selectAllBtn = document.querySelector('.selectAll');

  if (!tbody) return;
  tbody.innerHTML = '';

  if (cartItems.length === 0) {
    tbody.innerHTML = renderEmptyStateAsTableRow();
    if (cartTable) cartTable.style.display = 'table';
    if (summary) summary.style.display = 'none';
    if (cartActions) cartActions.style.display = 'none';
    if (selectAllBtn) selectAllBtn.style.display = 'none';
    updateCart(); 
    return;
  }
  if (summary) summary.style.display = 'block';
  if (cartActions) cartActions.style.display = 'flex';
  if (selectAllBtn) selectAllBtn.style.display = 'inline-block';
  cartItems.forEach((item, index) => {
    const tr = document.createElement('tr');

    const imgSrc = fixImagePath(item.image);

    tr.innerHTML = `
      <td class="checkbox-cell" style="text-align:center;">
        <input type="checkbox" class="item-checkbox" data-index="${index}">
      </td>
      <td>
        <div class="product-cell">
          <img src="${imgSrc}" alt="${item.name}" class="product-image" style="width:120px;height:150px;object-fit:cover;border:1px solid #ddd;border-radius:4px;">
          <div class="product-details">
            <div class="product-name">${item.name}</div>
            <div class="product-color" style="color:#666;font-size:13px;margin-top:4px;">${item.size || ''}</div>
            <div class="product-price" style="color:#666;font-size:14px;margin-top:6px;">${formatPrice(item.price)}</div>
          </div>
          <i class="fas fa-trash remove-icon" title="Remove" style="cursor:pointer;margin-left:12px;"></i>
        </div>
      </td>
      <td class="size-cell" style="text-align:center;">
        <select class="size-select" data-index="${index}">
          <option value="S" ${item.size === 'S' ? 'selected' : ''}>S</option>
          <option value="M" ${item.size === 'M' ? 'selected' : ''}>M</option>
          <option value="L" ${item.size === 'L' ? 'selected' : ''}>L</option>
          <option value="XL" ${item.size === 'XL' ? 'selected' : ''}>XL</option>
        </select>
      </td>
      <td class="quantity-cell" style="text-align:center;">
        <input class="qty-input" type="number" min="1" step="1" value="${item.quantity}" data-index="${index}" />
      </td>
      <td class="total-cell" style="text-align:right;">
        <div class="line-total">${formatPrice(item.price * item.quantity)}</div>
      </td>
    `;

    tr.querySelector('.remove-icon')?.addEventListener('click', () => {
      if (confirm(`Remove "${item.name}" from cart?`)) {
        removeFromCart(index);
      }
    });

    tr.querySelector('.size-select')?.addEventListener('change', (e) => {
      handleSizeChange(index, e.target.value);
    });

    tr.querySelector('.qty-input')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) e.target.value = 1;
    });
    tr.querySelector('.qty-input')?.addEventListener('change', (e) => {
      handleQuantityChange(index, e.target.value);
    });

    tbody.appendChild(tr);
  });
  reindexCheckboxes();
  updateCart();
}
function handleQuantityChange(index, value) {
  updateQuantity(index, value);
}

function reindexCheckboxes() {
  document.querySelectorAll('.item-checkbox').forEach((cb, i) => {
    cb.dataset.index = i;
    if (!cb.dataset.listenerAdded) {
      cb.addEventListener('change', updateCheckboxes);
      cb.dataset.listenerAdded = 'true';
    }
  });
}
function updateCart() {
  const totals = cartItems.reduce((acc, item) => {
    acc.subtotal += item.price * item.quantity;
    acc.quantity += item.quantity;
    return acc;
  }, { subtotal: 0, quantity: 0 });

  const shipping = cartItems.length > 0 ? 10 : 0;
  const total = totals.subtotal + shipping;

  const subtotalEl = document.getElementById('subtotal');
  const totalQtyEl = document.getElementById('total-quantity');
  const shippingEl = document.getElementById('shipping');
  const totalEl = document.getElementById('total');

  if (subtotalEl) subtotalEl.textContent = formatPrice(totals.subtotal);
  if (totalQtyEl) totalQtyEl.textContent = totals.quantity;
  if (shippingEl) shippingEl.textContent = formatPrice(shipping);
  if (totalEl) totalEl.textContent = formatPrice(total);

  updateBreadcrumbCount();
  updateCartBadge();
  saveCart();
}
function handleUpdateCart() {
  const qtyInputs = document.querySelectorAll('.qty-input');
  qtyInputs.forEach(input => {
    const index = parseInt(input.dataset.index, 10);
    const value = parseInt(input.value, 10);
    if (!isNaN(index) && !isNaN(value) && value > 0) {
      cartItems[index].quantity = value;
    }
  });

  const sizeSelects = document.querySelectorAll('.size-select');
  sizeSelects.forEach(select => {
    const index = parseInt(select.dataset.index, 10);
    const size = select.value;
    if (!isNaN(index)) {
      cartItems[index].size = size;
    }
  });

  saveCart();
  loadCart();
  updateCart();
  showToast('Cart updated successfully!');
}
document.addEventListener('DOMContentLoaded', () => {
  ensureToastContainer();
  loadCart();
  updateCartBadge();
  const selectAllBtn = document.querySelector('.selectAll');
  if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllItems);

  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelected);

  const clearBtn = document.getElementById('clear-cart-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the cart?')) {
      clearCart();
    }
  });
  const checkoutBtn = document.querySelector('.checkout');
  if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
  const updateBtn = document.querySelector('.update-cart');
  if (updateBtn) updateBtn.addEventListener('click', handleUpdateCart);
});
window.addToCart = addToCart;