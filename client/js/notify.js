const Notify = {
    shown: false,
    timer: null,
    confirmResolve: null,

    show(message, type = 'info') {
        this.hide();

        const overlay = document.createElement('div');
        overlay.className = 'notify-overlay';
        overlay.id = 'notify-overlay';

        const bubble = document.createElement('div');
        bubble.className = `notify-bubble notify-${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const iconClass = icons[type] || icons.info;

        bubble.innerHTML = `
            <div class="notify-icon"><i class="${iconClass}"></i></div>
            <div class="notify-body">
                <div class="notify-title">${type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : type === 'warning' ? 'Attention' : 'Information'}</div>
                <div class="notify-msg">${message}</div>
            </div>
            <button class="notify-close" onclick="Notify.hide()"><i class="fas fa-times"></i></button>
        `;

        overlay.appendChild(bubble);
        document.body.appendChild(overlay);
        this.shown = true;

        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            bubble.classList.add('visible');
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hide();
        });

        this.timer = setTimeout(() => this.hide(), 4000);
    },

    confirm(message) {
        return new Promise((resolve) => {
            this.hide();
            this.confirmResolve = resolve;

            const overlay = document.createElement('div');
            overlay.className = 'notify-overlay';
            overlay.id = 'notify-overlay';

            const bubble = document.createElement('div');
            bubble.className = 'notify-bubble notify-warning';

            bubble.innerHTML = `
                <div class="notify-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="notify-body">
                    <div class="notify-title">Confirmation</div>
                    <div class="notify-msg">${message}</div>
                </div>
                <div class="notify-actions">
                    <button class="btn btn-secondary btn-sm" id="notify-cancel-btn">Annuler</button>
                    <button class="btn btn-red btn-sm" id="notify-confirm-btn">Confirmer</button>
                </div>
            `;

            overlay.appendChild(bubble);
            document.body.appendChild(overlay);
            this.shown = true;

            requestAnimationFrame(() => {
                overlay.classList.add('visible');
                bubble.classList.add('visible');
            });

            const cleanup = (result) => {
                this.hide();
                if (this.confirmResolve) {
                    this.confirmResolve(result);
                    this.confirmResolve = null;
                }
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });

            bubble.querySelector('#notify-cancel-btn').addEventListener('click', () => cleanup(false));
            bubble.querySelector('#notify-confirm-btn').addEventListener('click', () => cleanup(true));
        });
    },

    hide() {
        const overlay = document.getElementById('notify-overlay');
        if (!overlay) return;
        overlay.id = ''; // Clear ID immediately to prevent duplicate ID conflicts during transition
        overlay.classList.remove('visible');
        const bubble = overlay.querySelector('.notify-bubble');
        if (bubble) bubble.classList.remove('visible');
        clearTimeout(this.timer);
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 300);
        this.shown = false;
    }
};
