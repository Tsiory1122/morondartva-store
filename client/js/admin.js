/**
 * Back-Office Admin Dashboard module for Morondartva-Store.
 * Handles dashboard statistics, product CRUD, video CRUD, and user manager.
 */

const Admin = {
    stats: null,
    users: [],
    products: [],
    videos: [],
    categories: [],
    adminEvents: [],
    adminOrders: [],
    adminOrdersPage: 1,
    adminOrdersTotalPages: 1,
    
    // Base64 image cache for uploads
    productImageBase64: null,
    videoThumbnailBase64: null,
    eventImageBase64: null,

    async init() {
        const adminSection = document.getElementById('section-admin');
        if (!adminSection || adminSection.classList.contains('hidden')) return;

        // Verify user is admin
        if (!Auth.user || Auth.user.role !== 'admin') {
            adminSection.innerHTML = `
                <div class="container py-5 text-center">
                    <i class="fas fa-exclamation-triangle fa-3x text-red mb-3"></i>
                    <h2>Accès Non Autorisé</h2>
                    <p>Cet espace est réservé aux administrateurs de la plateforme.</p>
                    <a href="#home" class="btn btn-red btn-sm mt-3">Retour à l'accueil</a>
                </div>
            `;
            return;
        }

        // Set default tab
        this.switchTab('stats');
    },

    async loadStats() {
        const container = document.getElementById('admin-tab-stats');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';

        try {
            const stats = await API.get('/admin/stats');
            this.stats = stats;
            
            container.innerHTML = `
                <!-- Stats Cards -->
                <div class="grid grid-4 gap-3 mb-5">
                    <div class="card bg-dark-card p-4 rounded text-center border-glow">
                        <i class="fas fa-wallet fa-2x text-red mb-2"></i>
                        <h5 class="text-muted text-sm uppercase">Ventes Totales</h5>
                        <h2 class="mt-2 text-glow">${formatPrice(stats.total_sales)}</h2>
                    </div>
                    <div class="card bg-dark-card p-4 rounded text-center border-glow">
                        <i class="fas fa-shopping-bag fa-2x text-info mb-2"></i>
                        <h5 class="text-muted text-sm uppercase">Commandes</h5>
                        <h2 class="mt-2">${stats.total_orders}</h2>
                    </div>
                    <div class="card bg-dark-card p-4 rounded text-center border-glow">
                        <i class="fas fa-users fa-2x text-success mb-2"></i>
                        <h5 class="text-muted text-sm uppercase">Utilisateurs</h5>
                        <h2 class="mt-2">${stats.total_users}</h2>
                    </div>
                    <div class="card bg-dark-card p-4 rounded text-center border-glow">
                        <i class="fas fa-film fa-2x text-gold mb-2"></i>
                        <h5 class="text-muted text-sm uppercase">Médias Publiés</h5>
                        <h2 class="mt-2">${stats.total_videos} Vidéos</h2>
                    </div>
                </div>

                <div class="row">
                    <!-- Recent Orders -->
                    <div class="col-md-6 mb-4">
                        <div class="card bg-dark-card p-4 rounded h-100 border">
                            <h4 class="mb-3"><i class="fas fa-shopping-cart text-red mr-2"></i>Dernières Commandes</h4>
                            <div class="table-responsive">
                                <table class="table text-sm">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Client</th>
                                            <th>Montant</th>
                                            <th>Statut</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stats.recent_orders.map(o => `
                                            <tr>
                                                <td>#${o.id}</td>
                                                <td>${o.user_name}</td>
                                                <td>${formatPrice(o.total_amount)}</td>
                                                <td><span class="badge badge-success">Payée</span></td>
                                            </tr>
                                        `).join('') || '<tr><td colspan="4" class="text-center text-muted">Aucune commande</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Recent Payments -->
                    <div class="col-md-6 mb-4">
                        <div class="card bg-dark-card p-4 rounded h-100 border">
                            <h4 class="mb-3"><i class="fas fa-receipt text-success mr-2"></i>Paiements Récents</h4>
                            <div class="table-responsive">
                                <table class="table text-sm">
                                    <thead>
                                        <tr>
                                            <th>Transaction</th>
                                            <th>Méthode</th>
                                            <th>Montant</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${stats.recent_payments.map(p => `
                                            <tr>
                                                <td class="text-truncate" style="max-width: 120px;" title="${p.transaction_id}">${p.transaction_id}</td>
                                                <td><span class="badge bg-dark">${p.payment_method.toUpperCase()}</span></td>
                                                <td>${formatPrice(p.amount)}</td>
                                                <td>${new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
                                            </tr>
                                        `).join('') || '<tr><td colspan="4" class="text-center text-muted">Aucun paiement</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row mt-3">
                    <!-- Popular Products -->
                    <div class="col-md-6 mb-4">
                        <div class="card bg-dark-card p-4 rounded border">
                            <h4 class="mb-3"><i class="fas fa-fire text-red mr-2"></i>Produits les Plus Vendus</h4>
                            <ul class="list-group list-group-flush bg-transparent">
                                ${stats.popular_products.map((p, idx) => `
                                    <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2 px-0 border-bottom">
                                        <span><strong>#${idx+1}</strong> ${p.name}</span>
                                        <span class="badge bg-red">${p.sales_qty || 0} ventes</span>
                                    </li>
                                `).join('') || '<li class="text-muted text-center py-3">Aucun classement</li>'}
                            </ul>
                        </div>
                    </div>

                    <!-- Popular Videos -->
                    <div class="col-md-6 mb-4">
                        <div class="card bg-dark-card p-4 rounded border">
                            <h4 class="mb-3"><i class="fas fa-star text-gold mr-2"></i>Vidéos Favorites</h4>
                            <ul class="list-group list-group-flush bg-transparent">
                                ${stats.popular_videos.map((v, idx) => `
                                    <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2 px-0 border-bottom">
                                        <span><strong>#${idx+1}</strong> ${v.title}</span>
                                        <span class="badge bg-gold text-dark">${v.favorites_count || 0} favoris</span>
                                    </li>
                                `).join('') || '<li class="text-muted text-center py-3">Aucun classement</li>'}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="text-danger text-center py-5">Erreur: ${e.message}</div>`;
        }
    },

    // PRODUCTS CRUD

    async loadProducts() {
        const container = document.getElementById('admin-products-list');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';

        try {
            const [prods, cats] = await Promise.all([
                API.get('/products'),
                API.get('/categories')
            ]);
            this.products = prods.data || prods;
            this.categories = cats;

            // Render category select in product forms
            const formCatSelect = document.getElementById('admin-prod-category');
            if (formCatSelect) {
                const prodCats = cats.filter(c => c.type === 'product');
                formCatSelect.innerHTML = prodCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }

            this.renderProductsList();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderProductsList() {
        const container = document.getElementById('admin-products-list');
        if (!container) return;

        if (this.products.length === 0) {
            container.innerHTML = '<p class="text-muted py-3 text-center">Aucun produit en stock.</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark align-middle">
                    <thead>
                        <tr>
                            <th>Image</th>
                            <th>Nom</th>
                            <th>Catégorie</th>
                            <th>Prix (Ar)</th>
                            <th>Stock</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.products.map(p => `
                            <tr>
                                <td><img src="${p.image_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${p.name}" class="order-item-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'"></td>
                                <td><strong>${p.name}</strong></td>
                                <td>${p.category_name || 'Autre'}</td>
                                <td>${formatPrice(p.price)}</td>
                                <td>
                                    <span class="badge ${p.stock > 10 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}">
                                        ${p.stock} pcs
                                    </span>
                                </td>
                                <td>
                                    <button type="button" class="btn btn-outline-info btn-xs mr-1" onclick="Admin.editProduct(${p.id})"><i class="fas fa-edit"></i></button>
                                    <button type="button" class="btn btn-outline-danger btn-xs" onclick="Admin.deleteProduct(${p.id})"><i class="fas fa-trash-alt"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async handleProductSubmit() {
        const id = document.getElementById('admin-prod-id').value;
        const name = document.getElementById('admin-prod-name').value.trim();
        const price = parseFloat(document.getElementById('admin-prod-price').value.replace(/\s/g, ''));
        const stock = parseInt(document.getElementById('admin-prod-stock').value);
        const category_id = document.getElementById('admin-prod-category').value;
        const description = document.getElementById('admin-prod-desc').value.trim();
        
        // Use default placeholders if no file or URL uploaded
        let image_url = document.getElementById('admin-prod-image-url').value.trim();
        if (!image_url && !this.productImageBase64 && !id) {
            image_url = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'; // default placeholder
        }

        if (!name || price <= 0 || stock < 0) {
            Notify.show("Veuillez renseigner correctement les informations du produit.", 'warning');
            return;
        }

        const payload = {
            name,
            price,
            stock,
            category_id,
            description,
            image_url,
            image_base64: this.productImageBase64
        };

        try {
            if (id) {
                // Update
                await API.put(`/products/${id}`, payload);
                Notify.show("Produit mis à jour avec succès !", 'success');
            } else {
                // Create
                await API.post('/products', payload);
                Notify.show("Produit créé avec succès !", 'success');
            }

            this.resetProductForm();
            this.loadProducts();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    editProduct(id) {
        const prod = this.products.find(p => p.id === id);
        if (!prod) return;

        document.getElementById('admin-prod-title').textContent = "Modifier le Produit";
        document.getElementById('admin-prod-submit-text').textContent = "Mettre à jour";
        document.getElementById('admin-prod-id').value = prod.id;
        document.getElementById('admin-prod-name').value = prod.name;
        document.getElementById('admin-prod-price').value = prod.price ? Number(prod.price).toLocaleString('fr-FR') : '';
        document.getElementById('admin-prod-stock').value = prod.stock;
        document.getElementById('admin-prod-category').value = prod.category_id || '';
        document.getElementById('admin-prod-desc').value = prod.description || '';
        document.getElementById('admin-prod-image-url').value = prod.image_url || '';
        document.getElementById('admin-prod-file').value = '';
        this.productImageBase64 = null;
        
        // Show preview
        const previewSrc = prod.image_url || null;
        this.setProductPreview(previewSrc);
        
        // Scroll to form
        document.getElementById('admin-prod-form-card').scrollIntoView({ behavior: 'smooth' });
    },

    async deleteProduct(id) {
        const ok = await Notify.confirm("Voulez-vous vraiment supprimer ce produit ? Cette action est irréversible.");
        if (!ok) return;
        try {
            await API.delete(`/products/${id}`);
            Notify.show("Produit supprimé !", 'success');
            this.loadProducts();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    resetProductForm() {
        document.getElementById('admin-prod-title').textContent = "Ajouter un Produit";
        document.getElementById('admin-prod-submit-text').textContent = "Enregistrer";
        document.getElementById('admin-prod-id').value = '';
        document.getElementById('admin-product-form').reset();
        this.productImageBase64 = null;
        document.getElementById('admin-prod-file').value = '';
        this.setProductPreview(null);
    },

    // VIDEOS CRUD

    async loadVideos() {
        const container = document.getElementById('admin-videos-list');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';

        try {
            const [vids, cats] = await Promise.all([
                API.get('/videos'),
                API.get('/categories')
            ]);
            this.videos = vids;
            this.categories = cats;

            // Render category select in video forms
            const formCatSelect = document.getElementById('admin-vid-category');
            if (formCatSelect) {
                const vidCats = cats.filter(c => c.type === 'video');
                formCatSelect.innerHTML = vidCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }

            this.renderVideosList();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderVideosList() {
        const container = document.getElementById('admin-videos-list');
        if (!container) return;

        if (this.videos.length === 0) {
            container.innerHTML = '<p class="text-muted py-3 text-center">Aucune vidéo enregistrée.</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark align-middle">
                    <thead>
                        <tr>
                            <th>Miniature</th>
                            <th>Titre</th>
                            <th>Catégorie</th>
                            <th>Exclusive</th>
                            <th>Prix (Ar)</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.videos.map(v => `
                            <tr>
                                <td><img src="${v.thumbnail_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${v.title}" class="order-item-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'"></td>
                                <td><strong>${v.title}</strong></td>
                                <td>${v.category_name || 'Autre'}</td>
                                <td>
                                    <span class="badge ${v.is_exclusive ? 'badge-exclusive' : 'badge-free'}">
                                        ${v.is_exclusive ? 'OUI (Premium)' : 'NON (Gratuit)'}
                                    </span>
                                </td>
                                <td>${v.price > 0 ? formatPrice(v.price) : 'Gratuit'}</td>
                                <td>
                                    <button type="button" class="btn btn-outline-info btn-xs mr-1" onclick="Admin.editVideo(${v.id})"><i class="fas fa-edit"></i></button>
                                    <button type="button" class="btn btn-outline-danger btn-xs" onclick="Admin.deleteVideo(${v.id})"><i class="fas fa-trash-alt"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async handleVideoSubmit() {
        const id = document.getElementById('admin-vid-id').value;
        const title = document.getElementById('admin-vid-title-input').value.trim();
        const category_id = document.getElementById('admin-vid-category').value;
        const video_url = document.getElementById('admin-vid-url').value.trim();
        const is_exclusive = document.getElementById('admin-vid-exclusive').checked ? 1 : 0;
        const price = parseFloat(document.getElementById('admin-vid-price').value.replace(/\s/g, '') || 0.0);
        const description = document.getElementById('admin-vid-desc').value.trim();
        
        let thumbnail_url = document.getElementById('admin-vid-thumb-url').value.trim();
        if (!thumbnail_url && !this.videoThumbnailBase64 && !id) {
            thumbnail_url = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'; // default placeholder
        }

        if (!title || !video_url) {
            Notify.show("Veuillez renseigner au moins le titre et l'URL de streaming.", 'warning');
            return;
        }

        const payload = {
            title,
            category_id,
            video_url,
            is_exclusive,
            price,
            description,
            thumbnail_url,
            thumbnail_base64: this.videoThumbnailBase64
        };

        try {
            if (id) {
                await API.put(`/videos/${id}`, payload);
                Notify.show("Vidéo mise à jour !", 'success');
            } else {
                await API.post('/videos', payload);
                Notify.show("Vidéo créée !", 'success');
            }

            this.resetVideoForm();
            this.loadVideos();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    editVideo(id) {
        const vid = this.videos.find(v => v.id === id);
        if (!vid) return;

        document.getElementById('admin-vid-form-title').textContent = "Modifier la Vidéo";
        document.getElementById('admin-vid-submit-text').textContent = "Mettre à jour";
        document.getElementById('admin-vid-id').value = vid.id;
        document.getElementById('admin-vid-title-input').value = vid.title;
        document.getElementById('admin-vid-category').value = vid.category_id || '';
        document.getElementById('admin-vid-url').value = vid.video_url;
        document.getElementById('admin-vid-exclusive').checked = !!vid.is_exclusive;
        document.getElementById('admin-vid-price').value = vid.price ? Number(vid.price).toLocaleString('fr-FR') : '0';
        document.getElementById('admin-vid-desc').value = vid.description || '';
        document.getElementById('admin-vid-thumb-url').value = vid.thumbnail_url || '';
        document.getElementById('admin-vid-file').value = '';
        this.videoThumbnailBase64 = null;
        
        // Show preview
        this.setVideoPreview(vid.thumbnail_url || null);
        
        // Scroll to form
        document.getElementById('admin-vid-form-card').scrollIntoView({ behavior: 'smooth' });
    },

    async deleteVideo(id) {
        const ok = await Notify.confirm("Voulez-vous vraiment supprimer cette vidéo ?");
        if (!ok) return;
        try {
            await API.delete(`/videos/${id}`);
            Notify.show("Vidéo supprimée !", 'success');
            this.loadVideos();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    resetVideoForm() {
        document.getElementById('admin-vid-form-title').textContent = "Publier une Vidéo";
        document.getElementById('admin-vid-submit-text').textContent = "Enregistrer";
        document.getElementById('admin-vid-id').value = '';
        document.getElementById('admin-video-form').reset();
        this.videoThumbnailBase64 = null;
        document.getElementById('admin-vid-file').value = '';
        this.setVideoPreview(null);
    },

    // USERS MANAGEMENT

    async loadUsers() {
        const container = document.getElementById('admin-users-list');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';

        try {
            const users = await API.get('/admin/users');
            this.users = users;
            this.renderUsersList();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderUsersList() {
        const container = document.getElementById('admin-users-list');
        if (!container) return;

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark">
                    <thead>
                        <tr>
                            <th>Nom complet</th>
                            <th>Email</th>
                            <th>Rôle</th>
                            <th>Abonnement</th>
                            <th>Date inscription</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.users.map(u => `
                            <tr>
                                <td><strong>${u.fullname}</strong></td>
                                <td>${u.email}</td>
                                <td>
                                    <select id="role-select-${u.id}" class="form-control form-control-sm text-xs bg-dark inline-select" onchange="Admin.updateUserRole(${u.id}, this.value, document.getElementById('sub-select-${u.id}').value)">
                                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </td>
                                <td>
                                    <select id="sub-select-${u.id}" class="form-control form-control-sm text-xs bg-dark inline-select" onchange="Admin.updateUserRole(${u.id}, document.getElementById('role-select-${u.id}').value, this.value)">
                                        <option value="free" ${u.subscription_status === 'free' ? 'selected' : ''}>Gratuit</option>
                                        <option value="premium" ${u.subscription_status === 'premium' ? 'selected' : ''}>Premium</option>
                                    </select>
                                </td>
                                <td class="text-muted text-xs">${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                                <td>
                                    <button type="button" class="btn btn-outline-danger btn-xs" ${Auth.user && u.id == Auth.user.id ? 'disabled' : ''} onclick="Admin.deleteUser(${u.id})">
                                        <i class="fas fa-ban mr-1"></i> Bannir
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async updateUserRole(id, role, subStatus) {
        try {
            await API.put(`/admin/users/${id}`, {
                role: role,
                subscription_status: subStatus
            });
            Notify.show("Statut utilisateur mis à jour !", 'success');
            this.loadUsers();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    async deleteUser(id) {
        if (Auth.user && id == Auth.user.id) {
            Notify.show("Vous ne pouvez pas supprimer votre propre compte.", 'warning');
            return;
        }
        const ok = await Notify.confirm("Voulez-vous vraiment bannir et supprimer cet utilisateur ? Ses favoris et commandes seront également supprimés.");
        if (!ok) return;
        try {
            await API.delete(`/admin/users/${id}`);
            Notify.show("Utilisateur supprimé !", 'success');
            this.loadUsers();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    // ORDERS MANAGEMENT

    async loadAdminOrders(page) {
        const container = document.getElementById('admin-orders-list');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';
        try {
            const pg = page || 1;
            const resp = await API.get(`/admin/orders?page=${pg}&limit=20`);
            this.adminOrders = resp.data || [];
            this.adminOrdersPage = resp.page || 1;
            this.adminOrdersTotalPages = resp.total_pages || 1;
            this.renderAdminOrdersList();
            this.renderAdminOrdersPagination();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderAdminOrdersList() {
        const container = document.getElementById('admin-orders-list');
        if (!container) return;
        const dl = { 'pending': 'En attente', 'preparing': 'En préparation', 'shipped': 'Expédiée', 'delivered': 'Livrée' };
        const db = { 'pending': 'badge-warning', 'preparing': 'badge-info', 'shipped': 'badge-primary', 'delivered': 'badge-success' };
        const flow = ['pending', 'preparing', 'shipped', 'delivered'];
        if (!this.adminOrders || this.adminOrders.length === 0) {
            container.innerHTML = '<p class="text-muted py-3 text-center">Aucune commande.</p>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark align-middle">
                    <thead><tr><th>ID</th><th>Client</th><th>Total</th><th>Statut</th><th>Livraison</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${this.adminOrders.map(o => {
                            if (o.status === 'pending_validation') {
                                return `
                                <tr class="border-warning">
                                    <td>#${o.id}</td>
                                    <td>${o.user_name || o.user_id}</td>
                                    <td>${formatPrice(o.total_amount)}</td>
                                    <td><span class="badge badge-warning">En attente de validation</span></td>
                                    <td>—</td>
                                    <td>
                                        <button class="btn btn-success btn-sm" onclick="Admin.validateOrder(${o.id})">
                                            <i class="fas fa-check mr-1"></i> Valider
                                        </button>
                                    </td>
                                </tr>`;
                            }
                            const curIdx = flow.indexOf(o.delivery_status);
                            const statusLabel = o.status === 'validated' ? 'Validée' : (o.status === 'paid' ? 'Payée' : o.status);
                            const statusBadge = o.status === 'validated' ? 'badge-success' : (o.status === 'paid' ? 'badge-success' : 'badge-warning');
                            return `
                            <tr>
                                <td>#${o.id}</td>
                                <td>${o.user_name || o.user_id}</td>
                                <td>${formatPrice(o.total_amount)}</td>
                                <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
                                <td><span class="badge ${db[o.delivery_status] || 'badge-warning'}">${dl[o.delivery_status] || o.delivery_status}</span></td>
                                <td>
                                    <select class="form-control form-control-sm text-xs bg-dark inline-select" onchange="Admin.updateDeliveryStatus(${o.id}, this.value)" style="width:130px;">
                                        ${flow.map((s, i) =>
                                            `<option value="${s}" ${o.delivery_status === s ? 'selected' : ''} ${i <= curIdx && o.delivery_status !== s ? 'disabled' : ''}>${dl[s]}</option>`
                                        ).join('')}
                                    </select>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderAdminOrdersPagination() {
        const container = document.getElementById('admin-orders-pagination');
        if (!container) return;
        if (this.adminOrdersTotalPages <= 1) { container.innerHTML = ''; return; }
        let html = '';
        for (let i = 1; i <= this.adminOrdersTotalPages; i++) {
            html += `<button class="btn ${i === this.adminOrdersPage ? 'btn-red' : 'btn-secondary'} btn-sm" onclick="Admin.loadAdminOrders(${i})">${i}</button>`;
        }
        container.innerHTML = html;
    },

    async updateDeliveryStatus(orderId, status) {
        try {
            await API.put(`/orders/${orderId}/delivery`, { delivery_status: status });
            Notify.show(`Statut mis à jour : ${status}`, 'success');
            this.loadAdminOrders();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    async validateOrder(orderId) {
        try {
            const res = await API.post(`/orders/${orderId}/validate`, {});
            Notify.show(res.message || 'Commande validée !', 'success');
            this.loadAdminOrders();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    // TICKETS ADMIN

    async loadAdminTickets() {
        const container = document.getElementById('admin-tickets-list');
        if (!container) return;
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';
        try {
            const tickets = await API.get('/admin/tickets');
            this.adminTickets = tickets || [];
            this.renderAdminTicketsList();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderAdminTicketsList() {
        const container = document.getElementById('admin-tickets-list');
        if (!container) return;
        if (!this.adminTickets || this.adminTickets.length === 0) {
            container.innerHTML = '<p class="text-muted py-3 text-center">Aucun ticket.</p>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark align-middle">
                    <thead><tr><th>ID</th><th>Client</th><th>Événement</th><th>Places</th><th>Type</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${this.adminTickets.map(t => {
                            const statusLabels = {
                                'pending_validation': 'En attente de validation',
                                'pending_payment': 'Paiement en attente',
                                'confirmed': 'Confirmé',
                                'used': 'Utilisé',
                                'cancelled': 'Annulé'
                            };
                            const statusBadges = {
                                'pending_validation': 'badge-warning',
                                'pending_payment': 'badge-warning',
                                'confirmed': 'badge-success',
                                'used': 'badge-info',
                                'cancelled': 'badge-danger'
                            };
                            const showValidate = t.status === 'pending_validation';
                            return `
                            <tr class="${showValidate ? 'border-warning' : ''}">
                                <td>#${t.id}</td>
                                <td>${t.user_name || t.user_id}</td>
                                <td>${t.event_title}</td>
                                <td>${t.quantity}</td>
                                <td>${t.ticket_type === 'vip' ? '<span class="badge badge-gold">VIP</span>' : 'Normal'}</td>
                                <td><span class="badge ${statusBadges[t.status] || 'badge-warning'}">${statusLabels[t.status] || t.status}</span></td>
                                <td>
                                    ${showValidate ? `<button class="btn btn-success btn-sm" onclick="Admin.validateTicket(${t.id})">
                                        <i class="fas fa-check mr-1"></i> Valider
                                    </button>` : '—'}
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async validateTicket(ticketId) {
        try {
            const res = await API.post(`/tickets/${ticketId}/validate`, {});
            Notify.show(res.message || 'Ticket validé !', 'success');
            this.loadAdminTickets();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    // EVENTS CRUD

    async loadAdminEvents() {
        const container = document.getElementById('admin-events-list');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('/events?limit=50');
            this.adminEvents = resp.data || resp;
            this.renderAdminEventsList();
        } catch (e) {
            container.innerHTML = `<p class="text-danger">Erreur: ${e.message}</p>`;
        }
    },

    renderAdminEventsList() {
        const container = document.getElementById('admin-events-list');
        if (!container) return;
        const list = this.adminEvents;
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="text-muted py-3 text-center">Aucun événement.</p>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-dark align-middle">
                    <thead>
                        <tr>
                            <th>Titre</th>
                            <th>Date</th>
                            <th>Normal</th>
                            <th>VIP</th>
                            <th>Places</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(ev => `
                            <tr>
                                <td><strong>${ev.title}</strong></td>
                                <td class="text-sm">${new Date(ev.event_date).toLocaleDateString('fr-FR')}</td>
                                <td>${formatPrice(ev.price)}</td>
                                <td>${ev.vip_price > 0 ? formatPrice(ev.vip_price) : '-'}</td>
                                <td><span class="badge ${ev.available_tickets > 0 ? 'badge-success' : 'badge-danger'}">${ev.available_tickets}/${ev.total_tickets}</span></td>
                                <td>
                                    <button class="btn btn-outline-info btn-xs mr-1" onclick="Admin.editEvent(${ev.id})"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-outline-danger btn-xs" onclick="Admin.deleteEvent(${ev.id})"><i class="fas fa-trash-alt"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    async handleEventSubmit() {
        const id = document.getElementById('admin-event-id').value;
        const title = document.getElementById('admin-event-title-input').value.trim();
        const description = document.getElementById('admin-event-desc').value.trim();
        const event_date = document.getElementById('admin-event-date').value;
        const location = document.getElementById('admin-event-location').value.trim();
        const price = parseFloat(document.getElementById('admin-event-price').value.replace(/\s/g, '')) || 0;
        const total_tickets = parseInt(document.getElementById('admin-event-tickets').value) || 100;
        const vip_price = parseFloat(document.getElementById('admin-event-vip-price').value.replace(/\s/g, '')) || 0;
        const vip_tickets = parseInt(document.getElementById('admin-event-vip-tickets').value) || 0;
        let image_url = document.getElementById('admin-event-image-url').value.trim();

        if (!image_url && !this.eventImageBase64 && !id) {
            image_url = '';
        }

        if (!title || !event_date) {
            Notify.show("Titre et date requis.", 'warning');
            return;
        }

        const payload = { title, description, event_date, location, price, total_tickets, vip_price, vip_tickets, image_url, image_base64: this.eventImageBase64 };

        try {
            if (id) {
                await API.put(`/events/${id}`, payload);
                Notify.show("Événement mis à jour !", 'success');
            } else {
                await API.post('/events', payload);
                Notify.show("Événement créé !", 'success');
            }
            this.resetEventForm();
            this.loadAdminEvents();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    editEvent(id) {
        const ev = this.adminEvents.find(e => e.id === id);
        if (!ev) return;

        document.getElementById('admin-event-title').textContent = "Modifier l'Événement";
        document.getElementById('admin-event-submit-text').textContent = "Mettre à jour";
        document.getElementById('admin-event-id').value = ev.id;
        document.getElementById('admin-event-title-input').value = ev.title;
        document.getElementById('admin-event-desc').value = ev.description || '';
        const d = new Date(ev.event_date);
        const iso = d.toISOString().slice(0, 16);
        document.getElementById('admin-event-date').value = iso;
        document.getElementById('admin-event-location').value = ev.location || '';
        document.getElementById('admin-event-price').value = ev.price ? Number(ev.price).toLocaleString('fr-FR') : '0';
        document.getElementById('admin-event-tickets').value = ev.total_tickets;
        document.getElementById('admin-event-vip-price').value = ev.vip_price ? Number(ev.vip_price).toLocaleString('fr-FR') : '0';
        document.getElementById('admin-event-vip-tickets').value = ev.vip_tickets || 0;
        document.getElementById('admin-event-image-url').value = ev.image_url || '';
        document.getElementById('admin-event-file').value = '';
        this.eventImageBase64 = null;
        this.setEventPreview(ev.image_url || null);
    },

    async deleteEvent(id) {
        const ok = await Notify.confirm("Supprimer cet événement ?");
        if (!ok) return;
        try {
            await API.delete(`/events/${id}`);
            Notify.show("Événement supprimé !", 'success');
            this.loadAdminEvents();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    resetEventForm() {
        document.getElementById('admin-event-title').textContent = "Ajouter un Événement";
        document.getElementById('admin-event-submit-text').textContent = "Enregistrer";
        document.getElementById('admin-event-id').value = '';
        document.getElementById('admin-event-form').reset();
        this.eventImageBase64 = null;
        document.getElementById('admin-event-file').value = '';
        this.setEventPreview(null);
    },

    // GENERAL FLOW

    switchTab(tab) {
        // Toggle tab buttons
        const tabBtns = document.querySelectorAll('.admin-tab-btn');
        tabBtns.forEach(btn => {
            if (btn.getAttribute('onclick').includes(tab)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle contents
        const contents = document.querySelectorAll('.admin-tab-content');
        contents.forEach(c => {
            if (c.id === `admin-tab-${tab}`) {
                c.classList.remove('hidden');
            } else {
                c.classList.add('hidden');
            }
        });

        // Load correct data
        if (tab === 'products') {
            this.initUploadZone();
            this.loadProducts();
        } else if (tab === 'stats') this.loadStats();
        else if (tab === 'videos') {
            this.initVideoUploadZone();
            this.loadVideos();
        } else if (tab === 'events') {
            this.initEventUploadZone();
            this.loadAdminEvents();
    } else if (tab === 'orders') {
        this.loadAdminOrders();
    } else if (tab === 'tickets') {
        this.loadAdminTickets();
    } else if (tab === 'users') this.loadUsers();
        else if (tab === 'scanner') {
            document.getElementById('scanner-result').classList.add('hidden');
        }
    },

    // Upload zone drag-and-drop
    initUploadZone() {
        const zone = document.getElementById('admin-prod-upload-zone');
        if (!zone) return;
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = document.getElementById('admin-prod-file');
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                this.readProductImage(input);
            }
        });
    },

    // Video upload zone drag-and-drop
    initVideoUploadZone() {
        const zone = document.getElementById('admin-vid-upload-zone');
        if (!zone) return;
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = document.getElementById('admin-vid-file');
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                this.readVideoThumbnail(input);
            }
        });
    },

    // Product preview helpers
    setProductPreview(src) {
        const img = document.getElementById('admin-prod-preview');
        const placeholder = document.getElementById('admin-prod-preview-placeholder');
        const clearBtn = document.getElementById('admin-prod-preview-clear');
        if (src) {
            img.src = src;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');
            clearBtn.classList.remove('hidden');
        } else {
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
            clearBtn.classList.add('hidden');
        }
    },

    clearProductPreview() {
        this.productImageBase64 = null;
        document.getElementById('admin-prod-file').value = '';
        this.setProductPreview(null);
    },

    previewProductUrl(url) {
        if (url && url.trim()) {
            document.getElementById('admin-prod-file').value = '';
            this.productImageBase64 = null;
            this.setProductPreview(url.trim());
        } else {
            this.clearProductPreview();
        }
    },

    // Video preview helpers
    setVideoPreview(src) {
        const img = document.getElementById('admin-vid-preview');
        const placeholder = document.getElementById('admin-vid-preview-placeholder');
        const clearBtn = document.getElementById('admin-vid-preview-clear');
        if (src) {
            img.src = src;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');
            clearBtn.classList.remove('hidden');
        } else {
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
            clearBtn.classList.add('hidden');
        }
    },

    clearVideoPreview() {
        this.videoThumbnailBase64 = null;
        this.setVideoPreview(null);
    },

    previewVideoUrl(url) {
        if (url && url.trim()) {
            this.setVideoPreview(url.trim());
        } else {
            this.clearVideoPreview();
        }
    },

    // Event preview helpers
    setEventPreview(src) {
        const img = document.getElementById('admin-event-preview');
        const placeholder = document.getElementById('admin-event-preview-placeholder');
        const clearBtn = document.getElementById('admin-event-preview-clear');
        if (src) {
            img.src = src;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');
            clearBtn.classList.remove('hidden');
        } else {
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
            clearBtn.classList.add('hidden');
        }
    },

    clearEventPreview() {
        this.eventImageBase64 = null;
        document.getElementById('admin-event-file').value = '';
        this.setEventPreview(null);
    },

    previewEventUrl(url) {
        if (url && url.trim()) {
            document.getElementById('admin-event-file').value = '';
            this.eventImageBase64 = null;
            this.setEventPreview(url.trim());
        } else {
            this.clearEventPreview();
        }
    },

    async readEventImage(input) {
        if (input.files && input.files[0]) {
            try {
                this.eventImageBase64 = await this.fileToBase64(input.files[0]);
                this.setEventPreview(this.eventImageBase64);
            } catch (e) {
                console.error("Error reading event file:", e);
            }
        }
    },

    initEventUploadZone() {
        const zone = document.getElementById('admin-event-upload-zone');
        if (!zone) return;
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => { zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = document.getElementById('admin-event-file');
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                this.readEventImage(input);
            }
        });
    },

    // File helpers
    async readProductImage(input) {
        if (input.files && input.files[0]) {
            try {
                this.productImageBase64 = await this.fileToBase64(input.files[0]);
                this.setProductPreview(this.productImageBase64);
            } catch (e) {
                console.error("Error reading product file:", e);
            }
        }
    },

    async readVideoThumbnail(input) {
        if (input.files && input.files[0]) {
            try {
                this.videoThumbnailBase64 = await this.fileToBase64(input.files[0]);
                this.setVideoPreview(this.videoThumbnailBase64);
            } catch (e) {
                console.error("Error reading video thumbnail file:", e);
            }
        }
    },

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    async scanTicket() {
        const token = document.getElementById('scanner-token-input').value.trim();
        if (!token) {
            Notify.show('Veuillez entrer un token QR.', 'warning');
            return;
        }
        const resultDiv = document.getElementById('scanner-result');
        resultDiv.innerHTML = '<div class="spinner"></div>';
        resultDiv.classList.remove('hidden');
        try {
            const res = await API.post('/tickets/verify', { qr_token: token });
            if (res.valid) {
                resultDiv.className = 'p-3 rounded text-center border border-success';
                resultDiv.innerHTML = `
                    <i class="fas fa-check-circle fa-3x text-success mb-2"></i>
                    <h4 class="text-success">Ticket Valide</h4>
                    <p><strong>${res.ticket.event_title}</strong></p>
                    <p class="text-sm">${res.ticket.quantity} ticket(s) — ${res.ticket.ticket_type === 'vip' ? '<span class="badge badge-gold">VIP</span>' : 'Normal'}</p>
                    <p class="text-sm text-muted">Réservé par : ${res.ticket.username}</p>
                `;
            } else {
                resultDiv.className = 'p-3 rounded text-center border border-danger';
                resultDiv.innerHTML = `
                    <i class="fas fa-times-circle fa-3x text-danger mb-2"></i>
                    <h4 class="text-danger">Ticket Invalide</h4>
                    <p>${res.message}</p>
                `;
            }
        } catch (e) {
            resultDiv.className = 'p-3 rounded text-center border border-danger';
            resultDiv.innerHTML = `<i class="fas fa-exclamation-triangle fa-3x text-danger mb-2"></i><p>${e.message}</p>`;
        }
    },

    startScanner() {
        const video = document.getElementById('scanner-camera');
        if (!video) return;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    this.scannerStream = stream;
                    video.srcObject = stream;
                    video.play();
                    Notify.show('Caméra activée. Pointez vers le QR code.', 'info');
                    this.scanFrame();
                })
                .catch(err => {
                    Notify.show('Erreur d\'accès à la caméra: ' + err.message, 'error');
                });
        } else {
            Notify.show('Votre navigateur ne supporte pas l\'accès à la caméra.', 'warning');
        }
    },

    scanFrame() {
        const video = document.getElementById('scanner-camera');
        if (!video || !this.scannerStream) return;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            this.scanRaf = requestAnimationFrame(() => this.scanFrame());
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code) {
            try {
                const parsed = JSON.parse(code.data);
                if (parsed.qr_token) {
                    document.getElementById('scanner-token-input').value = parsed.qr_token;
                    this.stopScanner();
                    this.scanTicket();
                    return;
                }
            } catch (e) {
                if (code.data.length > 5) {
                    document.getElementById('scanner-token-input').value = code.data;
                    this.stopScanner();
                    this.scanTicket();
                    return;
                }
            }
        }
        this.scanRaf = requestAnimationFrame(() => this.scanFrame());
    },

    stopScanner() {
        if (this.scanRaf) {
            cancelAnimationFrame(this.scanRaf);
            this.scanRaf = null;
        }
        if (this.scannerStream) {
            this.scannerStream.getTracks().forEach(track => track.stop());
            this.scannerStream = null;
        }
        const video = document.getElementById('scanner-camera');
        if (video) video.srcObject = null;
    }
};
