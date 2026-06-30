/**
 * E-commerce shop module for Morondartva-Store.
 * Controls catalog, search/filter, cart, and checkout wizard.
 */

const Shop = {
    products: [],
    categories: [],
    cart: [],
    selectedCategory: null,
    searchQuery: '',
    deliveryFee: 0,
    checkoutMap: null,
    checkoutMarker: null,
    currentPage: 1,
    totalPages: 1,

    init() {
        this.loadCart();
        this.renderCartUI();
    },

    async loadCatalog(page) {
        const shopSection = document.getElementById('section-shop');
        if (!shopSection || shopSection.classList.contains('hidden')) return;

        const gridContainer = document.getElementById('products-grid');
        if (gridContainer) gridContainer.innerHTML = '<div class="col-span-full py-5 text-center"><div class="spinner"></div></div>';

        try {
            const pg = page || this.currentPage;
            const catsPromise = API.get('/categories');
            const prodsPromise = API.get(`/products?category_id=${this.selectedCategory || ''}&search=${encodeURIComponent(this.searchQuery)}&page=${pg}&limit=12`);
            const [cats, prodsResp] = await Promise.all([catsPromise, prodsPromise]);

            this.categories = cats.filter(c => c.type === 'product');
            this.products = prodsResp.data || prodsResp;
            this.currentPage = prodsResp.page || 1;
            this.totalPages = prodsResp.total_pages || 1;

            this.renderCategoriesFilter();
            this.renderProducts();
            this.renderPagination();
        } catch (e) {
            console.error("Failed to load catalog:", e);
            if (gridContainer) {
                gridContainer.innerHTML = `<div class="col-span-full text-center text-danger">Erreur: ${e.message}</div>`;
            }
        }
    },

    renderPagination() {
        const container = document.getElementById('products-grid');
        if (!container || this.totalPages <= 1) return;
        const pagination = document.createElement('div');
        pagination.className = 'col-span-full d-flex justify-content-center gap-2 mt-4 pagination-wrap';
        let html = '';
        for (let i = 1; i <= this.totalPages; i++) {
            html += `<button class="btn ${i === this.currentPage ? 'btn-red' : 'btn-secondary'} btn-sm" onclick="Shop.loadCatalog(${i})">${i}</button>`;
        }
        pagination.innerHTML = html;
        container.appendChild(pagination);
    },

    renderCategoriesFilter() {
        const filterContainer = document.getElementById('shop-categories-filter');
        if (!filterContainer) return;

        let html = `<button class="filter-btn ${!this.selectedCategory ? 'active' : ''}" onclick="Shop.setCategory(null)">Tout</button>`;
        
        this.categories.forEach(cat => {
            html += `
                <button class="filter-btn ${this.selectedCategory == cat.id ? 'active' : ''}" onclick="Shop.setCategory(${cat.id})">
                    ${cat.name}
                </button>
            `;
        });
        filterContainer.innerHTML = html;
    },

    renderProducts() {
        const gridContainer = document.getElementById('products-grid');
        if (!gridContainer) return;

        if (this.products.length === 0) {
            gridContainer.innerHTML = `
                <div class="col-span-full text-center py-5">
                    <i class="fas fa-box-open fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Aucun article ne correspond à votre recherche.</p>
                </div>
            `;
            return;
        }

        const favIds = new Set();
        if (Auth.user) {
            const savedUser = localStorage.getItem('user_profile');
            // Extract favorites if stored
            const token = localStorage.getItem('session_token');
            // For simple sync, check profile cache
            const profile = JSON.parse(localStorage.getItem('user_profile_detail') || '{}');
            if (profile.favorites) {
                profile.favorites.forEach(f => {
                    if (f.item_type === 'product') favIds.add(f.item_id);
                });
            }
        }

        gridContainer.innerHTML = this.products.map(prod => {
            const isFav = favIds.has(prod.id);
            const outOfStock = prod.stock <= 0;
            return `
                <div class="product-card card">
                    <div class="product-img-container">
                        <img src="${prod.image_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${prod.name}" class="product-img" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                        ${outOfStock ? '<span class="badge badge-out-of-stock">Rupture</span>' : ''}
                        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="Shop.toggleFavorite(${prod.id}, event)">
                            <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <span class="product-cat text-muted text-sm">${prod.category_name || 'Boutique'}</span>
                        <h4 class="product-name my-1">${prod.name}</h4>
                        <p class="product-desc text-muted text-sm text-truncate-2">${prod.description || ''}</p>
                        <div class="product-footer d-flex justify-content-between align-items-center mt-3">
                            <span class="product-price text-red font-bold">${formatPrice(prod.price)}</span>
                            <button class="btn btn-red btn-sm" ${outOfStock ? 'disabled' : ''} onclick="Shop.addToCart(${prod.id})">
                                <i class="fas fa-shopping-cart mr-1"></i> Ajouter
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    setCategory(catId) {
        this.selectedCategory = catId;
        this.loadCatalog();
    },

    setSearch(query) {
        this.searchQuery = query;
        this.loadCatalog();
    },

    async toggleFavorite(productId, event) {
        event.stopPropagation();
        if (!Auth.user) {
            Notify.show("Veuillez vous connecter pour ajouter des favoris.", 'warning');
            openAuthModal('login');
            return;
        }

        try {
            const btn = event.currentTarget;
            const icon = btn.querySelector('i');
            const res = await API.post('/favorites', { item_id: productId, item_type: 'product' });
            
            if (res.status === 'added') {
                btn.classList.add('active');
                icon.className = 'fas fa-heart';
            } else {
                btn.classList.remove('active');
                icon.className = 'far fa-heart';
            }
            
            // Reload user profile in BG to keep list sync
            Auth.loadFullProfile().then(prof => {
                if (prof) localStorage.setItem('user_profile_detail', JSON.stringify(prof));
            });
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    // CART LOGIC

    loadCart() {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                this.cart = JSON.parse(savedCart);
            } catch (e) {
                this.cart = [];
            }
        } else {
            this.cart = [];
        }
    },

    saveCart() {
        localStorage.setItem('cart', JSON.stringify(this.cart));
        this.renderCartUI();
    },

    addToCart(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const cartItem = this.cart.find(item => item.product_id === productId);
        if (cartItem) {
            if (cartItem.quantity >= product.stock) {
                Notify.show(`Stock maximum atteint (${product.stock} disponibles)`, 'warning');
                return;
            }
            cartItem.quantity += 1;
        } else {
            this.cart.push({
                product_id: product.id,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                quantity: 1,
                max_stock: product.stock
            });
        }
        
        this.saveCart();
        this.pulseCartBadge();
        this.animateCartIcon();
    },

    animateCartIcon() {
        const cartIcon = document.getElementById('cart-icon');
        if (cartIcon) {
            cartIcon.classList.remove('cart-bounce');
            void cartIcon.offsetWidth;
            cartIcon.classList.add('cart-bounce');
        }
    },

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.product_id !== productId);
        this.saveCart();
    },

    updateQuantity(productId, delta) {
        const item = this.cart.find(i => i.product_id === productId);
        if (!item) return;

        item.quantity += delta;
        if (item.quantity <= 0) {
            this.removeFromCart(productId);
            return;
        }
        
        if (item.quantity > item.max_stock) {
            Notify.show(`Désolé, il n'y a que ${item.max_stock} articles en stock.`, 'warning');
            item.quantity = item.max_stock;
        }

        this.saveCart();
    },

    clearCart() {
        this.cart = [];
        this.saveCart();
    },

    getCartTotal() {
        const subtotal = this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
        return subtotal + this.deliveryFee;
    },

    getSubtotal() {
        return this.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    },

    updateDeliveryFee() {
        const zone = document.getElementById('checkout-delivery-zone');
        if (!zone) return;
        this.deliveryFee = zone.value === 'city' ? 3000 : 0;
        this.renderCheckoutSummary();
    },

    initCheckoutMap() {
        const mapContainer = document.getElementById('checkout-map');
        if (!mapContainer || this.checkoutMap) return;

        // Default: center on Antsirabe
        const defaultLat = -19.866;
        const defaultLng = 47.033;
        const zoom = 13;

        this.checkoutMap = L.map('checkout-map', {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([defaultLat, defaultLng], zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.checkoutMap);

        this.checkoutMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(this.checkoutMap);
        document.getElementById('checkout-lat').value = defaultLat;
        document.getElementById('checkout-lng').value = defaultLng;
        document.getElementById('checkout-address').placeholder = 'Votre adresse complète à Antsirabe';

        // Try auto-detect position
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    this.checkoutMap.setView([lat, lng], zoom);
                    this.checkoutMarker.setLatLng([lat, lng]);
                    document.getElementById('checkout-lat').value = lat;
                    document.getElementById('checkout-lng').value = lng;
                    document.getElementById('checkout-address').placeholder = 'Votre adresse complète';
                    Notify.show('Position détectée automatiquement.', 'info');
                },
                () => {
                    console.log('Géolocalisation refusée ou indisponible. Position par défaut: Antsirabe.');
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }

        this.checkoutMap.on('click', (e) => {
            this.checkoutMarker.setLatLng(e.latlng);
            document.getElementById('checkout-lat').value = e.latlng.lat;
            document.getElementById('checkout-lng').value = e.latlng.lng;
            this.reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        this.checkoutMarker.on('dragend', () => {
            const pos = this.checkoutMarker.getLatLng();
            document.getElementById('checkout-lat').value = pos.lat;
            document.getElementById('checkout-lng').value = pos.lng;
            this.reverseGeocode(pos.lat, pos.lng);
        });

        // Invalidate size after modal opens
        setTimeout(() => this.checkoutMap.invalidateSize(), 300);
    },

    async searchAddressOnMap() {
        const address = document.getElementById('checkout-address').value.trim();
        if (!address) {
            Notify.show('Veuillez entrer une adresse.', 'warning');
            return;
        }
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
                headers: { 'User-Agent': 'Morondartva-Store/1.0' }
            });
            const data = await res.json();
            if (data.length === 0) {
                Notify.show('Adresse introuvable sur la carte.', 'error');
                return;
            }
            const { lat, lon, display_name } = data[0];
            const latlng = [parseFloat(lat), parseFloat(lon)];
            this.checkoutMap.setView(latlng, 16);
            this.checkoutMarker.setLatLng(latlng);
            document.getElementById('checkout-lat').value = lat;
            document.getElementById('checkout-lng').value = lon;
            document.getElementById('checkout-address').value = display_name;
        } catch (e) {
            Notify.show('Erreur lors de la recherche de l\'adresse.', 'error');
        }
    },

    async reverseGeocode(lat, lng) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
                headers: { 'User-Agent': 'Morondartva-Store/1.0' }
            });
            const data = await res.json();
            if (data && data.display_name) {
                document.getElementById('checkout-address').value = data.display_name;
            }
        } catch (e) {
            // Silent fail – address stays as typed
        }
    },

    getCartCount() {
        return this.cart.reduce((count, item) => count + item.quantity, 0);
    },

    pulseCartBadge() {
        const badges = document.querySelectorAll('.cart-count-badge');
        badges.forEach(b => {
            b.classList.remove('pulse');
            void b.offsetWidth;
            b.classList.add('pulse');
        });
    },

    renderCartUI() {
        // Update header cart count
        const countBadges = document.querySelectorAll('.cart-count-badge');
        const count = this.getCartCount();
        countBadges.forEach(badge => {
            badge.textContent = count;
            if (count > 0) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });

        // Render Cart Drawer Contents
        const drawerItems = document.getElementById('cart-drawer-items');
        const drawerTotal = document.getElementById('cart-drawer-total');
        const checkoutBtn = document.getElementById('cart-drawer-checkout-btn');

        if (!drawerItems) return;

        if (this.cart.length === 0) {
            drawerItems.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-shopping-basket fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Votre panier est vide.</p>
                </div>
            `;
            drawerTotal.textContent = formatPrice(0);
            if (checkoutBtn) checkoutBtn.disabled = true;
            return;
        }

        drawerItems.innerHTML = `<div class="cart-anim">${this.cart.map(item => `
            <div class="cart-item-card d-flex align-items-center py-2 border-bottom">
                <img src="${item.image_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${item.name}" class="cart-item-thumb mr-2" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                <div class="flex-grow-1">
                    <h5 class="cart-item-name text-sm text-truncate">${item.name}</h5>
                    <span class="cart-item-price text-xs text-red">${formatPrice(item.price)}</span>
                    <div class="quantity-controls d-flex align-items-center mt-1">
                        <button class="qty-btn" onclick="Shop.updateQuantity(${item.product_id}, -1)">-</button>
                        <span class="qty-val px-2 text-sm">${item.quantity}</span>
                        <button class="qty-btn" onclick="Shop.updateQuantity(${item.product_id}, 1)">+</button>
                    </div>
                </div>
                <button class="remove-cart-btn btn-icon text-muted" onclick="Shop.removeFromCart(${item.product_id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('')}</div>`;

        drawerTotal.textContent = formatPrice(this.getCartTotal());
        if (checkoutBtn) checkoutBtn.disabled = false;
    },

    openCartDrawer() {
        const drawer = document.getElementById('cart-drawer');
        const overlay = document.getElementById('cart-drawer-overlay');
        if (drawer) drawer.classList.add('open');
        if (overlay) overlay.classList.remove('hidden');
    },

    closeCartDrawer() {
        const drawer = document.getElementById('cart-drawer');
        const overlay = document.getElementById('cart-drawer-overlay');
        if (drawer) drawer.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
    },

    // CHECKOUT FLOW

    openCheckoutWizard() {
        if (!Auth.user) {
            this.closeCartDrawer();
            Notify.show("Veuillez vous connecter pour valider votre commande.", 'warning');
            openAuthModal('login');
            return;
        }

        this.closeCartDrawer();
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('hidden');

        this.deliveryFee = 3000;
        document.getElementById('checkout-delivery-zone').value = 'city';
        this.renderCheckoutSummary();
        this.setCheckoutStep(1);
        setTimeout(() => this.initCheckoutMap(), 200);
    },

    closeCheckoutWizard() {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.add('hidden');
    },

    setCheckoutStep(step) {
        // Steps: 1 = Form & Address, 2 = Payment instruction, 3 = Confirmation
        for (let i = 1; i <= 3; i++) {
            const stepEl = document.getElementById(`checkout-step-${i}`);
            const progressEl = document.getElementById(`checkout-progress-step-${i}`);
            if (stepEl) {
                if (i === step) {
                    stepEl.classList.remove('hidden');
                } else {
                    stepEl.classList.add('hidden');
                }
            }
            if (progressEl) {
                if (i <= step) {
                    progressEl.classList.add('active');
                } else {
                    progressEl.classList.remove('active');
                }
            }
        }

        // Custom details updates per step
        if (step === 2) {
            this.setupPaymentVerificationScreen();
        }
    },

    renderCheckoutSummary() {
        const container = document.getElementById('checkout-items-summary');
        if (!container) return;

        const subtotal = this.getSubtotal();

        container.innerHTML = this.cart.map(item => `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom text-sm">
                <span>${item.name} <strong>x${item.quantity}</strong></span>
                <span>${formatPrice(item.price * item.quantity)}</span>
            </div>
        `).join('');

        const subtotalEl = document.getElementById('checkout-subtotal');
        if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

        const deliveryEl = document.getElementById('checkout-delivery-fee');
        if (deliveryEl) {
            const zone = document.getElementById('checkout-delivery-zone');
            if (zone && zone.value === 'city') {
                deliveryEl.textContent = formatPrice(3000);
            } else if (zone && zone.value === 'other') {
                deliveryEl.textContent = 'À discuter';
            } else {
                deliveryEl.textContent = '—';
            }
        }

        const totalContainer = document.getElementById('checkout-total-summary');
        if (totalContainer) totalContainer.textContent = formatPrice(this.getCartTotal());
    },

    setupPaymentVerificationScreen() {
        const method = document.getElementById('checkout-payment-method').value;
        const phone = document.getElementById('checkout-phone').value;
        const total = this.getCartTotal();

        const titleEl = document.getElementById('payment-step-title');
        const instructionEl = document.getElementById('payment-step-instruction');

        let instructionHTML = '';

        if (['mvola', 'orange_money', 'airtel_money'].includes(method)) {
            let gatewayName = '';
            let gatewayShort = '';
            
            if (method === 'mvola') {
                gatewayName = 'MVola (Telma)';
                gatewayShort = 'MVola';
            } else if (method === 'orange_money') {
                gatewayName = 'Orange Money';
                gatewayShort = 'Orange Money';
            } else {
                gatewayName = 'Airtel Money';
                gatewayShort = 'Airtel Money';
            }

            titleEl.textContent = `Paiement Mobile Money via ${gatewayName}`;
            instructionHTML = `
                <div class="alert alert-info text-sm mb-3">
                    <i class="fas fa-mobile-alt mr-2"></i> Après avoir validé votre commande, vous recevrez un code USSD à composer sur votre téléphone pour effectuer le paiement via ${gatewayName}.
                </div>
                <div class="text-sm p-3 rounded bg-dark-card mb-3">
                    <p class="mb-2"><strong>Montant à payer :</strong> ${formatPrice(total)}</p>
                    <p class="mb-0"><strong>Numéro de téléphone :</strong> ${phone}</p>
                </div>
                <ol class="text-sm pl-4 mb-3">
                    <li>Cliquez sur "Valider et Commander" ci-dessous</li>
                    <li>Un code USSD vous sera affiché</li>
                    <li>Composez ce code sur l'application Téléphone de votre appareil</li>
                    <li>Suivez les instructions à l'écran pour confirmer le paiement</li>
                    <li>Votre commande sera traitée après confirmation du paiement</li>
                </ol>
            `;
        } else if (method === 'paypal') {
            titleEl.textContent = "Paiement international via PayPal";
            const usdTotal = (total / 4000).toFixed(2);
            instructionHTML = `
                <div class="text-center py-3">
                    <i class="fab fa-paypal fa-3x text-info mb-3"></i>
                    <p>Vous allez être redirigé vers l'interface de paiement sécurisé PayPal.</p>
                    <p class="font-bold text-lg mt-2">Montant convertible: $${usdTotal} USD</p>
                </div>
            `;
        } else {
            titleEl.textContent = "Paiement par Carte de Crédit";
            instructionHTML = `
                <div class="credit-card-form p-3 border rounded bg-dark-card mb-3">
                    <div class="form-group mb-2">
                        <label class="text-xs text-muted">Numéro de carte</label>
                        <input type="text" class="form-control form-control-sm" placeholder="4000 1234 5678 9010" value="4000 1234 5678 9010">
                    </div>
                    <div class="row">
                        <div class="col-6 mb-2">
                            <label class="text-xs text-muted">Expiration</label>
                            <input type="text" class="form-control form-control-sm" placeholder="MM/AA" value="12/28">
                        </div>
                        <div class="col-6 mb-2">
                            <label class="text-xs text-muted">CVV</label>
                            <input type="password" class="form-control form-control-sm" placeholder="123" value="123">
                        </div>
                    </div>
                </div>
            `;
        }

        instructionEl.innerHTML = instructionHTML;
    },

    async processOrderSubmission() {
        const address = document.getElementById('checkout-address').value.strip();
        const phone = document.getElementById('checkout-phone').value.strip();
        const method = document.getElementById('checkout-payment-method').value;
        const deliveryZone = document.getElementById('checkout-delivery-zone').value;
        const lat = document.getElementById('checkout-lat').value;
        const lng = document.getElementById('checkout-lng').value;

        if (!address || !phone) {
            Notify.show("Veuillez renseigner toutes vos informations de livraison.", 'warning');
            this.setCheckoutStep(1);
            return;
        }

        // Show spinner inside confirmation button
        const submitBtn = document.getElementById('checkout-submit-order-btn');
        const btnOriginalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Traitement du paiement...';

        try {
            const itemsPayload = this.cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            }));

            const res = await API.post('/orders', {
                items: itemsPayload,
                shipping_address: address,
                phone_number: phone,
                payment_method: method,
                delivery_zone: deliveryZone,
                delivery_fee: deliveryZone === 'city' ? 3000 : 0,
                latitude: lat,
                longitude: lng
            });

            // Clear cart
            this.clearCart();
            this.setCheckoutStep(3);

            // Display confirmation details
            const confContainer = document.getElementById('checkout-confirmation-details');
            if (confContainer) {
                if (res.ussd_code) {
                    confContainer.innerHTML = `
                        <div class="text-center py-4">
                            <i class="fas fa-mobile-alt fa-4x text-info mb-3"></i>
                            <h3 class="text-glow-info">Paiement en attente</h3>
                            <p class="mt-2">Connectez-vous sur votre téléphone et composez le code USSD ci-dessous pour finaliser le paiement.</p>
                            <div class="mt-4 p-3 bg-dark-card rounded text-left d-inline-block text-sm border w-100" style="max-width: 400px;">
                                <p class="mb-1"><strong>ID Commande:</strong> #${res.order_id}</p>
                                <p class="mb-1"><strong>Transaction:</strong> ${res.transaction_id || 'N/A'}</p>
                                <p class="mb-1"><strong>Méthode:</strong> ${method.toUpperCase()}</p>
                            </div>
                            <div class="mt-4 p-4 rounded border border-info" style="background: rgba(0,123,255,0.1); max-width: 400px; margin: 0 auto;">
                                <p class="text-xs text-muted mb-2">Code USSD à composer sur votre téléphone :</p>
                                <code class="ussd-code-display" style="font-size: 1.4rem; word-break: break-all; color: #0dcaf0; user-select: all;">${res.ussd_code}</code>
                            </div>
                            ${res.instruction ? `<div class="mt-3 text-left d-inline-block text-sm"><p class="text-muted">Instructions :</p><p style="white-space: pre-line;">${res.instruction}</p></div>` : ''}
                            <div class="mt-3 d-flex justify-content-center gap-2 flex-wrap">
                                <a href="tel:${res.ussd_code.replace(/#/g, '%23')}" class="btn btn-info btn-sm">
                                    <i class="fas fa-phone-alt mr-1"></i> Composer le code USSD
                                </a>
                                <button class="btn btn-outline-info btn-sm" onclick="navigator.clipboard.writeText('${res.ussd_code}'); Notify.show('Code USSD copié !', 'success')">
                                    <i class="fas fa-copy mr-1"></i> Copier
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    confContainer.innerHTML = `
                        <div class="text-center py-4">
                            <i class="fas fa-check-circle fa-4x text-success mb-3"></i>
                            <h3 class="text-glow-success">Merci pour votre commande !</h3>
                            <p class="mt-2">Votre transaction a été approuvée.</p>
                            <div class="mt-4 p-3 bg-dark-card rounded text-left d-inline-block text-sm border">
                                <p class="mb-1"><strong>ID Commande:</strong> #${res.order_id}</p>
                                <p class="mb-1"><strong>Référence Transaction:</strong> ${res.transaction_id || 'N/A'}</p>
                                <p class="mb-1"><strong>Méthode de paiement:</strong> ${method.toUpperCase()}</p>
                            </div>
                            <p class="text-muted text-xs mt-3">Un email de confirmation contenant votre facture a été envoyé à <strong>${Auth.user.email}</strong>.</p>
                        </div>
                    `;
                }
            }

            // Sync user profile in background
            Auth.loadFullProfile().then(prof => {
                if (prof) localStorage.setItem('user_profile_detail', JSON.stringify(prof));
            });

        } catch (e) {
            Notify.show(`Échec de la commande: ${e.message}`, 'error');
            this.setCheckoutStep(1);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = btnOriginalText;
        }
    }
};

// Prototype extensions if needed
if (!String.prototype.strip) {
    String.prototype.strip = function() {
        return this.trim();
    };
}
