document.addEventListener('DOMContentLoaded', function() {
    const contentEl = document.getElementById('confirmation-content');
    const params = new URLSearchParams(window.location.search);
    const ref_id = params.get('ref_id');

    if (!ref_id) {
        contentEl.innerHTML = `
            <div class="confirmation-container">
                <h1>Error</h1>
                <p>ID Transaksi tidak ditemukan. Silakan coba lagi.</p>
                <a href="index.html" class="btn-primary">Kembali</a>
            </div>`;
        return;
    }

    // Koneksi ke WebSocket Server
    const ws = new WebSocket(`ws://localhost:3000?ref_id=${ref_id}`);

    ws.onopen = () => {
        console.log('Terhubung ke server WebSocket.');
        renderLoading();
    };

    ws.onmessage = (event) => {
        const transaction = JSON.parse(event.data);
        console.log('Menerima status update:', transaction);
        renderUI(transaction);
    };

    ws.onclose = () => {
        console.log('Koneksi WebSocket ditutup.');
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        contentEl.innerHTML = `
            <div class="confirmation-container">
                <h1>Koneksi Gagal</h1>
                <p>Tidak dapat terhubung ke server untuk update status. Pastikan server berjalan.</p>
            </div>`;
    };

    function renderLoading() {
        contentEl.innerHTML = `
            <div class="confirmation-container">
                <h1>Menunggu Status...</h1>
                <p>Menghubungkan ke server untuk mendapatkan status pesanan Anda.</p>
                <div class="spinner"></div>
            </div>`;
    }

    function renderUI(transaction) {
        const statusKapital = transaction.status.toUpperCase();

        if (statusKapital === 'PENDING_PAYMENT') {
            contentEl.innerHTML = `
                <div class="confirmation-container">
                    <h1>Menunggu Pembayaran</h1>
                    <p>${transaction.message}</p>
                    <div class="payment-details">
                        <img src="${transaction.payment_detail.qris_image_url}" alt="QR Code Pembayaran">
                    </div>
                    <p style="margin-top: 20px;">Total Tagihan:</p>
                    <h2 style="color: var(--text-light); font-size: 2.5rem;">
                        ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(transaction.total_price)}
                    </h2>
                    <p style="font-size: 0.9rem; margin-top: 15px;">Halaman ini akan diperbarui secara otomatis setelah pembayaran Anda terdeteksi.</p>
                </div>`;
        } else {
            let statusClass = '';
            if (statusKapital === 'DIPROSES' || statusKapital === 'PENDING') {
                statusClass = 'status-pending';
            } else if (statusKapital === 'SUKSES') {
                statusClass = 'status-success';
            } else {
                statusClass = 'status-failed';
            }

            // --- PERUBAHAN DI SINI ---
            // Kita sekarang menampilkan ID Transaksi (ref_id) di halaman hasil
            contentEl.innerHTML = `
                <div class="confirmation-container">
                    <h1>Status Transaksi</h1>
                    <p>Terima kasih. Berikut adalah status terbaru pesanan Anda.</p>
                    <div class="status-box ${statusClass}">
                        <p style="border-bottom: 1px solid var(--glass-border); padding-bottom: 10px; margin-bottom: 10px;">
                            ID Transaksi: <strong>${transaction.ref_id}</strong>
                            <br>
                            <small>(Simpan ID ini untuk melacak pesanan Anda nanti)</small>
                        </p>
                        <p>Status: <strong style="text-transform: capitalize;">${transaction.status}</strong></p>
                        <p>${transaction.message}</p>
                        ${transaction.sn ? `<p>Serial Number (SN): <strong>${transaction.sn}</strong></p>` : ''}
                    </div>
                    ${statusKapital === 'DIPROSES' || statusKapital === 'PENDING' ? '<div class="spinner"></div>' : ''}
                    <a href="index.html" class="btn-primary" style="margin-top: 30px;">Kembali ke Halaman Utama</a>
                </div>`;
        }
    }
});