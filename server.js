// File: topup web/server.js
// VERSI FINAL - Dengan simulasi pembayaran 5 detik untuk pengujian.

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const md5 = 'md5';
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

let db;
const clients = new Map();

/**
 * Menghubungkan ke database MongoDB Atlas.
 */
async function connectToDb() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI tidak ditemukan di environment variables.');
        process.exit(1);
    }
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('jawir-topup-db'); // Ganti nama DB jika perlu
        console.log('Berhasil terhubung ke MongoDB Atlas');
    } catch (error) {
        console.error('Gagal terhubung ke MongoDB:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));


// --- LOGIKA REAL-TIME & STABILITAS KONEKSI ---

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.slice(1));
    const ref_id = urlParams.get('ref_id');

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    if (ref_id) {
        clients.set(ref_id, ws);
        console.log(`Klien terhubung untuk ref_id: ${ref_id}`);
        db.collection('transactions').findOne({ ref_id }).then(transaction => {
            if (transaction) {
                ws.send(JSON.stringify(transaction));
            }
        });
    }

    ws.on('close', () => {
        clients.forEach((client, key) => {
            if (client === ws) {
                clients.delete(key);
                console.log(`Klien terputus untuk ref_id: ${key}`);
            }
        });
    });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

function sendStatusUpdate(ref_id, transactionData) {
    const client = clients.get(ref_id);
    if (client && client.readyState === client.OPEN) {
        client.send(JSON.stringify(transactionData));
    }
}

// --- RUTE API OTENTIKASI ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi.' });
    }
    try {
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
        }
        const hashedPassword = bcrypt.hashSync(password, 10);
        await usersCollection.insertOne({ username, password: hashedPassword, role: 'member' });
        res.status(201).json({ success: true, message: 'Registrasi berhasil!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi.' });
    }
    try {
        const user = await db.collection('users').findOne({ username });
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, message: 'Username atau password salah.' });
        }
        res.json({ success: true, data: { username: user.username, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// --- RUTE API PRODUK & TRANSAKSI ---
app.get('/api/products', async (req, res) => {
    const { brand, username: loggedInUser } = req.query;
    if (!brand) return res.status(400).json({ message: 'Parameter "brand" diperlukan.' });

    try {
        let role = 'member';
        if (loggedInUser) {
            const user = await db.collection('users').findOne({ username: loggedInUser });
            if (user) role = user.role;
        }
        const margin = role === 'vip' ? 0.01 : 0.02;

        const digiUsername = process.env.DIGIFLAZZ_USERNAME;
        const apiKey = process.env.DIGIFLAZZ_API_KEY;
        const signature = md5(digiUsername + apiKey + 'pricelist');

        const response = await axios.post('https://api.digiflazz.com/v1/price-list', { cmd: 'prepaid', username: digiUsername, sign: signature });

        const productsWithMargin = response.data.data
            .filter(p => p.brand.toUpperCase() === brand.toUpperCase())
            .map(product => ({ ...product, price: product.price + Math.ceil(product.price * margin) }));
            
        res.json(productsWithMargin);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data produk.' });
    }
});

// ### FUNGSI INI DIKEMBALIKAN KE VERSI SIMULASI ###
app.post('/api/buat-transaksi', async (req, res) => {
    const { customer_no, sku, price } = req.body;
    if (!customer_no || !sku || !price) return res.status(400).json({ message: 'Data tidak lengkap.' });

    const ref_id = `JAWIRTOPUP-${Date.now()}`;
    
    const transactionData = {
        ref_id,
        customer_no,
        sku,
        total_price: price,
        status: 'PENDING_PAYMENT',
        message: 'Silakan pindai kode QR untuk menyelesaikan pembayaran.',
        payment_detail: { qris_image_url: 'https://www.inspiredpocus.com/wp-content/uploads/2020/03/qr-code-bc-asset-1.png' },
        createdAt: new Date()
    };

    try {
        await db.collection('transactions').insertOne(transactionData);
        console.log(`Transaksi dibuat: ${ref_id}`);

        // !!! KODE SIMULASI 5 DETIK DIKEMBALIKAN SESUAI PERMINTAAN !!!
        // Ini akan memanggil handlePaymentSuccess setelah 5 detik untuk memulai proses top-up.
        setTimeout(() => handlePaymentSuccess(ref_id), 5000);

        res.json({ success: true, data: { ref_id } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal menyimpan transaksi.' });
    }
});

app.get('/api/status', async (req, res) => {
    const { ref_id } = req.query;
    try {
        const transaction = await db.collection('transactions').findOne({ ref_id });
        if (transaction) {
            res.json({ success: true, data: transaction });
        } else {
            res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// --- ENDPOINT WEBHOOK DARI DIGIFLAZZ ---
app.post('/api/digiflazz-callback', async (req, res) => {
    try {
        const webhookSecret = req.header('x-digiflazz-secret'); 
        if (webhookSecret !== process.env.DIGIFLAZZ_WEBHOOK_SECRET) {
            console.warn('Callback diterima dengan secret yang tidak valid.');
            return res.status(403).json({ success: false, message: 'Secret tidak valid.' });
        }

        const callbackData = req.body.data;
        if (!callbackData || !callbackData.ref_id) {
            return res.status(400).json({ success: false, message: 'Data atau ref_id tidak ada.' });
        }
        
        console.log('Menerima callback dari DigiFlazz:', callbackData);

        const transactionsCollection = db.collection('transactions');
        await transactionsCollection.updateOne(
            { ref_id: callbackData.ref_id },
            { 
                $set: { 
                    status: callbackData.status.toLowerCase(),
                    message: callbackData.message, 
                    sn: callbackData.sn || '' 
                } 
            }
        );
        
        const updatedTransaction = await transactionsCollection.findOne({ ref_id: callbackData.ref_id });
        if (updatedTransaction) {
            sendStatusUpdate(callbackData.ref_id, updatedTransaction);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error menangani callback DigiFlazz:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

async function handlePaymentSuccess(ref_id) {
    const transactionsCollection = db.collection('transactions');
    let transaction = await transactionsCollection.findOne({ ref_id });

    if (!transaction || transaction.status !== 'PENDING_PAYMENT') return;

    await transactionsCollection.updateOne({ ref_id }, { $set: { status: 'diproses', message: 'Pembayaran berhasil! Kami sedang memproses pesanan Anda.' } });
    transaction = await transactionsCollection.findOne({ ref_id });
    sendStatusUpdate(ref_id, transaction);

    const username = process.env.DIGIFLAZZ_USERNAME;
    const apiKey = process.env.DIGIFLAZZ_API_KEY;
    const signature = md5(username + apiKey + ref_id);

    try {
        console.log(`Mengirim permintaan top-up ke DigiFlazz untuk ref_id: ${ref_id}`);
        await axios.post('https://api.digiflazz.com/v1/transaction', {
            username,
            buyer_sku_code: transaction.sku,
            customer_no: transaction.customer_no,
            ref_id,
            sign: signature,
            testing: false,
        });
        
    } catch (error) {
        console.error("Error menghubungi provider:", error.response ? error.response.data : error.message);
        const updatedTransaction = await transactionsCollection.findOneAndUpdate(
            { ref_id },
            { $set: { status: 'gagal', message: 'Terjadi kesalahan saat menghubungi provider.' } },
            { returnDocument: 'after' }
        );
        sendStatusUpdate(ref_id, updatedTransaction.value);
    }
}

// Menjalankan server SETELAH koneksi database berhasil
connectToDb().then(() => {
    server.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error("Tidak dapat memulai server karena koneksi DB gagal.", err);
});
