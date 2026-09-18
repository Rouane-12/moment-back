const axios = require('axios');
const crypto = require('crypto');

class KkiapayService {
  constructor() {
    this.apiKey = process.env.KKIAPAY_API_KEY;
    this.secretKey = process.env.KKIAPAY_SECRET_KEY;
    this.publicKey = process.env.KKIAPAY_PUBLIC_KEY;
    this.baseUrl = process.env.KKIAPAY_API_URL || 'https://api.kkiapay.me';
    this.sandboxUrl = 'https://sandbox-api.kkiapay.me';
    this.isSandbox = process.env.NODE_ENV !== 'production';
  }

  getUrl() {
    return this.isSandbox ? this.sandboxUrl : this.baseUrl;
  }

  async createPayment(paymentData) {
    try {
      const response = await axios.post(`${this.getUrl()}/api/v1/payments`, {
        amount: paymentData.amount,
        phone: paymentData.phone,
        email: paymentData.email,
        name: paymentData.name,
        callback_url: paymentData.callbackUrl,
        description: paymentData.description
      }, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Secret-Key': this.secretKey,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Kkiapay create payment error:', error);
      throw error;
    }
  }

  /**
   * Vérifie une transaction. Le widget frontend paie en sandbox tant que
   * `sandbox: true` est passé, donc la transaction peut exister uniquement
   * sur l'API sandbox. On interroge l'environnement courant puis l'autre,
   * et on renvoie la première réponse exploitable.
   */
  async verifyTransaction(transactionId) {
    const urls = [];
    const current = this.getUrl();
    const other = this.isSandbox ? this.baseUrl : this.sandboxUrl;
    urls.push(current, other);

    let lastError;
    for (const base of urls) {
      try {
        const response = await axios.get(`${base}/api/v1/transactions/${transactionId}`, {
          headers: {
            'X-Api-Key': this.apiKey,
            'X-Secret-Key': this.secretKey
          },
          timeout: 10000
        });
        return response.data;
      } catch (error) {
        lastError = error;
        // 404 = transaction introuvable sur cet environnement : on tente l'autre.
        if (!error.response || error.response.status !== 404) {
          break; // erreur réseau/auth : inutile de sonder l'autre environnement
        }
      }
    }
    console.error('Kkiapay verify transaction error:', lastError?.message || lastError);
    throw lastError;
  }

  /**
   * Statut de succès insensible à la casse (Kkiapay renvoie SUCCESS ou success
   * selon l'environnement / l'endpoint).
   */
  isSuccessfulStatus(status) {
    return String(status || '').toLowerCase() === 'success';
  }

  verifyWebhookSignature(payload, signature) {
    const hmac = crypto.createHmac('sha512', this.secretKey);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  async refundTransaction(transactionId, amount) {
    try {
      const response = await axios.post(`${this.getUrl()}/api/v1/transactions/${transactionId}/refund`, {
        amount
      }, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Secret-Key': this.secretKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('Kkiapay refund error:', error);
      throw error;
    }
  }

  getPublicScript() {
    return `https://cdn.kkiapay.me/k.js`;
  }
}

module.exports = new KkiapayService();
