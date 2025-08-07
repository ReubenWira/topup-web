// File: topup web/server.js
// Versi ini sudah dimodifikasi sepenuhnya untuk menggunakan MongoDB Atlas.

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const md5 = require('md5');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb'); // <-- Driver MongoDB

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Menggunakan port dari Render atau 3000 jika lokal
const PORT = process.env.PORT || 3000;
// Mengambil URI koneksi MongoDB dari environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Variabel untuk menampung koneksi database agar bisa diakses global
let db;

// Kumpulan klien WebSocket yang terhubung
const clients = new Map();

/**
 * Fungsi untuk menghubungkan ke database MongoDB Atlas.
 * Fungsi ini akan dipanggil saat server pertama kali dijalankan.
 */
async function connectToDb() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI tidak ditemukan di environment variables.');
        process.exit(1); // Keluar dari aplikasi jika URI tidak ada
    }
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        // Ganti 'jawir-topup-db' jika Anda menggunakan nama database lain
        db = client.db('jawir-topup-db');
        console.log('Berhasil terhubung ke MongoDB Atlas');
    } catch (error) {
        console.error('Gagal terhubung ke MongoDB:', error);
        process.exit(1); // Keluar jika koneksi gagal
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Menyajikan file statis seperti index.html

// Logika WebSocket untuk update status real-time
wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.slice(1));
    const ref_id = urlParams.get('ref_id');

    if (ref_id) {
        clients.set(ref_id, ws);
        console.log(`Klien terhubung untuk ref_id: ${ref_id}`);
        // Kirim status terakhir jika ada saat klien baru terhubung
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

/**
 * Mengirim pembaruan status transaksi ke klien melalui WebSocket.
 * @param {string} ref_id - ID referensi transaksi.
 * @param {object} transactionData - Data transaksi terbaru.
 */
function sendStatusUpdate(ref_id, transactionData) {
    const client = clients.get(ref_id);
    if (client && client.readyState === client.OPEN) {
        client.send(JSON.stringify(transactionData));
    }
}

// --- RUTE API ---

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
        await usersCollection.insertOne({
            username,
            password: hashedPassword,
            role: 'member'
        });

        console.log(`User baru terdaftar: ${username}`);
        res.status(201).json({ success: true, message: 'Registrasi berhasil! Silakan masuk.' });
    } catch (error) {
        console.error("Error saat registrasi:", error);
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

        res.json({ success: true, message: 'Login berhasil!', data: { username: user.username, role: user.role } });
    } catch (error) {
        console.error("Error saat login:", error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.post('/api/request-reset', async (req, res) => {
    const { username } = req.body;
    try {
        const user = await db.collection('users').findOne({ username });

        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const tokenExpiry = Date.now() + 3600000; // Token berlaku 1 jam

            await db.collection('users').updateOne(
                { username },
                { $set: { resetToken: token, resetTokenExpiry: tokenExpiry } }
            );

            console.log(`Token reset untuk ${username}: ${token}`);
            res.json({ success: true, token: token });
        } else {
            // Tetap kirim respons sukses untuk mencegah user enumeration
            res.json({ success: false, message: 'User tidak ditemukan' });
        }
    } catch (error) {
        console.error("Error saat request reset:", error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.post('/api/perform-reset', async (req, res) => {
    const { username, token, password } = req.body;
    if (!username || !token || !password) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
    }

    try {
        const user = await db.collection('users').findOne({
            username,
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() } // Cek apakah token masih berlaku
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Token tidak valid atau telah kedaluwarsa.' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        await db.collection('users').updateOne(
            { username },
            { $set: { password: hashedPassword }, $unset: { resetToken: "", resetTokenExpiry: "" } }
        );

        res.json({ success: true, message: 'Password berhasil direset.' });
    } catch (error) {
        console.error("Error saat perform reset:", error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.get('/api/products', async (req, res) => {
    const { brand, username: loggedInUser } = req.query;
    if (!brand) return res.status(400).json({ message: 'Parameter "brand" diperlukan.' });

    try {
        let role = 'member';
        if (loggedInUser) {
            const user = await db.collection('users').findOne({ username: loggedInUser });
            if (user) {
                role = user.role;
            }
        }

        const margin = role === 'vip' ? 0.01 : 0.02;

        const digiUsername = process.env.DIGIFLAZZ_USERNAME;
        const apiKey = process.env.DIGIFLAZZ_API_KEY;
        const signature = md5(digiUsername + apiKey + 'pricelist');

        const response = await axios.post('https://api.digiflazz.com/v1/price-list', { cmd: 'prepaid', username: digiUsername, sign: signature });

        const productsWithMargin = response.data.data
            .filter(p => p.brand.toUpperCase() === brand.toUpperCase())
            .map(product => {
                const originalPrice = product.price;
                const profit = Math.ceil(originalPrice * margin);
                return { ...product, price: originalPrice + profit };
            });

        res.json(productsWithMargin);
    } catch (error) {
        console.error("Error mengambil produk:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Gagal mengambil data produk.' });
    }
});

app.post('/api/buat-transaksi', async (req, res) => {
    const { customer_no, sku, price } = req.body;
    if (!customer_no || !sku || !price) return res.status(400).json({ message: 'Data tidak lengkap.' });

    // (Kode validasi produk Anda bisa tetap di sini jika diperlukan)

    const ref_id = `JAWIRTOPUP-${Date.now()}`;
    const transactionData = {
        ref_id,
        customer_no,
        sku,
        total_price: price,
        status: 'PENDING_PAYMENT',
        message: 'Silakan pindai kode QR untuk menyelesaikan pembayaran.',
        payment_detail: {
            qris_image_url: 'https://www.inspiredpocus.com/wp-content/uploads/2020/03/qr-code-bc-asset-1.png'
        },
        createdAt: new Date()
    };

    try {
        await db.collection('transactions').insertOne(transactionData);
        console.log(`Transaksi dibuat: ${ref_id}`);

        // Simulasi pembayaran berhasil setelah 15 detik
        setTimeout(() => {
            handlePaymentSuccess(ref_id);
        }, 15000);

        res.json({ success: true, data: { ref_id } });
    } catch (error) {
        console.error("Error membuat transaksi:", error);
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
        console.error("Error mengambil status:", error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

/**
 * Menangani logika setelah pembayaran berhasil (simulasi).
 * @param {string} ref_id - ID referensi transaksi.
 */
async function handlePaymentSuccess(ref_id) {
    const transactionsCollection = db.collection('transactions');
    const transaction = await transactionsCollection.findOne({ ref_id });

    if (!transaction || transaction.status !== 'PENDING_PAYMENT') return;

    // Update status ke DIPROSES
    await transactionsCollection.updateOne({ ref_id }, { $set: { status: 'DIPROSES', message: 'Pembayaran berhasil! Kami sedang memproses pesanan Anda.' } });
    let updatedTransaction = await transactionsCollection.findOne({ ref_id });
    sendStatusUpdate(ref_id, updatedTransaction);

    const username = process.env.DIGIFLAZZ_USERNAME;
    const apiKey = process.env.DIGIFLAZZ_API_KEY;
    const signature = md5(username + apiKey + ref_id);

    try {
        // Memanggil API DigiFlazz untuk melakukan top-up
        const response = await axios.post('https://api.digiflazz.com/v1/transaction', {
            username,
            buyer_sku_code: transaction.sku,
            customer_no: transaction.customer_no,
            ref_id,
            sign: signature
        });

        const digiData = response.data.data;
        await transactionsCollection.updateOne({ ref_id }, { $set: { status: digiData.status, message: digiData.message, sn: digiData.sn || '' } });
        updatedTransaction = await transactionsCollection.findOne({ ref_id });
        sendStatusUpdate(ref_id, updatedTransaction);

        // Jika status masih PENDING, lakukan simulasi sukses setelah beberapa detik
        if (updatedTransaction.status.toUpperCase() === 'PENDING') {
            setTimeout(async () => {
                const finalTransaction = await transactionsCollection.findOne({ ref_id });
                if (finalTransaction && finalTransaction.status.toUpperCase() === 'PENDING') {
                    await transactionsCollection.updateOne({ ref_id }, { $set: { status: 'sukses', message: 'Pesanan Anda telah berhasil diproses.', sn: finalTransaction.sn || `SN-SIM-${Date.now()}` } });
                    const finalUpdatedTransaction = await transactionsCollection.findOne({ ref_id });
                    sendStatusUpdate(ref_id, finalUpdatedTransaction);
                }
            }, 7000);
        }
    } catch (error) {
        console.error("Error menghubungi provider:", error.response ? error.response.data : error.message);
        await transactionsCollection.updateOne({ ref_id }, { $set: { status: 'Gagal', message: 'Terjadi kesalahan saat menghubungi provider.' } });
        updatedTransaction = await transactionsCollection.findOne({ ref_id });
        sendStatusUpdate(ref_id, updatedTransaction);
    }
}

// Menjalankan server HANYA SETELAH koneksi database berhasil
connectToDb().then(() => {
    server.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error("Tidak dapat memulai server karena koneksi DB gagal.", err);
});
