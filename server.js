const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Statik Dosya Sunumu (index.html'i ana sayfa yapar)
app.use(express.static('.'));

// Neon PostgreSQL Bağlantı Havuzu
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Veritabanı Tablolarını Otomatik Oluşturan Fonksiyon
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        wallet_address VARCHAR(255),
        credit_balance INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INT,
        amount_usd DECIMAL(10,2),
        crypto_amount DECIMAL(18,8),
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Neon PostgreSQL veritabanı tabloları hazır!');
  } catch (err) {
    console.error('Veritabanı tablo hatası:', err);
  }
}

initDB();

// 1. Cüzdan Bilgilerini Sunan Endpoint
app.get('/api/wallet/crypto-info', (req, res) => {
  res.json({
    success: true,
    wallets: {
      USDT_TRC20: "TNWYid6sBqLYmHLsGnqZv2LupXsTfvrkVd",
      USDT_ERC20: "0x2EF2d6343029e030DB457902F2cAEe249203C7B8"
    }
  });
});

// 2. Kripto Ödeme ve Kademe Bonus Hesaplama Endpoint'i
app.post('/api/wallet/crypto-topup', async (req, res) => {
  try {
    const { userId, amountUsd, txHash, network } = req.body;

    if (!amountUsd || !txHash || !network) {
      return res.status(400).json({ success: false, error: 'Eksik bilgi girdiniz.' });
    }

    const usdNum = Number(amountUsd);
    const usdToTlRate = 34.0; // Sabit kur veya geliştirilebilir
    const amountInTry = usdNum * usdToTlRate;

    // Kademe Bonus Hesaplama (%0 - %12.5)
    let bonusPercentage = 0;
    if (usdNum >= 10000) bonusPercentage = 0.125;
    else if (usdNum >= 5000) bonusPercentage = 0.10;
    else if (usdNum >= 2500) bonusPercentage = 0.08;
    else if (usdNum >= 1000) bonusPercentage = 0.05;

    const bonusAmount = amountInTry * bonusPercentage;
    const totalBalance = amountInTry + bonusAmount;

    res.json({
      success: true,
      message: 'Kripto ödeme bildirimi başarıyla alındı ve kuyruğa eklendi!',
      details: {
        yatirilanUsd: usdNum,
        tlKarsiligi: amountInTry.toFixed(2) + ' TL',
        kazanilanBonus: bonusAmount.toFixed(2) + ` TL (%${bonusPercentage * 100})`,
        toplamCuzdanaYansiyan: totalBalance.toFixed(2) + ' TL',
        ag: network,
        txHash: txHash
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Kesin Yönlendirme: Tüm bilinmeyen route'ları index.html'e bağlar
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('Sunucu ' + PORT + ' portunda başarıyla ayakta!');
});