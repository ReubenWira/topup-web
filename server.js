require('dotenv').config();
const express = require('express');
const axios = require('axios');
const md5 = require('md5');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const MOUNT_PATH = process.env.RENDER_DISK_MOUNT_PATH || __dirname;
const DB_PATH = path.join(MOUNT_PATH, 'transactions.json');
const USERS_DB_PATH = path.join(MOUNT_PATH, 'users.json');


const loadTransactions = () => {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("Gagal memuat transactions.json:", error);
    }
    return {};
};

const saveTransactions = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Gagal menyimpan transactions.json:", error);
    }
};

const loadUsers = () => {
    try {
        if (fs.existsSync(USERS_DB_PATH)) {
            const data = fs.readFileSync(USERS_DB_PATH, 'utf8');
            if (data) { // Pastikan file tidak kosong
                return JSON.parse(data);
            }
        }
    } catch (error) {
        console.error("Gagal memuat users.json:", error);
    }
    return {};
};

const saveUsers = (data) => {
    try {
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Gagal menyimpan users.json:", error);
    }
};


let transactions = loadTransactions();
const clients = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.slice(1));
    const ref_id = urlParams.get('ref_id');

    if (ref_id) {
        clients.set(ref_id, ws);
        console.log(`Klien terhubung untuk ref_id: ${ref_id}`);
        if (transactions[ref_id]) {
            ws.send(JSON.stringify(transactions[ref_id]));
        }
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

function sendStatusUpdate(ref_id, transactionData) {
    const client = clients.get(ref_id);
    if (client && client.readyState === client.OPEN) {
        client.send(JSON.stringify(transactionData));
    }
}

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi.' });
    }

    const users = loadUsers();
    if (users[username]) {
        return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    users[username] = { 
        password: hashedPassword,
        role: 'member' 
    };
    saveUsers(users);

    console.log(`User baru terdaftar: ${username} dengan role member`);
    res.status(201).json({ success: true, message: 'Registrasi berhasil! Silakan masuk.' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password harus diisi.' });
    }

    const users = loadUsers();
    const user = users[username];

    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
    
    res.json({ success: true, message: 'Login berhasil!', data: { username: username, role: user.role } });
});

app.post('/api/request-reset', (req, res) => {
    const { username } = req.body;
    const users = loadUsers();
    const user = users[username];

    if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 3600000;

        users[username].resetToken = token;
        users[username].resetTokenExpiry = tokenExpiry;
        saveUsers(users);

        console.log(`Token reset untuk ${username}: ${token}`);
        res.json({ success: true, token: token });
    } else {
        res.json({ success: false, message: 'User tidak ditemukan' }); 
    }
});

app.post('/api/perform-reset', (req, res) => {
    const { username, token, password } = req.body;
    if (!username || !token || !password) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
    }

    const users = loadUsers();
    const user = users[username];

    if (!user || user.resetToken !== token || user.resetTokenExpiry < Date.now()) {
        return res.status(400).json({ success: false, message: 'Token tidak valid atau telah kedaluwarsa.' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    users[username].password = hashedPassword;
    delete users[username].resetToken;
    delete users[username].resetTokenExpiry;
    saveUsers(users);

    res.json({ success: true, message: 'Password berhasil direset.' });
});

app.get('/api/products', async (req, res) => {
    const { brand, username: loggedInUser } = req.query;
    if (!brand) return res.status(400).json({ message: 'Parameter "brand" diperlukan.' });

    const users = loadUsers();
    const user = loggedInUser ? users[loggedInUser] : null;
    const role = user ? user.role : 'member';

    const margin = role === 'vip' ? 0.01 : 0.02;

    const digiUsername = process.env.DIGIFLAZZ_USERNAME;
    const apiKey = process.env.DIGIFLAZZ_API_KEY;
    const signature = md5(digiUsername + apiKey + 'pricelist');
    
    try {
        const response = await axios.post('https://api.digiflazz.com/v1/price-list', { cmd: 'prepaid', username: digiUsername, sign: signature });
        
        const productsWithMargin = response.data.data
            .filter(p => 
                p.brand.toUpperCase() === brand.toUpperCase()
            )
            .map(product => {
                const originalPrice = product.price;
                const profit = Math.ceil(originalPrice * margin);
                const finalPrice = originalPrice + profit;
                return {
                    ...product,
                    price: finalPrice
                };
            });

        res.json(productsWithMargin);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Gagal mengambil data produk.' });
    }
});

app.post('/api/buat-transaksi', async (req, res) => {
    const { customer_no, sku, price } = req.body;
    if (!customer_no || !sku || !price) return res.status(400).json({ message: 'Data tidak lengkap.' });

    try {
        const digiUsername = process.env.DIGIFLAZZ_USERNAME;
        const apiKey = process.env.DIGIFLAZZ_API_KEY;
        const signature = md5(digiUsername + apiKey + sku);
        
        const priceListResponse = await axios.post('https://api.digiflazz.com/v1/price-list', { 
            cmd: 'prepaid', 
            username: digiUsername, 
            sign: signature,
            code: sku
        });

        const productData = priceListResponse.data.data;

        if (!productData || productData.length === 0) {
            return res.status(400).json({ success: false, message: 'Kode produk tidak valid.' });
        }

        const product = productData[0];
        
        if (product.buyer_product_status !== true || product.seller_product_status !== true) {
            return res.status(400).json({ success: false, message: 'Produk ini sedang tidak tersedia. Silakan pilih produk lain.' });
        }
    } catch (error) {
        console.error("Gagal memvalidasi produk:", error);
        return res.status(500).json({ success: false, message: 'Gagal terhubung ke provider untuk validasi produk. Coba lagi.' });
    }

    const ref_id = `JAWIRTOPUP-${Date.now()}`;
    const total_price = price; 

    transactions[ref_id] = {
        ref_id, customer_no, sku, total_price,
        status: 'PENDING_PAYMENT',
        message: 'Silakan pindai kode QR untuk menyelesaikan pembayaran.',
        payment_detail: {
            qris_image_url: 'https://www.inspiredpocus.com/wp-content/uploads/2020/03/qr-code-bc-asset-1.png'
        },
        createdAt: new Date()
    };
    saveTransactions(transactions);
    
    console.log(`Transaksi dibuat: ${ref_id}`);

    setTimeout(() => {
        handlePaymentSuccess(ref_id);
    }, 15000);

    res.json({ success: true, data: { ref_id } });
});

app.get('/api/status', (req, res) => {
    const { ref_id } = req.query;
    const currentTransactions = loadTransactions();
    const transaction = currentTransactions[ref_id];

    if (transaction) {
        res.json({ success: true, data: transaction });
    } else {
        res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }
});


async function handlePaymentSuccess(ref_id) {
    const transaction = transactions[ref_id];
    if (!transaction || transaction.status !== 'PENDING_PAYMENT') return;

    transaction.status = 'DIPROSES';
    transaction.message = 'Pembayaran berhasil! Kami sedang memproses pesanan Anda.';
    saveTransactions(transactions);
    sendStatusUpdate(ref_id, transaction);

    const username = process.env.DIGIFLAZZ_USERNAME;
    const apiKey = process.env.DIGIFLAZZ_API_KEY;
    const signature = md5(username + apiKey + ref_id);

    try {
        const response = await axios.post('https://api.digiflazz.com/v1/transaction', {
            username, buyer_sku_code: transaction.sku, customer_no: transaction.customer_no, ref_id, sign: signature
        });
        
        const digiData = response.data.data;
        transaction.status = digiData.status;
        transaction.message = digiData.message;
        transaction.sn = digiData.sn || '';
        saveTransactions(transactions);
        sendStatusUpdate(ref_id, transaction);

        if (transaction.status.toUpperCase() === 'PENDING') {
            setTimeout(() => {
                const finalTransaction = transactions[ref_id];
                if (finalTransaction && finalTransaction.status.toUpperCase() === 'PENDING') {
                    finalTransaction.status = 'sukses';
                    finalTransaction.message = 'Pesanan Anda telah berhasil diproses.';
                    finalTransaction.sn = finalTransaction.sn || `SN-SIM-${Date.now()}`;
                    saveTransactions(transactions);
                    sendStatusUpdate(ref_id, finalTransaction);
                }
            }, 7000);
        }
    } catch (error) {
        transaction.status = 'Gagal';
        transaction.message = 'Terjadi kesalahan saat menghubungi provider.';
        saveTransactions(transactions);
        sendStatusUpdate(ref_id, transaction);
    }
}

server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
