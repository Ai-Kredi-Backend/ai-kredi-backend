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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Sunucu ' + PORT + ' portunda ayakta!'));