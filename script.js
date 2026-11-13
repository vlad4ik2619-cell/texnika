const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  grid: $('#product-grid'),
  template: $('#product-card-template'),
  filters: $('#filters'),
  sort: $('#sort'),
  search: $('#search'),
  status: $('#grid-status'),
  empty: $('#empty-state'),
  count: $('#results-count'),
  summary: $('#results-summary'),
  cartCount: $('#cart-count'),
  wishlistCount: $('#wishlist-count'),
  cartDrawer: $('#cart-drawer'),
  cartBackdrop: $('.cart-backdrop'),
  cartItems: $('#cart-items'),
  cartItemsCount: $('#cart-items-count'),
  cartEmpty: $('#cart-empty'),
  cartTotal: $('#cart-total'),
  checkout: $('#checkout'),
  checkoutForm: $('#checkout-form'),
  checkoutConfirmation: $('#checkout-confirmation'),
  priceMin: $('#price-min'),
  priceMax: $('#price-max'),
  rangeMin: $('#range-min'),
  rangeMax: $('#range-max'),
  priceRange: $('#price-range'),
};

const state = {
  products: [],
  categories: [],
  currency: '₴',
  filters: {
    category: [],
    brand: [],
    storage: [],
    inStock: false,
    priceMin: null,
    priceMax: null,
    query: '',
    deals: false,
  },
  sort: 'popularity',
  cart: new Map(),
  wishlist: new Set(),
  checkoutComplete: false,
};

const storageKeys = {
  cart: 'volt-cart',
  wishlist: 'volt-wishlist',
};

let cartReturnFocus = null;

function readStoredIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
      throw new TypeError(`Invalid ${key} data in localStorage`);
    }
    return value;
  } catch (error) {
    console.error(`Could not read ${key} from localStorage:`, error);
    return [];
  }
}

function saveStoredIds(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch (error) {
    console.error(`Could not save ${key} to localStorage:`, error);
  }
}

function readStoredCart(productIds) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeys.cart) || '[]');
    if (!Array.isArray(stored)) throw new TypeError('Cart data must be an array');

    return new Map(stored.flatMap((entry) => {
      const id = typeof entry === 'string' ? entry : entry?.id;
      const quantity = typeof entry === 'string' ? 1 : entry?.quantity;
      if (typeof id !== 'string' || !productIds.has(id)) return [];
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        if (typeof entry === 'string') return [[id, 1]];
        console.error(`Invalid quantity in saved cart item: ${id}`);
        return [];
      }
      return [[id, quantity]];
    }));
  } catch (error) {
    console.error('Could not read cart from localStorage:', error);
    return new Map();
  }
}

function saveCart() {
  try {
    localStorage.setItem(storageKeys.cart, JSON.stringify(
      [...state.cart].map(([id, quantity]) => ({ id, quantity })),
    ));
  } catch (error) {
    console.error('Could not save cart to localStorage:', error);
  }
}

async function loadProducts() {
  const response = await fetch('products.json');
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити products.json: ${response.status}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.categories)) {
    throw new TypeError('products.json має містити масиви products і categories');
  }
  return data;
}

function getCategoryLabel(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.labelSingular
    || categoryId;
}

function formatPrice(price) {
  return `${new Intl.NumberFormat('uk-UA').format(price)} ${state.currency}`;
}

function makeImageFallback() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f6f7f9"/><rect x="240" y="95" width="160" height="230" rx="18" fill="none" stroke="#b9bec8" stroke-width="12"/><circle cx="320" cy="292" r="7" fill="#b9bec8"/></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function createProductCard(product) {
  const item = els.template.content.firstElementChild.cloneNode(true);
  const card = $('[data-field="root"]', item);
  const image = $('[data-field="image"]', item);
  const badge = $('[data-field="badge"]', item);

  card.id = `product-${product.id}`;
  if (badge) {
    badge.textContent = product.badge?.text || '';
    if (product.badge?.type && /^[a-z-]+$/.test(product.badge.type)) {
      badge.classList.add(`badge--${product.badge.type}`);
    }
  }

  $$('[data-field="link"], [data-field="title-link"]', item)
    .forEach((link) => { link.href = `#product-${encodeURIComponent(product.id)}`; });
  image.src = product.image || makeImageFallback();
  image.alt = product.name || 'Зображення товару';
  image.addEventListener('error', () => {
    if (!image.src.startsWith('data:image/svg+xml')) {
      image.src = makeImageFallback();
    }
  }, { once: true });

  $('[data-field="category"]', item).textContent = getCategoryLabel(product.category);
  $('[data-field="name"]', item).textContent = product.name;
  $('[data-field="subtitle"]', item).textContent = product.subtitle || '';
  $('[data-field="specs"]', item).textContent = product.specs || '';
  $('[data-field="stock"]', item).textContent = product.inStock ? 'Є в наявності' : 'Немає в наявності';
  $('[data-field="stock"]', item).classList.toggle('is-out', !product.inStock);
  card.classList.toggle('is-out-of-stock', !product.inStock);
  $('[data-field="rating"]', item).textContent = product.rating ?? '—';
  $('[data-field="reviews"]', item).textContent = product.reviews ?? 0;
  $('[data-field="price"]', item).textContent = formatPrice(product.price);

  const oldPrice = $('[data-field="oldPrice"]', item);
  if (product.oldPrice && product.oldPrice > product.price) {
    oldPrice.textContent = formatPrice(product.oldPrice);
    oldPrice.hidden = false;
  }

  const wishlistButton = $('[data-action="toggle-wishlist"]', item);
  const isWishlisted = state.wishlist.has(product.id);
  wishlistButton.setAttribute('aria-pressed', String(isWishlisted));
  if (isWishlisted) wishlistButton.setAttribute('aria-label', 'Видалити з обраного');

  const cartButton = $('[data-action="add-to-cart"]', item);
  const isInCart = state.cart.has(product.id);
  cartButton.classList.toggle('is-added', isInCart);
  const quantity = state.cart.get(product.id);
  $('[data-field="cart-label"]', item).textContent = isInCart ? `У кошику (${quantity})` : 'До кошика';
  cartButton.disabled = !product.inStock;

  wishlistButton.dataset.productId = product.id;
  cartButton.dataset.productId = product.id;
  return item;
}

function readFilters() {
  const formData = new FormData(els.filters);
  state.filters.category = formData.getAll('category');
  state.filters.brand = formData.getAll('brand');
  state.filters.storage = formData.getAll('storage').map(Number);
  state.filters.inStock = formData.has('inStock');
  state.filters.priceMin = els.priceMin.value === '' ? null : Number(els.priceMin.value);
  state.filters.priceMax = els.priceMax.value === '' ? null : Number(els.priceMax.value);
  state.filters.query = els.search.value.trim().toLocaleLowerCase('uk-UA');
}

function matchesFilters(product) {
  const { category, brand, storage, inStock, priceMin, priceMax, query, deals } = state.filters;
  const searchableText = [
    product.name,
    product.brand,
    product.category,
    product.subtitle,
    product.specs,
  ].join(' ').toLocaleLowerCase('uk-UA');

  return (!category.length || category.includes(product.category))
    && (!brand.length || brand.includes(product.brand))
    && (!storage.length || storage.includes(Number(product.storage)))
    && (!inStock || product.inStock)
    && (priceMin === null || product.price >= priceMin)
    && (priceMax === null || product.price <= priceMax)
    && (!query || searchableText.includes(query))
    && (!deals || (product.oldPrice && product.oldPrice > product.price));
}

function sortProducts(products) {
  const sorted = [...products];
  const comparators = {
    popularity: (a, b) => (b.popularity || 0) - (a.popularity || 0),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    discount: (a, b) => {
      const discountA = a.oldPrice ? (a.oldPrice - a.price) / a.oldPrice : 0;
      const discountB = b.oldPrice ? (b.oldPrice - b.price) / b.oldPrice : 0;
      return discountB - discountA;
    },
  };
  return sorted.sort(comparators[state.sort] || comparators.popularity);
}

function updateCounts() {
  const counts = new Map([['all', state.products.length]]);
  state.categories.forEach(({ id }) => {
    counts.set(`category:${id}`, state.products.filter((product) => product.category === id).length);
  });
  new Set(state.products.map((product) => product.brand)).forEach((brand) => {
    counts.set(`brand:${brand}`, state.products.filter((product) => product.brand === brand).length);
  });
  new Set(state.products.map((product) => String(product.storage))).forEach((storage) => {
    counts.set(`storage:${storage}`, state.products.filter((product) => String(product.storage) === storage).length);
  });
  counts.set('inStock:true', state.products.filter((product) => product.inStock).length);

  $$('[data-count]').forEach((element) => {
    const count = counts.get(element.dataset.count);
    if (count !== undefined) element.textContent = count;
  });
}

function updatePriceControls() {
  const minPrice = Math.min(...state.products.map((product) => product.price));
  const maxPrice = Math.max(...state.products.map((product) => product.price));

  [els.rangeMin, els.rangeMax].forEach((range) => {
    range.min = minPrice;
    range.max = maxPrice;
  });
  if (els.priceMin.value === '') els.priceMin.value = minPrice;
  if (els.priceMax.value === '') els.priceMax.value = maxPrice;
  els.priceMin.min = minPrice;
  els.priceMin.max = maxPrice;
  els.priceMax.min = minPrice;
  els.priceMax.max = maxPrice;
  syncPriceRanges();
}

function syncPriceRanges() {
  if (!els.rangeMin || !els.rangeMax || !els.priceRange) return;

  const min = Number(els.rangeMin.min);
  const max = Number(els.rangeMin.max);
  let lower = Number(els.priceMin.value || min);
  let upper = Number(els.priceMax.value || max);
  lower = Math.max(min, Math.min(lower, max));
  upper = Math.max(min, Math.min(upper, max));
  if (lower > upper) {
    if (document.activeElement === els.rangeMin || document.activeElement === els.priceMin) {
      upper = lower;
    } else {
      lower = upper;
    }
  }

  els.priceMin.value = lower;
  els.priceMax.value = upper;
  els.rangeMin.value = lower;
  els.rangeMax.value = upper;
  const range = max - min || 1;
  els.priceRange.style.setProperty('--from', `${((lower - min) / range) * 100}%`);
  els.priceRange.style.setProperty('--to', `${((upper - min) / range) * 100}%`);
}

function updateResultsCount(count) {
  const plural = count === 1 ? 'товар' : count >= 2 && count <= 4 ? 'товари' : 'товарів';
  els.count.textContent = `${count} ${plural}`;
  els.summary.textContent = `Показано ${count} із ${state.products.length} товарів`;
}

function updateCategorySelection() {
  const selected = state.filters.category;
  $$('#category-chips [data-category]').forEach((chip) => {
    const active = selected.length === 0
      ? chip.dataset.category === 'all'
      : selected.length === 1 && selected[0] === chip.dataset.category;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function updateActionCounts() {
  const totalQuantity = [...state.cart.values()].reduce((total, quantity) => total + quantity, 0);
  els.cartCount.textContent = totalQuantity;
  els.wishlistCount.textContent = state.wishlist.size;
  els.wishlistCount.hidden = state.wishlist.size === 0;
  const count = totalQuantity;
  const plural = count === 1 ? 'товар' : count >= 2 && count <= 4 ? 'товари' : 'товарів';
  els.cartItemsCount.textContent = `${count} ${plural}`;
}

function createCartItem(product) {
  const quantity = state.cart.get(product.id);
  const item = document.createElement('li');
  item.className = 'cart-item';

  const image = document.createElement('img');
  image.className = 'cart-item__image';
  image.src = product.image || makeImageFallback();
  image.alt = product.name || 'Зображення товару';
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    if (!image.src.startsWith('data:image/svg+xml')) image.src = makeImageFallback();
  }, { once: true });

  const details = document.createElement('div');
  details.className = 'cart-item__details';
  const name = document.createElement('p');
  name.className = 'cart-item__name';
  name.textContent = product.name;
  details.append(name);

  if (product.subtitle) {
    const description = document.createElement('p');
    description.className = 'cart-item__description';
    description.textContent = product.subtitle;
    details.append(description);
  }
  if (product.specs) {
    const specs = document.createElement('p');
    specs.className = 'cart-item__specs';
    specs.textContent = product.specs;
    details.append(specs);
  }
  const price = document.createElement('p');
  price.className = 'cart-item__price';
  price.textContent = `${quantity} × ${formatPrice(product.price)} = ${formatPrice(product.price * quantity)}`;
  details.append(price);

  const actions = document.createElement('div');
  actions.className = 'cart-item__actions';
  const quantityControl = document.createElement('div');
  quantityControl.className = 'cart-item__quantity';
  quantityControl.setAttribute('aria-label', `Кількість: ${quantity}`);

  const decrease = document.createElement('button');
  decrease.className = 'cart-item__quantity-btn';
  decrease.type = 'button';
  decrease.dataset.action = 'decrease-cart-quantity';
  decrease.dataset.productId = product.id;
  decrease.setAttribute('aria-label', `Зменшити кількість товару «${product.name}»`);
  decrease.textContent = '−';
  decrease.disabled = quantity <= 1;

  const quantityValue = document.createElement('span');
  quantityValue.className = 'cart-item__quantity-value';
  quantityValue.textContent = quantity;
  quantityValue.setAttribute('aria-live', 'polite');

  const increase = document.createElement('button');
  increase.className = 'cart-item__quantity-btn';
  increase.type = 'button';
  increase.dataset.action = 'increase-cart-quantity';
  increase.dataset.productId = product.id;
  increase.setAttribute('aria-label', `Збільшити кількість товару «${product.name}»`);
  increase.textContent = '+';
  increase.disabled = quantity >= Number.MAX_SAFE_INTEGER;

  quantityControl.append(decrease, quantityValue, increase);

  const remove = document.createElement('button');
  remove.className = 'cart-item__remove';
  remove.type = 'button';
  remove.dataset.action = 'remove-from-cart';
  remove.dataset.productId = product.id;
  remove.setAttribute('aria-label', `Видалити ${product.name} з кошика`);
  remove.textContent = 'Видалити';

  actions.append(quantityControl, remove);
  item.append(image, details, actions);
  return item;
}

function renderCart() {
  const products = state.products.filter((product) => state.cart.has(product.id));
  const fragment = document.createDocumentFragment();
  products.forEach((product) => fragment.append(createCartItem(product)));
  els.cartItems.replaceChildren(fragment);

  const isEmpty = products.length === 0;
  els.cartEmpty.hidden = !isEmpty;
  els.checkout.hidden = isEmpty;
  els.cartTotal.textContent = formatPrice(products.reduce(
    (total, product) => total + product.price * state.cart.get(product.id),
    0,
  ));
  els.checkoutForm.hidden = state.checkoutComplete;
  els.checkoutConfirmation.hidden = !state.checkoutComplete;
}

function openCart() {
  if (!els.cartDrawer.hidden) return;
  cartReturnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
    ? document.activeElement
    : $('[data-action="open-cart"]');
  els.cartDrawer.hidden = false;
  els.cartBackdrop.hidden = false;
  els.cartDrawer.setAttribute('aria-hidden', 'false');
  $('[data-action="open-cart"]').setAttribute('aria-expanded', 'true');
  document.body.classList.add('cart-open');
  $('.cart-drawer__close').focus();
}

function closeCart() {
  if (els.cartDrawer.hidden) return;
  els.cartDrawer.hidden = true;
  els.cartBackdrop.hidden = true;
  els.cartDrawer.setAttribute('aria-hidden', 'true');
  $('[data-action="open-cart"]').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cart-open');
  const focusTarget = cartReturnFocus instanceof HTMLElement && cartReturnFocus.isConnected
    ? cartReturnFocus
    : $('[data-action="open-cart"]');
  focusTarget.focus();
}

function renderProducts() {
  const products = sortProducts(state.products.filter(matchesFilters));
  const fragment = document.createDocumentFragment();
  products.forEach((product) => fragment.append(createProductCard(product)));
  els.grid.replaceChildren(fragment);
  els.empty.hidden = products.length > 0;
  updateResultsCount(products.length);
  updateCategorySelection();
  updateActionCounts();
  renderCart();
}

function setCategoryFilter(category) {
  const checkboxes = $$('input[name="category"]', els.filters);
  checkboxes.forEach((checkbox) => {
    checkbox.checked = category !== 'all' && checkbox.value === category;
  });
  readFilters();
  renderProducts();
}

function resetCatalogFilters() {
  $$('input[type="checkbox"]', els.filters).forEach((checkbox) => { checkbox.checked = false; });
  els.priceMin.value = els.rangeMin.min;
  els.priceMax.value = els.rangeMax.max;
  els.search.value = '';
  state.filters.deals = false;
  syncPriceRanges();
  readFilters();
  renderProducts();
}

function bindEvents() {
  els.filters.addEventListener('change', () => {
    readFilters();
    syncPriceRanges();
    renderProducts();
  });

  els.filters.addEventListener('input', (event) => {
    if (event.target === els.priceMin || event.target === els.priceMax) {
      syncPriceRanges();
      readFilters();
      renderProducts();
    } else if (event.target === els.rangeMin || event.target === els.rangeMax) {
      if (event.target === els.rangeMin) els.priceMin.value = event.target.value;
      if (event.target === els.rangeMax) els.priceMax.value = event.target.value;
      syncPriceRanges();
      readFilters();
      renderProducts();
    }
  });

  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderProducts();
  });

  $('#search-form').addEventListener('submit', (event) => event.preventDefault());
  els.search.addEventListener('input', () => {
    readFilters();
    renderProducts();
  });

  els.checkoutForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.cart.size || !els.checkoutForm.reportValidity()) return;

    state.checkoutComplete = true;
    els.checkoutConfirmation.textContent =
      'Дякуємо! Замовлення сформовано в демонстраційному режимі. Дані нікуди не надсилалися.';
    renderCart();
  });

  document.addEventListener('keydown', (event) => {
    if (els.cartDrawer.hidden) return;
    if (event.key === 'Escape') {
      closeCart();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = $$('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])', els.cartDrawer)
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const categoryControl = target?.closest('[data-category]');
    if (categoryControl) {
      const category = categoryControl.dataset.category;
      if (category === 'all' || state.categories.some((item) => item.id === category)) {
        event.preventDefault();
        setCategoryFilter(category);
      }
      return;
    }

    const preset = target?.closest('[data-filter-preset="deals"]');
    if (preset) {
      event.preventDefault();
      state.filters.deals = true;
      setCategoryFilter('all');
      renderProducts();
      return;
    }

    const action = target?.closest('[data-action]');
    if (action?.dataset.action === 'open-cart') {
      openCart();
    } else if (action?.dataset.action === 'close-cart') {
      closeCart();
    } else if (action?.dataset.action === 'reset-filters') {
      resetCatalogFilters();
    } else if (action?.dataset.action === 'toggle-wishlist') {
      const { productId } = action.dataset;
      if (state.wishlist.has(productId)) state.wishlist.delete(productId);
      else state.wishlist.add(productId);
      saveStoredIds(storageKeys.wishlist, state.wishlist);
      renderProducts();
    } else if (action?.dataset.action === 'add-to-cart') {
      const { productId } = action.dataset;
      const quantity = state.cart.get(productId) || 0;
      if (quantity < Number.MAX_SAFE_INTEGER) state.cart.set(productId, quantity + 1);
      state.checkoutComplete = false;
      saveCart();
      renderProducts();
    } else if (action?.dataset.action === 'increase-cart-quantity') {
      const productId = action.dataset.productId;
      const quantity = state.cart.get(productId);
      if (quantity && quantity < Number.MAX_SAFE_INTEGER) {
        state.cart.set(productId, quantity + 1);
        state.checkoutComplete = false;
        saveCart();
        renderProducts();
      }
    } else if (action?.dataset.action === 'decrease-cart-quantity') {
      const productId = action.dataset.productId;
      const quantity = state.cart.get(productId);
      if (quantity > 1) {
        state.cart.set(productId, quantity - 1);
        state.checkoutComplete = false;
        saveCart();
        renderProducts();
      }
    } else if (action?.dataset.action === 'remove-from-cart') {
      state.cart.delete(action.dataset.productId);
      state.checkoutComplete = false;
      saveCart();
      renderProducts();
    }
  });

  els.filters.addEventListener('reset', (event) => {
    event.preventDefault();
    resetCatalogFilters();
  });
}

async function init() {
  try {
    if (!els.grid || !els.template || !els.filters) {
      throw new Error('Не знайдено обов’язкові елементи каталогу в index.html');
    }

    const data = await loadProducts();
    state.products = data.products;
    state.categories = data.categories;
    state.currency = data.currency || '₴';
    const productIds = new Set(state.products.map((product) => product.id));
    state.cart = readStoredCart(productIds);
    state.wishlist = new Set(readStoredIds(storageKeys.wishlist).filter((id) => productIds.has(id)));

    updateCounts();
    updatePriceControls();
    const requestedCategory = new URLSearchParams(location.search).get('category');
    if (requestedCategory && state.categories.some((item) => item.id === requestedCategory)) {
      setCategoryFilter(requestedCategory);
    } else {
      readFilters();
      renderProducts();
    }
    bindEvents();
    els.status.textContent = '';
    els.grid.removeAttribute('aria-busy');
  } catch (error) {
    console.error(error);
    els.status.textContent = 'Не вдалося завантажити товари. Спробуйте пізніше.';
    els.grid?.removeAttribute('aria-busy');
  }
}

init();
