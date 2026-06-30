/**
 * User Authentication module for Morondartva-Store.
 * Controls client state, login/register logic, and user area rendering.
 */

const Auth = {
    user: null,

    init() {
        // Load initial user state
        const savedUser = localStorage.getItem('user_profile');
        if (savedUser) {
            try {
                this.user = JSON.parse(savedUser);
            } catch (e) {
                this.user = null;
            }
        }
        
        // Listen to auth changes
        window.addEventListener('authChange', () => {
            this.syncState();
        });

        this.syncState();
    },

    syncState() {
        const token = localStorage.getItem('session_token');
        if (!token) {
            this.user = null;
            localStorage.removeItem('user_profile');
        }

        // Dispatch UI updates
        this.updateHeaderUI();
        this.updateProfilePage();
    },

    async login(email, password) {
        try {
            const res = await API.post('/auth/login', { email, password });
            localStorage.setItem('session_token', res.token);
            localStorage.setItem('user_profile', JSON.stringify(res.user));
            this.user = res.user;
            window.dispatchEvent(new Event('authChange'));
            return res;
        } catch (e) {
            Notify.show(e.message, 'error');
            throw e;
        }
    },

    async register(fullname, email, password) {
        try {
            await API.post('/auth/register', { fullname, email, password });
            await this.login(email, password);
            closeAuthModal();
            Notify.show("Inscription réussie ! Bienvenue parmi nous.", 'success');
            window.location.hash = '#home';
        } catch (e) {
            Notify.show(e.message, 'error');
            throw e;
        }
    },

    async logout() {
        try {
            await API.post('/auth/logout');
        } catch (e) {
            console.error("Logout API failed:", e);
        }
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_profile');
        this.user = null;
        window.dispatchEvent(new Event('authChange'));
        // Redirect to Home
        window.location.hash = '#home';
    },

    async loadFullProfile() {
        if (!this.user) return null;
        try {
            const profile = await API.get('/auth/profile');
            // Cache updated profile info (without deep orders list)
            const basicUser = {
                id: profile.id,
                email: profile.email,
                fullname: profile.fullname,
                role: profile.role,
                subscription_status: profile.subscription_status
            };
            localStorage.setItem('user_profile', JSON.stringify(basicUser));
            this.user = basicUser;
            return profile;
        } catch (e) {
            console.error("Failed to load profile details:", e);
            return null;
        }
    },

    async updateProfile(fullname, email, password) {
        try {
            const res = await API.put('/auth/profile', { fullname, email, password });
            localStorage.setItem('user_profile', JSON.stringify(res.user));
            this.user = res.user;
            window.dispatchEvent(new Event('authChange'));
            Notify.show("Profil mis à jour avec succès !", 'success');
            return res;
        } catch (e) {
            Notify.show(e.message, 'error');
            throw e;
        }
    },

    async upgradeToPremium() {
        const premiumAmount = 30000;
        const paymentModalHTML = `
            <div style="max-width: 400px; margin: 0 auto;">
                <div class="text-center mb-4">
                    <i class="fas fa-crown fa-3x text-gold mb-2"></i>
                    <h4>Devenir Premium</h4>
                    <p class="text-muted text-sm">Abonnement à <strong>${formatPrice(premiumAmount)}</strong> par mois</p>
                </div>
                <div id="payment-method-step">
                    <div class="form-group mb-3">
                        <label class="form-label">Mode de paiement</label>
                        <select id="premium-payment-method" class="form-control">
                            <option value="mvola">MVola</option>
                            <option value="orange_money">Orange Money</option>
                            <option value="airtel_money">Airtel Money</option>
                        </select>
                    </div>
                    <div class="form-group mb-4">
                        <label class="form-label">Numéro de téléphone</label>
                        <input type="tel" id="premium-phone" class="form-control" placeholder="034 00 000 00" inputmode="numeric">
                    </div>
                    <button class="btn btn-gold w-100" onclick="Auth.submitPremiumPayment()">
                        <i class="fas fa-mobile-alt mr-1"></i> Payer ${formatPrice(premiumAmount)}
                    </button>
                    <div class="text-center mt-2">
                        <button class="btn btn-sm btn-link text-muted" onclick="closeModal()">Annuler</button>
                    </div>
                </div>
                <div id="premium-ussd-step" class="hidden">
                    <div class="text-center">
                        <i class="fas fa-mobile-alt fa-4x text-info mb-3"></i>
                        <p class="mb-1">Composez le code USSD ci-dessous sur votre téléphone :</p>
                        <p id="premium-ussd-code" class="ussd-code-display" style="font-size:1.6rem;font-weight:bold;color:#0dcaf0;user-select:all;word-break:break-all;"></p>
                        <p class="text-xs text-muted" id="premium-ussd-instruction"></p>
                        <div class="mt-3">
                            <a href="#" id="premium-ussd-dial-link" class="btn btn-info btn-sm"><i class="fas fa-phone-alt mr-1"></i> Composer</a>
                            <button id="premium-ussd-copy-btn" class="btn btn-outline-info btn-sm"><i class="fas fa-copy mr-1"></i> Copier</button>
                        </div>
                        <p class="text-xs text-muted mt-3">Après paiement, rafraîchissez la page pour activer votre accès Premium.</p>
                        <button class="btn btn-sm btn-link text-muted mt-2" onclick="closeModal()">Fermer</button>
                    </div>
                </div>
            </div>
        `;
        openModal(paymentModalHTML, ''),
        document.getElementById('modal-title').textContent = 'Paiement Premium';
    },

    async submitPremiumPayment() {
        const method = document.getElementById('premium-payment-method').value;
        const phone = document.getElementById('premium-phone').value.trim();
        if (!phone) {
            Notify.show('Veuillez entrer votre numéro de téléphone.', 'warning');
            return;
        }
        try {
            const res = await API.post('/auth/upgrade', { payment_method: method, phone_number: phone });
            if (res.ussd_code) {
                document.getElementById('payment-method-step').classList.add('hidden');
                document.getElementById('premium-ussd-step').classList.remove('hidden');
                document.getElementById('premium-ussd-code').textContent = res.ussd_code;
                document.getElementById('premium-ussd-instruction').textContent = res.instruction || `Composez ${res.ussd_code} sur votre téléphone.`;
                document.getElementById('premium-ussd-dial-link').href = `tel:${res.ussd_code.replace(/#/g, '%23')}`;
                document.getElementById('premium-ussd-copy-btn').onclick = function() {
                    navigator.clipboard.writeText(res.ussd_code);
                    Notify.show('Code USSD copié !', 'success');
                };
            } else if (res.subscription_status === 'premium') {
                this.user.subscription_status = 'premium';
                localStorage.setItem('user_profile', JSON.stringify(this.user));
                window.dispatchEvent(new Event('authChange'));
                window.dispatchEvent(new Event('premiumUpgraded'));
                closeModal();
                Notify.show(res.message, 'success');
            } else {
                Notify.show(res.message || 'Erreur lors du paiement.', 'error');
            }
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    showPremiumPayment() {
        this.upgradeToPremium();
    },

    updateHeaderUI() {
        const guestMenu = document.getElementById('nav-guest-menu');
        const userMenu = document.getElementById('nav-user-menu');
        const userFullnameSpan = document.getElementById('nav-user-fullname');
        const adminLink = document.getElementById('nav-admin-link');
        const scannerLink = document.getElementById('nav-scanner-link');
        const mobileScannerLink = document.getElementById('mobile-nav-scanner');
        const subBadge = document.getElementById('nav-user-sub-badge');

        const isScanner = this.user && this.user.role === 'scanner';

        document.body.classList.toggle('scanner-mode', isScanner);

        if (this.user) {
            if (guestMenu) guestMenu.classList.add('hidden');
            if (userMenu) userMenu.classList.remove('hidden');
            if (userFullnameSpan) userFullnameSpan.textContent = this.user.fullname;

            if (isScanner) {
                if (subBadge) {
                    subBadge.textContent = 'Scanner';
                    subBadge.className = 'badge badge-scanner';
                }
                if (scannerLink) scannerLink.classList.remove('hidden');
                if (adminLink) adminLink.classList.add('hidden');
                if (mobileScannerLink) mobileScannerLink.classList.remove('hidden');
                if (window.location.hash !== '#scanner') {
                    window.location.hash = '#scanner';
                }
            } else {
                if (subBadge) {
                    if (this.user.role === 'admin') {
                        subBadge.textContent = 'Admin';
                        subBadge.className = 'badge badge-admin';
                    } else if (this.user.subscription_status === 'premium') {
                        subBadge.textContent = 'Premium';
                        subBadge.className = 'badge badge-premium';
                    } else {
                        subBadge.textContent = 'Gratuit';
                        subBadge.className = 'badge badge-free';
                    }
                }
                if (adminLink) {
                    adminLink.classList.toggle('hidden', this.user.role !== 'admin');
                }
                if (scannerLink) {
                    scannerLink.classList.toggle('hidden', this.user.role !== 'admin');
                }
                if (mobileScannerLink) {
                    mobileScannerLink.classList.toggle('hidden', this.user.role !== 'admin');
                }
            }
        } else {
            document.body.classList.remove('scanner-mode');
            if (guestMenu) guestMenu.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
            if (adminLink) adminLink.classList.add('hidden');
            if (scannerLink) scannerLink.classList.add('hidden');
            if (mobileScannerLink) mobileScannerLink.classList.add('hidden');
        }
    },

    async updateProfilePage() {
        const profileSection = document.getElementById('section-profile');
        if (!profileSection || profileSection.classList.contains('hidden')) return;

        if (!this.user) {
            profileSection.innerHTML = `
                <div class="container text-center py-5">
                    <i class="fas fa-lock fa-3x text-muted mb-3"></i>
                    <h2>Accès restreint</h2>
                    <p>Veuillez vous connecter pour voir votre profil et vos commandes.</p>
                    <button class="btn btn-primary btn-lg mt-3" onclick="openAuthModal('login')">Se connecter</button>
                </div>
            `;
            return;
        }

        // Show a loader
        profileSection.innerHTML = `
            <div class="container py-5 text-center">
                <div class="spinner"></div>
                <p class="mt-3">Chargement de votre espace...</p>
            </div>
        `;

        const fullProfile = await this.loadFullProfile();
        if (!fullProfile) {
            profileSection.innerHTML = `<div class="container py-5 text-center"><p class="text-danger">Erreur de chargement du profil.</p></div>`;
            return;
        }

        const steps = [
            { key: 'pending', label: 'En attente', icon: 'fa-hourglass' },
            { key: 'preparing', label: 'En préparation', icon: 'fa-box' },
            { key: 'shipped', label: 'Expédiée', icon: 'fa-truck' },
            { key: 'delivered', label: 'Livrée', icon: 'fa-check-circle' }
        ];
        const stepKeys = steps.map(s => s.key);

        function deliveryProgress(deliveryStatus) {
            const curIdx = stepKeys.indexOf(deliveryStatus);
            if (curIdx === -1) return '';
            return `<div class="delivery-progress">
                ${steps.map((s, i) => {
                    let cls = '';
                    let icon = `<i class="fas ${s.icon}"></i>`;
                    if (i < curIdx) { cls = 'completed'; icon = '<i class="fas fa-check"></i>'; }
                    else if (i === curIdx) cls = 'active';
                    return `<div class="delivery-step ${cls}"><div class="delivery-step-circle">${icon}</div><div class="delivery-step-label">${s.label}</div></div>`;
                }).join('')}
            </div>`;
        }

        let ordersHTML = '';
        if (fullProfile.orders && fullProfile.orders.length > 0) {
            ordersHTML = fullProfile.orders.map(order => {
                const isPendingValidation = order.status === 'pending_validation';
                return `
                <div class="order-card card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <div>
                            <strong>Commande #${order.id}</strong>
                            <span class="text-muted text-sm ml-2">le ${new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                        <span class="badge ${order.status === 'validated' ? 'badge-success' : order.status === 'paid' ? 'badge-success' : 'badge-warning'}">${isPendingValidation ? 'En attente de validation' : order.status === 'validated' ? 'Validée' : order.status === 'paid' ? 'Payée' : order.status}</span>
                    </div>
                    ${isPendingValidation ? `
                    <div class="card-body">
                        <div class="text-center py-3">
                            <i class="fas fa-clock fa-2x text-warning mb-2"></i>
                            <p class="mb-0">Votre commande est en attente de validation par l'administrateur.</p>
                            <p class="text-muted text-sm mt-1">Vous serez notifié dès qu'elle sera confirmée.</p>
                            ${order.payment_status === 'pending' && order.payment_id ? `
                            <button class="btn btn-info btn-sm mt-2" onclick="Auth.confirmOrderPayment(${order.payment_id})">
                                <i class="fas fa-credit-card mr-1"></i> J'ai payé
                            </button>
                            ` : ''}
                        </div>
                    </div>
                    ` : `
                    <div class="px-3 pt-2">
                        ${deliveryProgress(order.delivery_status)}
                    </div>
                    <div class="card-body pt-0">
                        <div class="row">
                            <div class="col-md-8">
                                <div class="order-items-list">
                                    ${order.items ? order.items.map(item => `
                                        <div class="order-item-row d-flex align-items-center justify-content-between py-1 border-bottom">
                                            <div class="d-flex align-items-center">
                                                <img src="${item.image_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${item.product_name}" class="order-item-thumb mr-2" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                                                <span>${item.product_name} <strong class="text-muted">x${item.quantity}</strong></span>
                                            </div>
                                            <span>${formatPrice(item.price * item.quantity)}</span>
                                        </div>
                                    `).join('') : '<p class="text-muted">Aucun détail disponible.</p>'}
                                </div>
                            </div>
                            <div class="col-md-4 border-left">
                                <p class="mb-1"><strong>Méthode:</strong> ${order.payment_method.toUpperCase()}</p>
                                <p class="mb-1"><strong>Téléphone:</strong> ${order.phone_number}</p>
                                <p class="mb-1"><strong>Livraison:</strong> ${order.shipping_address}</p>
                                <h5 class="mt-3 text-red">Total: ${formatPrice(order.total_amount)}</h5>
                            </div>
                        </div>
                    </div>
                    `}
                </div>`;
            }).join('');
        } else {
            ordersHTML = `
                <div class="text-center py-4 bg-dark-card rounded">
                    <p class="text-muted mb-0">Vous n'avez pas encore passé de commande.</p>
                    <a href="#shop" class="btn btn-red btn-sm mt-3">Découvrir la Boutique</a>
                </div>
            `;
        }

        let purchasedVideosHTML = '';
        if (fullProfile.purchased_videos && fullProfile.purchased_videos.length > 0) {
            purchasedVideosHTML = `
                <div class="grid grid-3 gap-3">
                    ${fullProfile.purchased_videos.map(vid => `
                        <div class="video-card card" onclick="playVideoDirect(${vid.id})">
                            <div class="video-thumb-container">
                                <img src="${vid.thumbnail_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${vid.title}" class="video-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                                <div class="play-overlay"><i class="fas fa-play"></i></div>
                            </div>
                            <div class="card-body">
                                <h5>${vid.title}</h5>
                                <p class="text-muted text-sm text-truncate">${vid.description || ''}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            purchasedVideosHTML = `
                <div class="text-center py-4 bg-dark-card rounded">
                    <p class="text-muted mb-0">Vous n'avez pas de vidéos achetées individuellement.</p>
                </div>
            `;
        }

        const isUserPremium = fullProfile.subscription_status === 'premium';
        
        profileSection.innerHTML = `
            <div class="container py-5">
                <div class="row">
                    <!-- Left: Profile Form -->
                    <div class="col-md-4 mb-4">
                        <div class="card bg-dark-card p-4 rounded border-glow mb-4">
                            <h3 class="mb-4 text-glow"><i class="fas fa-user-circle mr-2"></i>Mon Profil</h3>
                            
                            <form id="profile-edit-form" onsubmit="event.preventDefault(); handleProfileUpdateSubmit();">
                                <div class="form-group mb-3">
                                    <label class="form-label"><i class="fas fa-user fa-fw text-muted mr-1"></i> Nom Complet</label>
                                    <input type="text" id="profile-fullname" class="form-control" value="${fullProfile.fullname}" required>
                                </div>
                                <div class="form-group mb-3">
                                    <label class="form-label"><i class="fas fa-envelope fa-fw text-muted mr-1"></i> Adresse Email</label>
                                    <input type="email" id="profile-email" class="form-control" value="${fullProfile.email}" required>
                                </div>
                                <div class="form-group mb-4">
                                    <label class="form-label"><i class="fas fa-lock fa-fw text-muted mr-1"></i> Nouveau mot de passe (optionnel)</label>
                                    <div class="password-wrap">
                                        <input type="password" id="profile-password" class="form-control" placeholder="Laisser vide pour inchangé">
                                        <button type="button" class="password-toggle" onclick="togglePassword('profile-password', this)" tabindex="-1">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </div>
                                </div>
                                <button type="submit" class="btn btn-red w-100"><i class="fas fa-save mr-1"></i> Enregistrer les modifications</button>
                            </form>
                        </div>

                        <!-- Premium card -->
                        <div class="card premium-promo-card p-4 rounded text-center">
                            <i class="fas fa-crown fa-3x text-gold mb-3"></i>
                            <h4>Statut Abonnement</h4>
                            <p class="mt-2 text-glow-gold">
                                <strong>${isUserPremium ? 'MEMBRE PREMIUM (Accès Illimité)' : 'COMPTE GRATUIT'}</strong>
                            </p>
                            ${!isUserPremium ? `
                                <p class="text-muted text-sm mt-2">Débloquez tous nos films exclusifs et nos contenus en coulisses instantanément.</p>
                                <button onclick="Auth.showPremiumPayment()" class="btn btn-gold btn-sm mt-3 w-100 animate-pulse">Devenir Premium (${formatPrice(30000)})</button>
                            ` : `
                                <p class="text-muted text-sm mt-2">Merci pour votre soutien ! Profitez de tous les contenus exclusifs.</p>
                            `}
                        </div>
                    </div>

                    <!-- Right: Orders & Items -->
                    <div class="col-md-8">
                        <div class="profile-tabs mb-4">
                            <button id="tab-btn-orders" class="profile-tab-btn active" onclick="switchProfileTab('orders')">Mes Commandes</button>
                            <button id="tab-btn-videos" class="profile-tab-btn" onclick="switchProfileTab('videos')">Mes Vidéos Achetées</button>
                        </div>

                        <div id="profile-tab-content-orders" class="profile-tab-content">
                            <h4 class="mb-4">Historique des achats</h4>
                            ${ordersHTML}
                        </div>

                        <div id="profile-tab-content-videos" class="profile-tab-content hidden">
                            <h4 class="mb-4">Vidéos débloquées</h4>
                            ${purchasedVideosHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async confirmOrderPayment(paymentId) {
        try {
            await API.post(`/payments/${paymentId}/confirm`, {});
            Notify.show('Paiement confirmé ! En attente de validation par l\'administrateur.', 'success');
            this.updateProfilePage();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    }
};

// Global handlers helper for submission inside profile
async function handleProfileUpdateSubmit() {
    const fullname = document.getElementById('profile-fullname').value;
    const email = document.getElementById('profile-email').value;
    const password = document.getElementById('profile-password').value;
    
    await Auth.updateProfile(fullname, email, password);
}

function switchProfileTab(tab) {
    const btnOrders = document.getElementById('tab-btn-orders');
    const btnVideos = document.getElementById('tab-btn-videos');
    const contentOrders = document.getElementById('profile-tab-content-orders');
    const contentVideos = document.getElementById('profile-tab-content-videos');

    if (tab === 'orders') {
        btnOrders.classList.add('active');
        btnVideos.classList.remove('active');
        contentOrders.classList.remove('hidden');
        contentVideos.classList.add('hidden');
    } else {
        btnOrders.classList.remove('active');
        btnVideos.classList.add('active');
        contentOrders.classList.add('hidden');
        contentVideos.classList.remove('hidden');
    }
}
