document.addEventListener('DOMContentLoaded', () => {
    const trackButton = document.getElementById('trackButton');
    const refIdInput = document.getElementById('refIdInput');
    const trackResultContainer = document.getElementById('trackResult');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');

    const trackOrder = async () => {
        const refId = refIdInput.value.trim();
        if (!refId) {
            alert('Silakan masukkan ID Transaksi.');
            return;
        }

        // Reset tampilan
        trackResultContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        loadingSpinner.style.display = 'block';
        trackButton.disabled = true;
        trackButton.textContent = 'Mencari...';

        try {
            const response = await fetch(`/api/status?ref_id=${refId}`);

            // --- INI BAGIAN UTAMA PERBAIKAN ---
            // Cek jika respons GAGAL (misal: 404 Not Found)
            if (!response.ok) {
                // Langsung tampilkan pesan error umum tanpa mencoba parsing JSON
                throw new Error('Transaksi tidak ditemukan atau ID salah.');
            }

            // Jika respons SUKSES, baru kita proses sebagai JSON
            const result = await response.json();
            if (result.success) {
                displayResult(result.data);
            } else {
                // Untuk kasus di mana server merespons 200 OK tapi dengan pesan error
                throw new Error(result.message);
            }

        } catch (error) {
            // Blok catch ini sekarang akan menangani semua jenis error
            errorMessage.textContent = `${error.message}`;
            errorMessage.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
            trackButton.disabled = false;
            trackButton.textContent = 'Lacak';
        }
    };

    const displayResult = (data) => {
        let statusClass = '';
        const statusText = data.status.toLowerCase();

        if (statusText === 'sukses') {
            statusClass = 'sukses';
        } else if (statusText === 'pending' || statusText === 'diproses') {
            statusClass = 'pending';
        } else {
            statusClass = 'gagal';
        }

        trackResultContainer.innerHTML = `
            <div class="result-row">
                <span>ID Transaksi:</span>
                <span>${data.ref_id}</span>
            </div>
            <div class="result-row">
                <span>Tanggal:</span>
                <span>${new Date(data.createdAt).toLocaleString('id-ID')}</span>
            </div>
            <div class="result-row">
                <span>Customer No:</span>
                <span>${data.customer_no}</span>
            </div>
            <div class="result-row">
                <span>Detail Pesan:</span>
                <span>${data.message}</span>
            </div>
            ${data.sn ? `
            <div class="result-row">
                <span>Serial Number (SN):</span>
                <span>${data.sn}</span>
            </div>` : ''}
            <div class="result-row">
                <span>Status:</span>
                <span><span class="status-badge ${statusClass}">${data.status}</span></span>
            </div>
        `;
        trackResultContainer.style.display = 'block';
    };

    trackButton.addEventListener('click', trackOrder);
    refIdInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            trackOrder();
        }
    });
});
