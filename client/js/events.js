const Events = {
    events: [],
    myTickets: [],
    currentPage: 1,
    totalPages: 1,

    async loadEvents(page) {
        const container = document.getElementById('events-container');
        if (!container) return;
        container.innerHTML = '<div class="text-center py-5"><div class="spinner"></div></div>';

        try {
            const pg = page || this.currentPage;
            const [eventsResp, tickets] = await Promise.all([
                API.get(`/events?page=${pg}&limit=10`),
                Auth.user ? API.get('/tickets').catch(() => []) : Promise.resolve([])
            ]);
            this.events = eventsResp.data || eventsResp;
            this.currentPage = eventsResp.page || 1;
            this.totalPages = eventsResp.total_pages || 1;
            this.myTickets = tickets;
            this.render();
        } catch (e) {
            container.innerHTML = `<div class="text-center py-5 text-danger">Erreur: ${e.message}</div>`;
        }
    },

    render() {
        const container = document.getElementById('events-container');
        let myTicketsHtml = '';
        if (this.myTickets.length > 0) {
            const active = this.myTickets.filter(t => t.status !== 'cancelled');
            if (active.length > 0) {
                myTicketsHtml = `
                    <div class="mb-5">
                        <h3 class="mb-3"><i class="fas fa-ticket-alt text-gold mr-2"></i>Mes Réservations</h3>
                        <div class="grid grid-3 gap-3">
                            ${active.map(t => {
                                const isVip = t.ticket_type === 'vip';
                                return `
                                <div class="card bg-dark-card p-3 rounded border ${isVip ? 'border-gold' : ''}">
                                    <div class="d-flex justify-content-between align-items-start">
                                        <div>
                                            <h5>${t.event_title || 'Événement'}</h5>
                                            <p class="text-sm text-muted mb-1">
                                                ${t.quantity} ticket(s) — ${formatPrice(t.total_price)}
                                                ${isVip ? '<span class="badge badge-gold">VIP</span>' : ''}
                                            </p>
                                            <span class="badge ${t.status === 'confirmed' ? 'badge-success' : 'badge-warning'}">${t.status === 'confirmed' ? 'Confirmé' : t.status === 'pending_validation' ? 'En attente de validation admin' : t.status === 'pending_payment' ? 'Paiement en attente' : t.status}</span>
                                            ${t.payment_status === 'pending' && t.payment_id ? `<div class="mt-1"><span class="badge badge-warning">Paiement en attente</span></div>` : ''}
                                        </div>
                                        <div class="d-flex flex-column align-items-center gap-1">
                                            <i class="fas fa-qrcode fa-2x text-muted" style="cursor:pointer;" onclick="Events.showTicketQR(${t.id})" title="Voir QR code"></i>
                                            <button class="btn btn-outline-info btn-xs" onclick="Events.downloadTicketPDF(${t.id})" title="Télécharger PDF"><i class="fas fa-download"></i></button>
                                        </div>
                                    </div>
                                    ${t.payment_status === 'pending' && t.payment_id ? `<button class="btn btn-info btn-xs mt-1 w-100" onclick="Events.confirmPayment(${t.payment_id}, ${t.id})"><i class="fas fa-check mr-1"></i>J'ai payé</button>` : ''}
                                    <button class="btn btn-outline-danger btn-xs mt-2 w-100" onclick="Events.cancelTicket(${t.id})"><i class="fas fa-times mr-1"></i>Annuler</button>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        }

        if (this.events.length === 0) {
            container.innerHTML = `
                ${myTicketsHtml}
                <div class="text-center py-5">
                    <i class="fas fa-calendar-times fa-3x text-muted mb-3"></i>
                    <p>Aucun événement à venir. Revenez bientôt !</p>
                </div>
            `;
            return;
        }

        let eventsHtml = `
            <h3 class="mb-4"><i class="fas fa-calendar-day text-red mr-2"></i>Événements à Venir</h3>
            <div class="grid grid-2 gap-3">
                ${this.events.map(ev => {
                    const hasVip = ev.vip_price && ev.vip_price > 0 && ev.vip_tickets > 0;
                    return `
                    <div class="card bg-dark-card rounded border overflow-hidden">
                        ${ev.image_url ? `<img src="${ev.image_url}" alt="${ev.title}" style="width:100%;height:180px;object-fit:cover;" onerror="this.style.display='none'">` : ''}
                        <div class="p-4">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h4 class="text-glow" style="font-size:1.15rem;">${ev.title}</h4>
                                <span class="badge ${ev.available_tickets > 0 ? 'badge-success' : 'badge-danger'}">${ev.available_tickets > 0 ? ev.available_tickets + ' places' : 'Complet'}</span>
                            </div>
                            <p class="text-sm text-muted mb-2">${ev.description || ''}</p>
                            <div class="text-sm mb-2">
                                <div><i class="fas fa-calendar text-red mr-1"></i> ${new Date(ev.event_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                <div><i class="fas fa-map-marker-alt text-red mr-1"></i> ${ev.location || 'À définir'}</div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div>
                                    <span class="text-red font-bold text-lg">${formatPrice(ev.price)}</span>
                                    ${hasVip ? `<span class="text-gold font-bold text-sm ml-2">VIP dès ${formatPrice(ev.vip_price)}</span>` : ''}
                                </div>
                                <button class="btn btn-red btn-sm" ${ev.available_tickets <= 0 ? 'disabled' : ''} onclick="Events.openTicketModal(${ev.id})">
                                    <i class="fas fa-ticket-alt mr-1"></i> Réserver
                                </button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
        if (this.totalPages > 1) {
            eventsHtml += `<div class="d-flex justify-content-center gap-2 mt-4">`;
            for (let i = 1; i <= this.totalPages; i++) {
                eventsHtml += `<button class="btn ${i === this.currentPage ? 'btn-red' : 'btn-secondary'} btn-sm" onclick="Events.loadEvents(${i})">${i}</button>`;
            }
            eventsHtml += `</div>`;
        }

        container.innerHTML = myTicketsHtml + eventsHtml;
    },

    async confirmPayment(paymentId, ticketId) {
        try {
            await API.post(`/payments/${paymentId}/confirm`, {});
            Notify.show('Paiement confirmé ! En attente de validation par l\'administrateur.', 'success');
            this.loadEvents();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    async cancelTicket(ticketId) {
        const ok = await Notify.confirm("Annuler cette réservation ? Les places seront remises en vente.");
        if (!ok) return;
        try {
            await API.post(`/tickets/${ticketId}/cancel`);
            Notify.show('Réservation annulée.', 'success');
            this.loadEvents();
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    async openTicketModal(eventId) {
        if (!Auth.user) {
            Notify.show("Veuillez vous connecter pour réserver.", 'warning');
            openAuthModal('login');
            return;
        }
        const ev = this.events.find(e => e.id === eventId);
        if (!ev) return;
        const hasVip = ev.vip_price && ev.vip_price > 0 && ev.vip_tickets > 0 && ev.vip_available > 0;
        const vipSection = hasVip ? `
            <div class="mt-3 pt-3 border-top border-secondary">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span><i class="fas fa-crown text-gold mr-1"></i> Places VIP</span>
                    <span class="text-gold font-bold">${formatPrice(ev.vip_price)} / ticket</span>
                </div>
                <p class="text-xs text-muted mb-2">${ev.vip_available} places VIP disponibles — Accès coupe-file & zone dédiée</p>
                <div class="form-group mb-2">
                    <label class="form-label">Nb tickets VIP</label>
                    <input type="number" id="ticket-vip-qty" class="form-control" value="0" min="0" max="${Math.min(ev.vip_available, 10)}">
                </div>
            </div>
        ` : '';
        const modal = document.getElementById('ticket-modal');
        const content = document.getElementById('ticket-modal-content');
        content.innerHTML = `
            <h3 class="mb-3 text-glow">${ev.title}</h3>
            <p class="text-sm text-muted mb-3">${ev.description || ''}</p>
            <div class="text-sm mb-3">
                <div><i class="fas fa-calendar text-red mr-1"></i> ${new Date(ev.event_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div><i class="fas fa-map-marker-alt text-red mr-1"></i> ${ev.location || 'À définir'}</div>
                <div><i class="fas fa-tag text-red mr-1"></i> ${formatPrice(ev.price)} / ticket normal</div>
                <div><i class="fas fa-chair text-red mr-1"></i> ${ev.available_tickets} places disponibles</div>
            </div>
            <div class="form-group mb-2">
                <label class="form-label">Nombre de tickets normaux</label>
                <input type="number" id="ticket-qty" class="form-control" value="1" min="1" max="${Math.min(ev.available_tickets, 10)}">
            </div>
            ${vipSection}
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-secondary w-50" onclick="Events.closeTicketModal()">Fermer</button>
                <button class="btn btn-red w-50" onclick="Events.reserve(${eventId})">
                    <i class="fas fa-check mr-1"></i> Réserver
                </button>
            </div>
        `;
        modal.classList.remove('hidden');
        const updateTotal = () => {
            const qty = parseInt(document.getElementById('ticket-qty').value) || 0;
            const vipQty = parseInt(document.getElementById('ticket-vip-qty')?.value) || 0;
            const total = (qty * ev.price) + (vipQty * (ev.vip_price || 0));
            const btn = content.querySelector('.btn-red');
            if (btn) {
                if (total > 0) {
                    btn.innerHTML = `<i class="fas fa-check mr-1"></i> Réserver (${formatPrice(total)})`;
                } else {
                    btn.innerHTML = `<i class="fas fa-check mr-1"></i> Réserver`;
                }
            }
        };
        document.getElementById('ticket-qty').addEventListener('input', updateTotal);
        if (hasVip) {
            document.getElementById('ticket-vip-qty').addEventListener('input', updateTotal);
        }
        updateTotal();
    },

    closeTicketModal() {
        document.getElementById('ticket-modal').classList.add('hidden');
    },

    async reserve(eventId) {
        const qty = parseInt(document.getElementById('ticket-qty').value) || 0;
        const vipQty = parseInt(document.getElementById('ticket-vip-qty')?.value) || 0;
        const ev = this.events.find(e => e.id === eventId);
        if (!ev) return;
        if (qty + vipQty <= 0) {
            Notify.show('Sélectionnez au moins 1 ticket.', 'warning');
            return;
        }
        if (qty > ev.available_tickets) {
            Notify.show(`Seulement ${ev.available_tickets} places normales disponibles.`, 'warning');
            return;
        }
        if (vipQty > (ev.vip_available || 0)) {
            Notify.show(`Seulement ${ev.vip_available} places VIP disponibles.`, 'warning');
            return;
        }
        const totalPrice = (qty * ev.price) + (vipQty * (ev.vip_price || 0));
        this.closeTicketModal();
        this.showTicketPaymentModal(eventId, qty, vipQty, totalPrice, ev);
    },

    showTicketPaymentModal(eventId, qty, vipQty, totalPrice, ev) {
        const paymentHTML = `
            <div style="max-width:400px;margin:0 auto;">
                <div class="text-center mb-4">
                    <i class="fas fa-ticket-alt fa-3x text-red mb-2"></i>
                    <h4>Paiement des Tickets</h4>
                    <p class="text-muted text-sm">${qty > 0 ? `${qty} normal(aux) × ${formatPrice(ev.price)}` : ''}${qty > 0 && vipQty > 0 ? '<br>' : ''}${vipQty > 0 ? `${vipQty} VIP × ${formatPrice(ev.vip_price)}` : ''}</p>
                    <p class="font-bold text-lg text-glow">Total : ${formatPrice(totalPrice)}</p>
                </div>
                <div id="ticket-payment-step-1">
                    <div class="form-group mb-3">
                        <label class="form-label">Mode de paiement</label>
                        <select id="ticket-payment-method" class="form-control">
                            <option value="mvola">MVola</option>
                            <option value="orange_money">Orange Money</option>
                            <option value="airtel_money">Airtel Money</option>
                        </select>
                    </div>
                    <div class="form-group mb-4">
                        <label class="form-label">Numéro de téléphone</label>
                        <input type="tel" id="ticket-phone" class="form-control" placeholder="034 00 000 00" inputmode="numeric">
                    </div>
                    <button class="btn btn-red w-100" onclick="Events.submitTicketPayment(${eventId}, ${qty}, ${vipQty})">
                        <i class="fas fa-mobile-alt mr-1"></i> Payer ${formatPrice(totalPrice)}
                    </button>
                    <div class="text-center mt-2">
                        <button class="btn btn-sm btn-link text-muted" onclick="Events.closeTicketPaymentModal()">Annuler</button>
                    </div>
                </div>
                <div id="ticket-payment-step-2" class="hidden">
                    <div class="text-center">
                        <i class="fas fa-mobile-alt fa-4x text-info mb-3"></i>
                        <p class="mb-1">Composez le code USSD ci-dessous sur votre téléphone :</p>
                        <p id="ticket-ussd-code" class="ussd-code-display" style="font-size:1.6rem;font-weight:bold;color:#0dcaf0;user-select:all;word-break:break-all;"></p>
                        <p class="text-xs text-muted" id="ticket-ussd-instruction"></p>
                        <div class="mt-3">
                            <a href="#" id="ticket-ussd-dial-link" class="btn btn-info btn-sm"><i class="fas fa-phone-alt mr-1"></i> Composer</a>
                            <button id="ticket-ussd-copy-btn" class="btn btn-outline-info btn-sm"><i class="fas fa-copy mr-1"></i> Copier</button>
                        </div>
                        <p class="text-xs text-muted mt-3">Après paiement, revenez voir vos tickets dans la section Événements. La réservation sera finalisée après validation par l'administrateur.</p>
                        <button class="btn btn-red btn-sm mt-2" onclick="Events.loadEvents(); Events.closeTicketPaymentModal();">Voir mes tickets</button>
                    </div>
                </div>
            </div>
        `;
        openModal(paymentHTML, '');
        document.getElementById('modal-title').textContent = 'Paiement des tickets';
    },

    async submitTicketPayment(eventId, qty, vipQty) {
        const method = document.getElementById('ticket-payment-method').value;
        const phone = document.getElementById('ticket-phone').value.trim();
        if (!phone) {
            Notify.show('Veuillez entrer votre numéro de téléphone.', 'warning');
            return;
        }
        const promises = [];
        if (qty > 0) {
            promises.push(API.post('/tickets/reserve', { event_id: eventId, quantity: qty, ticket_type: 'normal', payment_method: method, phone_number: phone }));
        }
        if (vipQty > 0) {
            promises.push(API.post('/tickets/reserve', { event_id: eventId, quantity: vipQty, ticket_type: 'vip', payment_method: method, phone_number: phone }));
        }
        try {
            const results = await Promise.all(promises);
            const lastRes = results[results.length - 1];
            if (lastRes.ussd_code) {
                document.getElementById('ticket-payment-step-1').classList.add('hidden');
                document.getElementById('ticket-payment-step-2').classList.remove('hidden');
                document.getElementById('ticket-ussd-code').textContent = lastRes.ussd_code;
                document.getElementById('ticket-ussd-instruction').textContent = lastRes.instruction || `Composez ${lastRes.ussd_code} sur votre téléphone.`;
                document.getElementById('ticket-ussd-dial-link').href = `tel:${lastRes.ussd_code.replace(/#/g, '%23')}`;
                document.getElementById('ticket-ussd-copy-btn').onclick = function() {
                    navigator.clipboard.writeText(lastRes.ussd_code);
                    Notify.show('Code USSD copié !', 'success');
                };
            } else {
                closeModal();
                Notify.show('Réservation en attente de validation par l\'administrateur.', 'success');
                this.loadEvents();
                setTimeout(() => {
                    this.showTicketConfirm(lastRes);
                }, 500);
            }
        } catch (e) {
            Notify.show(e.message, 'error');
        }
    },

    closeTicketPaymentModal() {
        closeModal();
        this.loadEvents();
    },

    showTicketConfirm(res) {
        const modal = document.getElementById('ticket-confirm-modal');
        const content = document.getElementById('ticket-confirm-content');
        const ticketId = res.ticket_id || res.id;
        const token = res.qr_token || '';
        const isVip = res.ticket_type === 'vip';
        content.innerHTML = `
            <i class="fas fa-clock fa-4x text-warning mb-3"></i>
            <h3 class="text-glow mb-2">Réservation en attente de validation</h3>
            <p class="text-sm text-muted mb-2">Ticket #${ticketId} ${isVip ? '<span class="badge badge-gold">VIP</span>' : ''}</p>
            <p class="text-sm text-muted mb-3">${res.event_title || ''} — ${res.quantity} ticket(s) — ${formatPrice(res.total_price)}</p>
            <p class="text-sm text-warning mb-2"><i class="fas fa-shield-alt mr-1"></i> En attente de validation par l'administrateur</p>
            <div id="qrcode-container" class="mb-3" style="display:flex;justify-content:center;"></div>
            <p class="text-xs text-muted">Une fois validé, présentez ce QR code à l'entrée de l'événement.</p>
            <div class="d-flex gap-2 justify-content-center mt-3">
                <button class="btn btn-outline-info btn-sm" onclick="Events.downloadTicketPDFById('${ticketId}','${token}','${res.event_title || ''}','${res.quantity}','${res.total_price || 0}','${isVip ? 'vip' : 'normal'}')">
                    <i class="fas fa-download mr-1"></i> Télécharger PDF
                </button>
                <button class="btn btn-red btn-sm" onclick="Events.closeConfirmModal()">Fermer</button>
            </div>
        `;
        modal.classList.remove('hidden');
        setTimeout(() => {
            const c = document.getElementById('qrcode-container');
            c.innerHTML = '';
            const qrSize = Math.min(180, window.innerWidth - 100);
            new QRCode(c, {
                text: JSON.stringify({ ticket_id: ticketId, event: res.event_title || '', user: Auth.user?.fullname || '', qr_token: token }),
                width: qrSize, height: qrSize, colorDark: '#ffffff', colorLight: '#000000', correctLevel: QRCode.CorrectLevel.H
            });
        }, 100);
    },

    closeConfirmModal() {
        document.getElementById('ticket-confirm-modal').classList.add('hidden');
    },

    async showTicketQR(ticketId) {
        const ticket = this.myTickets.find(t => t.id === ticketId);
        if (!ticket) return;
        this.showTicketConfirm({ ticket_id: ticket.id, event_title: ticket.event_title, qr_token: ticket.qr_token, ticket_type: ticket.ticket_type, quantity: ticket.quantity, total_price: ticket.total_price });
    },

    async downloadTicketPDFById(ticketId, qrToken, eventTitle, quantity, totalPrice, ticketType) {
        let token = qrToken;
        let title = eventTitle;
        let qty = quantity;
        let price = totalPrice;
        let type = ticketType;
        if (!token || !title) {
            const ticket = this.myTickets.find(t => t.id == ticketId || t.ticket_id == ticketId);
            if (ticket) {
                token = ticket.qr_token || token;
                title = ticket.event_title || title;
                qty = ticket.quantity || qty;
                price = ticket.total_price || price;
                type = ticket.ticket_type || type;
            }
        }
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Ticket #${ticketId}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
                .ticket-card { border: 2px dashed #e74c3c; border-radius: 12px; padding: 30px; max-width: 400px; margin: 40px auto; background: #fff; color: #000; }
                h2 { color: #e74c3c; margin-bottom: 5px; }
                .badge-vip { background: gold; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
                img { margin: 20px auto; display: block; }
                .footer { color: #888; font-size: 11px; margin-top: 20px; }
                @media print { body { padding: 0; } .ticket-card { break-inside: avoid; } }
            </style></head>
            <body>
                <div class="ticket-card">
                    <h2>Morondava</h2>
                    <p style="color:#666;">${title}</p>
                    <p><strong>${qty} ticket(s)</strong> — ${formatPrice ? formatPrice(Number(price || 0)) : price + ' Ar'}</p>
                    ${type === 'vip' ? '<p><span class="badge-vip">VIP</span></p>' : ''}
                    <p style="font-size:12px;color:#999;">Ticket #${ticketId}</p>
                    <div id="qr-print-${ticketId}" style="display:flex;justify-content:center;margin:10px 0;"></div>
                    <p class="footer">Présentez ce QR code à l'entrée</p>
                </div>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
                <script>
                    new QRCode(document.getElementById('qr-print-${ticketId}'), {
                        text: JSON.stringify({ ticket_id: ${ticketId}, event: '${title.replace(/'/g, "\\'")}', qr_token: '${token}' }),
                        width: 160, height: 160, colorDark: '#000000', colorLight: '#ffffff'
                    });
                    setTimeout(() => window.print(), 500);
                <\/script>
            </body></html>
        `);
        win.document.close();
    },

    async downloadTicketPDF(ticketId) {
        const ticket = this.myTickets.find(t => t.id === ticketId);
        if (!ticket) return;
        this.downloadTicketPDFById(ticket.id, ticket.qr_token, ticket.event_title, ticket.quantity, ticket.total_price, ticket.ticket_type);
    }
};
