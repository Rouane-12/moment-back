const https = require('https');

class EmailService {
  constructor() {
    this.initialized = false;
    this.apiKey = null;
    this.senderEmail = null;
    this.senderName = null;
  }

  init() {
    if (this.initialized) return;

    this.apiKey = process.env.BREVO_API_KEY;
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'djossouvirouane6@gmail.com';
    this.senderName = process.env.BREVO_SENDER_NAME || 'MOMENT';

    console.log('📧 Email Service Init Check (Brevo API):');
    console.log('   BREVO_API_KEY:', this.apiKey ? '✓ Set' : '✗ Not set');
    console.log('   BREVO_SENDER_EMAIL:', this.senderEmail);

    this.initialized = true;
  }

  async sendMail(to, subject, html, recipientName) {
    this.init();

    if (!this.apiKey) {
      console.log(`\n📧 [MOCK EMAIL] To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   ---`);
      console.log(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200));
      console.log('---\n');
      return { success: true, mock: true };
    }

    try {
      console.log(`📧 Sending email via Brevo API to: ${to}`);
      
      // Brevo requires a non-empty name — fallback to email prefix
      const name = recipientName || to.split('@')[0] || 'Utilisateur';
      
      const payload = JSON.stringify({
        sender: {
          name: this.senderName,
          email: this.senderEmail,
        },
        to: [
          {
            email: to,
            name: name,
          },
        ],
        subject: subject,
        htmlContent: html,
      });

      const result = await this._brevoRequest('/v3/smtp/email', payload);
      
      console.log(`✅ Email sent successfully to ${to}`);
      console.log(`   Response:`, result);
      return { success: true, messageId: result };
    } catch (error) {
      console.error(`❌ Email failed to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  _brevoRequest(path, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.brevo.com',
        port: 443,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            console.error(`   Brevo API Error ${res.statusCode}:`, data);
            reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => reject(error));
      req.write(body);
      req.end();
    });
  }

  _getBaseTemplate(title, content) {
    return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
      <div style="max-width:480px;margin:0 auto;padding:40px 20px;">
        <div style="text-align:center;margin-bottom:32px;">
          <h1 style="color:#F5A623;font-size:28px;margin:0;letter-spacing:4px;text-transform:uppercase;">MOMENT</h1>
          <p style="color:#666;font-size:12px;letter-spacing:3px;margin-top:4px;">COTONOU · BÉNIN</p>
        </div>
        <div style="background:#111;border-radius:16px;padding:32px;border:1px solid #222;">
          <h2 style="color:#fff;font-size:20px;margin:0 0 16px 0;">${title}</h2>
          ${content}
        </div>
        <p style="color:#555;font-size:11px;text-align:center;margin-top:24px;letter-spacing:1px;">
          MOMENT · Compose ta sortie à Cotonou
        </p>
      </div>
    </body>
    </html>`;
  }

  async sendOtpEmail(to, firstName, otpCode, purpose = 'verification') {
    const isVerification = purpose === 'verification';
    const title = isVerification ? 'Vérifie ton compte' : 'Réinitialise ton mot de passe';
    const subtitle = isVerification
      ? `Bienvenue ${firstName} ! Utilise ce code pour valider ton inscription.`
      : `${firstName}, voici ton code de réinitialisation.`;

    const html = this._getBaseTemplate(title, `
      <p style="color:#aaa;font-size:14px;margin:0 0 24px 0;">${subtitle}</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#1a1a1a;color:#F5A623;font-size:36px;font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:12px;border:2px solid #333;">
          ${otpCode}
        </span>
      </div>
      <p style="color:#888;font-size:12px;text-align:center;margin:0;">
        Ce code expire dans 15 minutes.<br>
        Si tu n'as pas demandé cet email, ignore-le.
      </p>
    `);

    return this.sendMail(to, `MOMENT — ${title}`, html, firstName);
  }

  async sendBookingConfirmation(to, firstName, bookingData) {
    const html = this._getBaseTemplate('Réservation confirmée !', `
      <p style="color:#aaa;font-size:14px;margin:0 0 20px 0;">
        Salut ${firstName}, ta réservation <strong style="color:#F5A623;">${bookingData.title || 'MOMENT'}</strong> est confirmée.
      </p>
      <div style="background:#1a1a1a;border-radius:12px;padding:16px;margin:16px 0;">
        <table style="width:100%;color:#ccc;font-size:13px;">
          <tr><td style="padding:4px 0;">Date</td><td style="text-align:right;">${bookingData.date || '—'}</td></tr>
          <tr><td style="padding:4px 0;">Personnes</td><td style="text-align:right;">${bookingData.people || '—'}</td></tr>
          <tr><td style="padding:4px 0;">Total</td><td style="text-align:right;color:#F5A623;font-weight:bold;">${bookingData.total || '—'} FCFA</td></tr>
        </table>
      </div>
      <p style="color:#888;font-size:12px;text-align:center;">
        Code QR : <strong style="color:#F5A623;">${bookingData.qrCode || '—'}</strong>
      </p>
    `);

    return this.sendMail(to, 'MOMENT — Réservation confirmée', html, firstName);
  }
}

module.exports = new EmailService();
