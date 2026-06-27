/**
 * Video streaming module for Morondartva-Store.
 * Controls video hub page rendering, access validation, locked states, and custom player.
 */

const VideoHub = {
    videos: [],
    categories: [],
    selectedCategory: null,
    activeVideo: null,

    async init() {
        window.addEventListener('premiumUpgraded', () => {
            this.closePlayer();
            this.loadVideos();
        });
    },

    async loadVideos() {
        const videoSection = document.getElementById('section-videos');
        if (!videoSection || videoSection.classList.contains('hidden')) return;

        const gridContainer = document.getElementById('videos-grid');
        if (gridContainer) gridContainer.innerHTML = '<div class="col-span-full py-5 text-center"><div class="spinner"></div></div>';

        try {
            // Load categories and videos
            const [cats, vids] = await Promise.all([
                API.get('/categories'),
                API.get(`/videos?category_id=${this.selectedCategory || ''}`)
            ]);

            this.categories = cats.filter(c => c.type === 'video');
            this.videos = vids;

            this.renderCategoriesFilter();
            this.renderVideos();
        } catch (e) {
            console.error("Failed to load videos:", e);
            if (gridContainer) {
                gridContainer.innerHTML = `<div class="col-span-full text-center text-danger">Erreur: ${e.message}</div>`;
            }
        }
    },

    renderCategoriesFilter() {
        const filterContainer = document.getElementById('videos-categories-filter');
        if (!filterContainer) return;

        let html = `<button class="filter-btn ${!this.selectedCategory ? 'active' : ''}" onclick="VideoHub.setCategory(null)">Tout</button>`;
        
        this.categories.forEach(cat => {
            html += `
                <button class="filter-btn ${this.selectedCategory == cat.id ? 'active' : ''}" onclick="VideoHub.setCategory(${cat.id})">
                    ${cat.name}
                </button>
            `;
        });
        filterContainer.innerHTML = html;
    },

    renderVideos() {
        const gridContainer = document.getElementById('videos-grid');
        if (!gridContainer) return;

        if (this.videos.length === 0) {
            gridContainer.innerHTML = `
                <div class="col-span-full text-center py-5">
                    <i class="fas fa-video-slash fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Aucune vidéo disponible pour le moment.</p>
                </div>
            `;
            return;
        }

        const favIds = new Set();
        const profileDetail = JSON.parse(localStorage.getItem('user_profile_detail') || '{}');
        if (profileDetail.favorites) {
            profileDetail.favorites.forEach(f => {
                if (f.item_type === 'video') favIds.add(f.item_id);
            });
        }

        gridContainer.innerHTML = this.videos.map(vid => {
            const isFav = favIds.has(vid.id);
            const isLocked = vid.is_exclusive && !vid.is_accessible;
            
            let badgeHTML = '';
            if (vid.is_exclusive) {
                badgeHTML = `<span class="badge badge-exclusive"><i class="fas fa-crown mr-1"></i>Exclusif</span>`;
            } else {
                badgeHTML = `<span class="badge badge-free">Gratuit</span>`;
            }

            return `
                <div class="video-card card" onclick="VideoHub.openPlayer(${vid.id})">
                    <div class="video-thumb-container">
                        <img src="${vid.thumbnail_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${vid.title}" class="video-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                        ${badgeHTML}
                        ${isLocked ? '<div class="lock-overlay"><i class="fas fa-lock"></i></div>' : '<div class="play-overlay"><i class="fas fa-play"></i></div>'}
                        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="VideoHub.toggleFavorite(${vid.id}, event)">
                            <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <span class="video-cat text-muted text-sm">${vid.category_name || 'Vidéo'}</span>
                        <h4 class="video-title my-1">${vid.title}</h4>
                        <p class="video-desc text-muted text-sm text-truncate-2">${vid.description || ''}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    setCategory(catId) {
        this.selectedCategory = catId;
        this.loadVideos();
    },

    async toggleFavorite(videoId, event) {
        event.stopPropagation();
        if (!Auth.user) {
            Notify.show("Veuillez vous connecter pour ajouter des favoris.", 'warning');
            openAuthModal('login');
            return;
        }

        try {
            const btn = event.currentTarget;
            const icon = btn.querySelector('i');
            const res = await API.post('/favorites', { item_id: videoId, item_type: 'video' });
            
            if (res.status === 'added') {
                btn.classList.add('active');
                icon.className = 'fas fa-heart';
            } else {
                btn.classList.remove('active');
                icon.className = 'far fa-heart';
            }
            
            // Reload user profile in BG
            Auth.loadFullProfile().then(prof => {
                if (prof) localStorage.setItem('user_profile_detail', JSON.stringify(prof));
            });
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    async openPlayer(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;

        this.activeVideo = video;
        const playerModal = document.getElementById('player-modal');
        if (!playerModal) return;

        playerModal.classList.remove('hidden');

        // Check if access is locked
        if (video.is_exclusive && !video.is_accessible) {
            this.renderLockedScreen(video);
            return;
        }

        // We have access, load the player
        this.renderPlayerContent(video);
    },

    closePlayer() {
        const playerModal = document.getElementById('player-modal');
        if (playerModal) {
            playerModal.classList.add('hidden');
            // Clear video tag / iframe src to stop audio playing in background
            const playerBody = document.getElementById('player-modal-body');
            if (playerBody) playerBody.innerHTML = '';
        }
        this.activeVideo = null;
    },

    renderLockedScreen(video) {
        const container = document.getElementById('player-modal-body');
        if (!container) return;

        const isLoggedIn = !!Auth.user;

        let contentHTML = '';
        if (!isLoggedIn) {
            contentHTML = `
                <div class="locked-container text-center py-5">
                    <i class="fas fa-lock fa-4x text-red mb-3"></i>
                    <h2>Contenu Verrouillé</h2>
                    <p class="text-muted mt-2">Cette vidéo fait partie de nos contenus exclusifs. Veuillez vous connecter ou créer un compte pour y accéder.</p>
                    <div class="mt-4 gap-2 d-flex justify-content-center">
                        <button class="btn btn-red" onclick="VideoHub.closePlayer(); openAuthModal('login');">Se connecter</button>
                        <button class="btn btn-secondary" onclick="VideoHub.closePlayer(); openAuthModal('register');">Créer un compte</button>
                    </div>
                </div>
            `;
        } else {
            // Logged in but free user
            const priceText = video.price > 0 ? formatPrice(video.price) : 'Achat Individuel';
            contentHTML = `
                <div class="locked-container text-center py-5">
                    <i class="fas fa-crown fa-4x text-gold mb-3 animate-pulse"></i>
                    <h2>Accès Premium Requis</h2>
                    <p class="text-muted mt-2"><strong>"${video.title}"</strong> est réservé à nos membres Premium ou disponible en achat unique.</p>
                    
                    <div class="row justify-content-center mt-4 gap-3">
                        <div class="col-md-5">
                            <div class="access-choice-card p-4 rounded bg-dark-card border border-glow-gold">
                                <i class="fas fa-gem text-gold fa-2x mb-2"></i>
                                <h4>Abonnement Global</h4>
                                <p class="text-muted text-xs mt-1">Accès illimité à TOUTE la bibliothèque de vidéos exclusives + livraisons gratuites.</p>
                                <button onclick="VideoHub.buyPremium()" class="btn btn-gold btn-sm mt-3 w-100">Devenir Premium (${formatPrice(30000)}/an)</button>
                            </div>
                        </div>
                        
                        ${video.price > 0 ? `
                        <div class="col-md-5">
                            <div class="access-choice-card p-4 rounded bg-dark-card border">
                                <i class="fas fa-ticket-alt text-red fa-2x mb-2"></i>
                                <h4>Achat Unique</h4>
                                <p class="text-muted text-xs mt-1">Débloquez uniquement ce court-métrage ou film à vie sur votre compte.</p>
                                <button onclick="VideoHub.openVideoPaymentFlow(${video.id})" class="btn btn-red btn-sm mt-3 w-100">Débloquer pour ${priceText}</button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="modal-header d-flex justify-content-between align-items-center mb-3">
                <h4>${video.title}</h4>
                <button class="btn-close text-white" onclick="VideoHub.closePlayer()"><i class="fas fa-times"></i></button>
            </div>
            ${contentHTML}
        `;
    },

    renderPlayerContent(video) {
        const container = document.getElementById('player-modal-body');
        if (!container) return;

        let playerHTML = '';
        const url = video.video_url;

        // Check if the URL is an embed (YouTube or Vimeo)
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            let videoId = '';
            if (url.includes('v=')) {
                videoId = url.split('v=')[1].split('&')[0];
            } else {
                videoId = url.split('/').pop();
            }
            playerHTML = `
                <div class="ratio ratio-16x9">
                    <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" title="${video.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            `;
        } else if (url.includes('vimeo.com')) {
            const videoId = url.split('/').pop();
            playerHTML = `
                <div class="ratio ratio-16x9">
                    <iframe src="https://player.vimeo.com/video/${videoId}?autoplay=1" title="${video.title}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
                </div>
            `;
        } else {
            // Standard direct link MP4 video player
            playerHTML = `
                <div class="custom-video-wrapper">
                    <video id="html5-video-player" controls autoplay class="w-100 rounded" src="${url}">
                        Votre navigateur ne supporte pas la lecture de vidéos HTML5.
                    </video>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="modal-header d-flex justify-content-between align-items-center mb-2">
                <h4 class="text-glow">${video.title}</h4>
                <button class="btn-close text-white" onclick="VideoHub.closePlayer()"><i class="fas fa-times"></i></button>
            </div>
            <div class="player-content">
                ${playerHTML}
            </div>
            <div class="mt-3">
                <p class="text-muted text-sm">${video.description || 'Aucune description disponible.'}</p>
                <div class="d-flex align-items-center mt-3 gap-2">
                    <span class="badge bg-dark border text-muted">${video.category_name || 'Audiovisuel'}</span>
                    <span class="text-xs text-muted">Publiée le ${new Date(video.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
            </div>
        `;
    },

    async buyPremium() {
        Auth.showPremiumPayment();
    },

    openVideoPaymentFlow(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        if (!video) return;

        const container = document.getElementById('player-modal-body');
        if (!container) return;

        container.innerHTML = `
            <div class="modal-header d-flex justify-content-between align-items-center mb-3">
                <h4>Achat Unique : "${video.title}"</h4>
                <button class="btn-close text-white" onclick="VideoHub.closePlayer()"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="p-3 border rounded bg-dark-card mb-4">
                <div class="d-flex justify-content-between font-bold">
                    <span>Produit :</span>
                    <span>Accès Vidéo</span>
                </div>
                <div class="d-flex justify-content-between text-red font-bold mt-2">
                    <span>Prix :</span>
                    <span>${formatPrice(video.price)}</span>
                </div>
            </div>

            <form id="video-purchase-form" onsubmit="event.preventDefault(); VideoHub.submitVideoPurchase(${video.id});">
                <div class="form-group mb-3">
                    <label class="form-label"><i class="fas fa-credit-card fa-fw text-muted mr-1"></i> Méthode de Paiement</label>
                    <select id="vid-pay-method" class="form-control" onchange="VideoHub.toggleVidPayPhoneInput()">
                        <option value="mvola">MVola (Telma)</option>
                        <option value="orange_money">Orange Money</option>
                        <option value="airtel_money">Airtel Money</option>
                        <option value="paypal">PayPal</option>
                        <option value="card">Carte Bancaire (Visa/Mastercard)</option>
                    </select>
                </div>
                
                <div id="vid-pay-phone-container" class="form-group mb-4">
                    <label class="form-label"><i class="fas fa-phone-alt fa-fw text-muted mr-1"></i> Numéro Mobile Money (+261...)</label>
                    <input type="text" id="vid-pay-phone" class="form-control" placeholder="+261 32 61 800 18" value="${Auth.user.phone || ''}">
                </div>
                
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-secondary w-50" onclick="VideoHub.openPlayer(${video.id})"><i class="fas fa-arrow-left mr-1"></i> Retour</button>
                    <button type="submit" class="btn btn-red w-50" id="vid-pay-submit-btn"><i class="fas fa-check mr-1"></i> Confirmer et Payer</button>
                </div>
            </form>
        `;
    },

    toggleVidPayPhoneInput() {
        const method = document.getElementById('vid-pay-method').value;
        const phoneContainer = document.getElementById('vid-pay-phone-container');
        if (['mvola', 'orange_money', 'airtel_money'].includes(method)) {
            phoneContainer.classList.remove('hidden');
        } else {
            phoneContainer.classList.add('hidden');
        }
    },

    async submitVideoPurchase(videoId) {
        const method = document.getElementById('vid-pay-method').value;
        const phone = document.getElementById('vid-pay-phone') ? document.getElementById('vid-pay-phone').value.trim() : '';

        if (['mvola', 'orange_money', 'airtel_money'].includes(method) && !phone) {
            Notify.show("Veuillez renseigner votre numéro de téléphone.", 'warning');
            return;
        }

        const submitBtn = document.getElementById('vid-pay-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Chargement...';

        try {
            const res = await API.post(`/videos/${videoId}/purchase`, {
                payment_method: method,
                phone_number: phone
            });

            if (res.ussd_code) {
                const container = document.getElementById('player-modal-body');
                if (container) {
                    container.innerHTML = `
                        <div class="modal-header d-flex justify-content-between align-items-center mb-3">
                            <h4>Paiement en attente</h4>
                            <button class="btn-close text-white" onclick="VideoHub.closePlayer()"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="text-center py-4 px-3">
                            <i class="fas fa-mobile-alt fa-4x text-info mb-3"></i>
                            <p>${res.message || 'Connectez-vous sur votre téléphone pour effectuer le paiement.'}</p>
                            <div class="mt-4 p-4 rounded border border-info d-inline-block" style="background: rgba(0,123,255,0.1); max-width: 400px; width: 100%;">
                                <p class="text-xs text-muted mb-2">Code USSD à composer :</p>
                                <code class="ussd-code-display" style="font-size: 1.4rem; word-break: break-all; color: #0dcaf0; user-select: all;">${res.ussd_code}</code>
                            </div>
                            ${res.instruction ? `<div class="mt-3 text-left d-inline-block text-sm" style="max-width: 400px;"><p class="text-muted">Instructions :</p><p style="white-space: pre-line;">${res.instruction}</p></div>` : ''}
                            <div class="mt-4 d-flex justify-content-center gap-2 flex-wrap">
                                <a href="tel:${res.ussd_code.replace(/#/g, '%23')}" class="btn btn-info btn-sm">
                                    <i class="fas fa-phone-alt mr-1"></i> Composer le code USSD
                                </a>
                                <button class="btn btn-outline-info btn-sm" onclick="navigator.clipboard.writeText('${res.ussd_code}'); Notify.show('Code USSD copié !', 'success')">
                                    <i class="fas fa-copy mr-1"></i> Copier
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="VideoHub.closePlayer()">Fermer</button>
                            </div>
                        </div>
                    `;
                }
            } else {
                Notify.show(res.message, 'success');
                this.closePlayer();
                await this.loadVideos();
                this.openPlayer(videoId);
            }
        } catch (e) {
            Notify.show(`Erreur lors de l'achat: ${e.message}`, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Confirmer et Payer';
        }
    }
};

// Global direct video player access
function playVideoDirect(vidId) {
    VideoHub.openPlayer(vidId);
}
