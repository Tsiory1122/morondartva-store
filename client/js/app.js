/**
 * Main application initializer and router for Morondartva-Store.
 * Controls hash routing, global UI state, and contact forms.
 */

function formatPrice(price) {
    return 'Ar ' + Number(price).toLocaleString('fr-FR');
}

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

const App = {
    init() {
        console.log("Initializing Morondartva-Store...");
        
        // Initialize submodules
        Auth.init();
        Shop.init();
        VideoHub.init();
        Admin.init();

        // Register router listeners
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Initial routing load
        this.handleRoute();

        // Setup global event listeners
        this.setupEventListeners();
    },

    handleRoute() {
        const hash = window.location.hash || '#home';
        console.log(`Routing to: ${hash}`);

        // Redirect scanner role to scanner page
        if (Auth.user && Auth.user.role === 'scanner' && hash !== '#scanner') {
            window.location.hash = '#scanner';
            return;
        }

        // Close any open drawers or modals to ensure clean state
        Shop.closeCartDrawer();
        Shop.closeCheckoutWizard();
        VideoHub.closePlayer();
        closeAuthModal();

        // Map hashes to section IDs
        const routes = {
            '#home': 'section-home',
            '#shop': 'section-shop',
            '#videos': 'section-videos',
            '#events': 'section-events',
            '#profile': 'section-profile',
            '#admin': 'section-admin',
            '#contact': 'section-contact',
            '#scanner': 'section-scanner'
        };

        const targetSectionId = routes[hash] || 'section-home';

        // Hide all sections, show target section
        const sections = document.querySelectorAll('main > section');
        sections.forEach(sec => {
            if (sec.id === targetSectionId) {
                sec.classList.remove('hidden');
                sec.classList.add('section-entrance');
            } else {
                sec.classList.add('hidden');
                sec.classList.remove('section-entrance');
            }
        });

        // Highlight active link in header & mobile nav
        const allNavLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
        allNavLinks.forEach(link => {
            if (link.getAttribute('href') === hash) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Trigger section-specific loads
        if (hash === '#shop') {
            Shop.loadCatalog();
        } else if (hash === '#videos') {
            VideoHub.loadVideos();
        } else if (hash === '#events') {
            Events.loadEvents();
        } else if (hash === '#profile') {
            Auth.updateProfilePage();
        } else if (hash === '#admin') {
            Admin.init();
        } else if (hash === '#home') {
            this.loadHomeFeatured();
        } else if (hash === '#scanner') {
            // Scanner section - no data loading needed
        }
        
        // Stop camera if leaving scanner section
        if (hash !== '#scanner' && typeof Scanner !== 'undefined') {
            Scanner.stop();
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    setupEventListeners() {
        // Close mobile nav on resize to desktop
        window.addEventListener('resize', () => {
            const mobileNav = document.getElementById('mobile-nav');
            if (mobileNav && window.innerWidth > 768 && !mobileNav.classList.contains('hidden')) {
                App.toggleMobileNav();
            }
        });

        // Global escape key handler to close modals & mobile nav
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAuthModal();
                Shop.closeCartDrawer();
                Shop.closeCheckoutWizard();
                VideoHub.closePlayer();
                const mobileNav = document.getElementById('mobile-nav');
                if (mobileNav && !mobileNav.classList.contains('hidden')) {
                    App.toggleMobileNav();
                }
            }
        });

        // Search inputs listeners
        const searchInput = document.getElementById('shop-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                Shop.setSearch(e.target.value);
            });
        }

        // Contact Form Submission
        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
            contactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleContactSubmit();
            });
        }
    },

    async loadHomeFeatured() {
        const container = document.getElementById('home-featured-products');
        const vidsContainer = document.getElementById('home-featured-videos');
        
        if (container) container.innerHTML = '<div class="col-span-full text-center"><div class="spinner"></div></div>';
        if (vidsContainer) vidsContainer.innerHTML = '<div class="col-span-full text-center"><div class="spinner"></div></div>';

        try {
            // Fetch products and videos in background
            const [prods, vids] = await Promise.all([
                API.get('/products'),
                API.get('/videos')
            ]);

            // Render top 4 items for products
            if (container) {
                const prodList = prods.data || prods;
                const sliceProds = prodList.slice(0, 4);
                if (sliceProds.length === 0) {
                    container.innerHTML = '<p class="text-muted text-center col-span-full">Aucun produit disponible</p>';
                } else {
                    container.innerHTML = sliceProds.map(p => `
                        <div class="product-card card" onclick="window.location.hash='#shop'">
                            <div class="product-img-container">
                                <img src="${p.image_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${p.name}" class="product-img" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'><rect width=\'200\' height=\'200\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                            </div>
                            <div class="card-body">
                                <h4 class="product-name my-1">${p.name}</h4>
                                <span class="product-price text-red">${formatPrice(p.price)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }

            // Render top 3 videos
            if (vidsContainer) {
                const vidList = vids.data || vids;
                const sliceVids = vidList.slice(0, 3);
                if (sliceVids.length === 0) {
                    vidsContainer.innerHTML = '<p class="text-muted text-center col-span-full">Aucune vidéo disponible</p>';
                } else {
                    vidsContainer.innerHTML = sliceVids.map(v => `
                        <div class="video-card card" onclick="window.location.hash='#videos'; playVideoDirect(${v.id});">
                            <div class="video-thumb-container">
                                <img src="${v.thumbnail_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>'}" alt="${v.title}" class="video-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'320\' height=\'180\' viewBox=\'0 0 320 180\'><rect width=\'320\' height=\'180\' fill=\'%231a1a22\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-family=\'sans-serif\' font-size=\'14\'>Morondartva</text></svg>';'">
                                <div class="play-overlay"><i class="fas fa-play"></i></div>
                            </div>
                            <div class="card-body">
                                <h4 class="video-title my-1">${v.title}</h4>
                                <p class="text-muted text-sm text-truncate-2">${v.description || ''}</p>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            console.error("Failed to load featured items:", e);
        }
    },

    toggleMobileNav() {
        const nav = document.getElementById('mobile-nav');
        if (!nav) return;
        nav.classList.toggle('hidden');
        document.body.style.overflow = nav.classList.contains('hidden') ? '' : 'hidden';
    },

    handleContactSubmit() {
        const name = document.getElementById('contact-name').value.trim();
        const email = document.getElementById('contact-email').value.trim();
        const subject = document.getElementById('contact-subject').value.trim();
        const message = document.getElementById('contact-message').value.trim();

        if (!name || !email || !message) {
            Notify.show("Veuillez remplir tous les champs obligatoires.", 'warning');
            return;
        }

        const waText = encodeURIComponent(`Bonjour, je suis ${name} (${email}).\nSujet: ${subject || 'Général'}\n\n${message}`);
        window.open(`https://wa.me/261326180018?text=${waText}`, '_blank');
        Notify.show('Message envoyé via WhatsApp !', 'success');
        document.getElementById('contact-form').reset();
    }
};

// Global AUTH Modal Controls

function openAuthModal(defaultTab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('hidden');
    showAuthTab(defaultTab);
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
}

function showAuthTab(tab) {
    const loginBtn = document.getElementById('auth-tab-login');
    const registerBtn = document.getElementById('auth-tab-register');
    const loginForm = document.getElementById('auth-form-login');
    const registerForm = document.getElementById('auth-form-register');

    if (tab === 'login') {
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        loginBtn.classList.remove('active');
        registerBtn.classList.add('active');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}

// Password visibility toggle
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Form Submission Callbacks (called inline from index.html)

async function handleLoginSubmit() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        await Auth.login(email, pass);
        closeAuthModal();
        Notify.show("Ravi de vous revoir !", 'success');
    } catch (e) {
        // Handled inside Auth.login
    }
}

async function handleRegisterSubmit() {
    const fullname = document.getElementById('register-fullname').value;
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm-password').value;
    
    if (pass !== confirm) {
        Notify.show("Les mots de passe ne correspondent pas.", 'warning');
        return;
    }
    if (pass.length < 6) {
        Notify.show("Le mot de passe doit contenir au moins 6 caractères.", 'warning');
        return;
    }
    
    try {
        await Auth.register(fullname, email, pass);
    } catch (e) {
        // Handled inside Auth.register
    }
}

// Generic modal functions
function openModal(html, title) {
    const existing = document.getElementById('generic-modal-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'generic-modal-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <div class="modal-header mb-3">
                <h3 id="modal-title" class="text-glow">${title || ''}</h3>
                <button class="btn-close text-white" onclick="closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div id="modal-body">${html}</div>
        </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.remove('hidden'), 10);
}

function closeModal() {
    const overlay = document.getElementById('generic-modal-overlay');
    if (overlay) overlay.remove();
}

// Format price input with thousand separators
function formatPriceInput(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    if (val) {
        val = parseInt(val, 10).toLocaleString('fr-FR');
    }
    input.value = val;
}
