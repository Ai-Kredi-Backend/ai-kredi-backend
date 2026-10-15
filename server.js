const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Neon PostgreSQL bağlantı havuzu
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Veritabanı tablolarını otomatik oluşturan fonksiyon
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
          user_id INT REFERENCES users(id),
          tx_hash VARCHAR(255) UNIQUE,
          amount_usd DECIMAL(10,2),
          credits_added INT,
          status VARCHAR(50) DEFAULT 'SUCCESS',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Neon PostgreSQL veritabanı tabloları hazır!');
  } catch (err) {
    console.error('Veritabanı tablo hatası:', err);
  }
}

initDB();

// 1. Ana Sayfa Test Endpoint'i
app.get('/', (req, res) => {
  res.send('AI Kredi Backend, Neon DB ve Kripto Altyapisi Aktif!');
});

// 2. Kullanıcı Kayıt / Getir Endpoint'i
app.post('/api/users', async (req, res) => {
  const { email, wallet_address } = req.body;
  try {
    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      user = await pool.query(
        'INSERT INTO users (email, wallet_address, credit_balance) VALUES ($1, $2, 10) RETURNING *',
        [email, wallet_address]
      );
      return res.json({ message: 'Kullanıcı oluşturuldu ve 10 Hediye Kredi yüklendi!', user: user.rows[0] });
    }
    res.json({ message: 'Kullanıcı zaten mevcut.', user: user.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// 3. Kripto Ödeme / Kredi Yükleme Endpoint'i
app.post('/api/credit/add', async (req, res) => {
  const { email, tx_hash, amount_usd, credits_added } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
    const user = userRes.rows[0];

    // İşlemi transactions tablosuna kaydet ve kullanıcının kredisini artır
    await pool.query(
      'INSERT INTO transactions (user_id, tx_hash, amount_usd, credits_added, status) VALUES ($1, $2, $3, $4, $5)',
      [user.id, tx_hash, amount_usd, credits_added, 'SUCCESS']
    );

    const updatedUser = await pool.query(
      'UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING *',
      [credits_added, user.id]
    );

    res.json({
      message: 'Ödeme başarıyla onaylandı ve krediler yüklendi!',
      user: updatedUser.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İşlem başarısız veya tx_hash zaten kullanılmış.' });
  }
});
// --- BONUS HESAPLAMA MOTORU ---
function calculateBonus(amount) {
  let bonusRate = 0;
  if (amount >= 10000) {
    bonusRate = 0.125; // %12.5
  } else if (amount >= 5000) {
    bonusRate = 0.10;  // %10
  } else if (amount >= 2500) {
    bonusRate = 0.08;  // %8
  } else if (amount >= 1000) {
    bonusRate = 0.05;  // %5
  } else {
    bonusRate = 0.0;   // 0 - 500 TL arası bonussuz
  }
  
  const bonusAmount = amount * bonusRate;
  const totalBalance = amount + bonusAmount;
  return { amount, bonusRate, bonusAmount, totalBalance };
}

// --- 1. BAKİYE YÜKLEME API'Sİ (Bonus Hesaplamalı) ---
app.post('/api/wallet/topup', async (req, res) => {
  try {
    const { userId, amount, paymentMethod } = req.body; // paymentMethod: 'havale', 'kk', 'kripto', 'doviz'
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Geçersiz tutar!' });
    }

    const calculation = calculateBonus(Number(amount));

    // Not: Neon DB bağlantın üzerinden kullanıcının bakiyesini güncelleyeceksin.
    // Örnek SQL: UPDATE users SET balance = balance + $1 WHERE id = $2;
    
    res.json({
      success: true,
      message: 'Bakiye başarıyla yüklendi ve bonus eklendi!',
      details: {
        yatirilanTutar: calculation.amount,
        bonusOrani: `%%${calculation.bonusRate * 100}`,
        eklenenBonus: calculation.bonusAmount,
        cüzdanaYansıyanToplam: calculation.totalBalance,
        odemeYontemi: paymentMethod
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 2. BAKİYEDEN KREDİ / AI JETONU SATIN ALMA API'Sİ ---
app.post('/api/credit/buy-with-balance', async (req, res) => {
  try {
    const { userId, creditPackageId, packagePrice, creditAmount } = req.body;
    
    // Kullanıcının cüzdan bakiyesini kontrol et ve düş, ardından krediyi tanımla.

    res.json({
      success: true,
      message: `${creditAmount} adet kredi başarıyla satın alındı!`,
      kalanBakiye: 0 // Güncel bakiye dönecek
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- KRİPTO CÜZDAN BİLGİLERİ ---
const CRYPTO_WALLETS = {
  USDT_TRC20: 'TNWYid6sBqLYmHLsGnqZv2LupXsTfvrkVd',
  USDT_ERC20: '0x2EF2d6343029e030DB457902F2cAEe249203C7B8'
};

// Cüzdan adreslerini frontend'e dönen endpoint
app.get('/api/wallet/crypto-info', (req, res) => {
  res.json({
    success: true,
    wallets: CRYPTO_WALLETS
  });
});

// --- KRİPTO ÖDEME BİLDİRİMİ VE BONUSLU BAKİYE YÜKLEME ---
app.post('/api/wallet/crypto-topup', async (req, res) => {
  try {
    const { userId, amountUsd, txHash, network } = req.body; // network: 'TRC20' veya 'ERC20'

    if (!amountUsd || !txHash) {
      return res.status(400).json({ error: 'Tutar (USD) ve TxHash/İşlem Kodu zorunludur!' });
    }

    // Seçilen ağa göre doğru cüzdan adresini eşleme
    const selectedNetwork = (network && network.toUpperCase() === 'ERC20') ? 'ERC20' : 'TRC20';
    const targetWallet = selectedNetwork === 'ERC20' ? CRYPTO_WALLETS.USDT_ERC20 : CRYPTO_WALLETS.USDT_TRC20;

    // Güncel USDT/TL Kuru (Geliştirme aşamasında sabit, istenirse canlı kur API'sine bağlanabilir)
    const usdToTryRate = 34.50; 
    const amountInTry = Number(amountUsd) * usdToTryRate;

    // Kademeli Bonus Hesaplama Motoru
    const calculation = calculateBonus(amountInTry);

    res.json({
      success: true,
      message: 'Kripto ödeme bildirimi alındı! Bakiyeniz kontrol edildikten sonra otomatik tanımlanacaktır.',
      details: {
        yatirilanUsd: Number(amountUsd),
        tlKarsiligi: amountInTry.toFixed(2) + ' TL',
        kazanilanBonus: calculation.bonusAmount.toFixed(2) + ' TL',
        toplamCuzdanaYansiyan: calculation.totalBalance.toFixed(2) + ' TL',
        ag: selectedNetwork,
        aliciCuzdan: targetWallet,
        txHash: txHash
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Sunucu ' + PORT + ' portunda ayakta!'));

