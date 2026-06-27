/**
 * API client for Morondartva-Store.
 * Abstracts fetch requests, headers, token attachment, and error handling.
 */

/**
 * Formats a number with thousands separators (space) and appends 'Ar' at the end.
 * Example: 25000 -> "25 000 Ar"
 */
function formatPrice(amount) {
    if (amount === undefined || amount === null) return '0 Ar';
    const num = Number(amount);
    if (isNaN(num)) return amount + ' Ar';
    return num.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ') + ' Ar';
}

const API_BASE = '/api';

const API = {
    // Helper to get headers with token
    getHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders
        };
        const token = localStorage.getItem('session_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    },

    // Handle responses
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data = {};
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = { message: await response.text() };
        }

        if (!response.ok) {
            // If unauthorized, clear session
            if (response.status === 401) {
                localStorage.removeItem('session_token');
                localStorage.removeItem('user_profile');
                // Trigger event to refresh UI
                window.dispatchEvent(new Event('authChange'));
            }
            throw new Error(data.error || data.message || `Erreur serveur (${response.status})`);
        }
        return data;
    },

    // HTTP Method Wrappers
    async get(endpoint) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'GET',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API GET ${endpoint} failed:`, error);
            throw error;
        }
    },

    async post(endpoint, body = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API POST ${endpoint} failed:`, error);
            throw error;
        }
    },

    async put(endpoint, body = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API PUT ${endpoint} failed:`, error);
            throw error;
        }
    },

    async delete(endpoint) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`API DELETE ${endpoint} failed:`, error);
            throw error;
        }
    }
};
