const Scanner = {
    scannerStream: null,
    scanRaf: null,

    init() {
        document.getElementById('scanner-token-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.verify();
        });
        this.renderHistory();
    },

    start() {
        const video = document.getElementById('scanner-camera');
        if (!video) return;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    this.scannerStream = stream;
                    video.srcObject = stream;
                    video.play();
                    Notify.show('Caméra activée. Pointez vers le QR code.', 'info');
                    document.getElementById('scanner-start-btn').classList.add('hidden');
                    document.getElementById('scanner-stop-btn').classList.remove('hidden');
                    this.scanFrame();
                })
                .catch(err => {
                    Notify.show('Erreur d\'accès à la caméra: ' + err.message, 'error');
                });
        } else {
            Notify.show('Votre navigateur ne supporte pas l\'accès à la caméra.', 'warning');
        }
    },

    stop() {
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
        document.getElementById('scanner-start-btn').classList.remove('hidden');
        document.getElementById('scanner-stop-btn').classList.add('hidden');
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
            let token = '';
            try {
                const parsed = JSON.parse(code.data);
                if (parsed.qr_token) token = parsed.qr_token;
            } catch (e) {
                if (code.data.length > 5) token = code.data;
            }
            if (token) {
                document.getElementById('scanner-token-input').value = token;
                this.stop();
                this.verify();
                return;
            }
        }
        this.scanRaf = requestAnimationFrame(() => this.scanFrame());
    },

    async verify() {
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
            const entry = {
                token,
                timestamp: new Date().toISOString(),
                valid: res.valid,
                message: res.valid ? 'Ticket Valide' : res.message,
                details: res.ticket ? `${res.ticket.event_title} — ${res.ticket.quantity} ticket(s) — ${res.ticket.username}` : ''
            };
            this.addHistory(entry);
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
            this.addHistory({ token, timestamp: new Date().toISOString(), valid: false, message: e.message, details: '' });
        }
    },

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem('scanner_history') || '[]');
        } catch { return []; }
    },

    addHistory(entry) {
        const history = this.getHistory();
        history.unshift(entry);
        if (history.length > 50) history.length = 50;
        localStorage.setItem('scanner_history', JSON.stringify(history));
        this.renderHistory();
    },

    clearHistory() {
        if (confirm('Effacer tout l\'historique des scans ?')) {
            localStorage.removeItem('scanner_history');
            this.renderHistory();
            Notify.show('Historique effacé.', 'info');
        }
    },

    renderHistory() {
        const list = document.getElementById('scanner-history-list');
        const history = this.getHistory();
        if (history.length === 0) {
            list.innerHTML = '<p class="text-muted text-sm">Aucun scan pour le moment.</p>';
            return;
        }
        list.innerHTML = history.map((e, i) => `
            <div class="scanner-history-item ${e.valid ? 'border-success' : 'border-danger'}">
                <div class="d-flex align-items-center gap-2">
                    <i class="fas fa-${e.valid ? 'check-circle text-success' : 'times-circle text-danger'}"></i>
                    <span class="font-bold text-sm">${e.valid ? 'Valide' : 'Invalide'}</span>
                    <span class="text-xs text-muted ml-auto">${new Date(e.timestamp).toLocaleString()}</span>
                </div>
                <p class="text-xs mt-1">${e.message}${e.details ? ' — ' + e.details : ''}</p>
                <button class="btn btn-xs btn-secondary mt-1" onclick="Scanner.reuseToken('${e.token}')">Réutiliser le token</button>
            </div>
        `).join('');
    },

    reuseToken(token) {
        document.getElementById('scanner-token-input').value = token;
        document.getElementById('scanner-result').classList.add('hidden');
        window.location.hash = '#scanner';
    }
};

document.addEventListener('DOMContentLoaded', () => Scanner.init());
