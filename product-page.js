document.addEventListener('DOMContentLoaded', function() {
    // Cek status login di setiap halaman
    const loggedInUser = localStorage.getItem('loggedInUser');
    const userRole = localStorage.getItem('userRole');
    const authLinks = document.getElementById('auth-links');

    if (loggedInUser && authLinks) {
        const displayRole = userRole.charAt(0).toUpperCase() + userRole.slice(1);
        authLinks.innerHTML = `
            <span style="color: var(--text-light); margin-right: 15px; text-transform: capitalize;">Halo, ${loggedInUser}! (${displayRole})</span>
            <a href="#" id="logoutButton" class="btn-primary" style="background: #dc3545;">Keluar</a>
        `;

        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('loggedInUser');
                localStorage.removeItem('userRole');
                window.location.reload();
            });
        }
    }

    const nominalGrid = document.getElementById('nominalGridContainer');
    const buyButton = document.getElementById('buyButton');
    const summaryPriceEl = document.getElementById('summaryPrice');
    const summaryTotalEl = document.getElementById('summaryTotal');

    let selectedPrice = 0;
    let selectedSku = null;

    function getBrandFromPath() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('mobile-legends')) return 'MOBILE LEGENDS';
        if (path.includes('free-fire')) return 'FREE FIRE';
        if (path.includes('genshin-impact')) return 'GENSHIN IMPACT';
        if (path.includes('valorant')) return 'VALORANT';
        return null;
    }

    function formatRupiah(angka) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);
    }

    function updatePriceSummary() {
        const totalPrice = selectedPrice;
        if (summaryPriceEl) summaryPriceEl.textContent = formatRupiah(selectedPrice);
        if (summaryTotalEl) summaryTotalEl.textContent = formatRupiah(totalPrice);
    }

    async function fetchProducts() {
        const brand = getBrandFromPath();
        if (!brand) {
            if(nominalGrid) nominalGrid.innerHTML = '<p>Brand game tidak terdeteksi.</p>';
            return;
        };

        const user = localStorage.getItem('loggedInUser');
        const url = `/api/products?brand=${encodeURIComponent(brand)}&username=${encodeURIComponent(user || '')}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const products = await response.json();
            
            if (nominalGrid) {
                nominalGrid.innerHTML = '';
                if (products.length === 0) {
                    nominalGrid.innerHTML = '<p>Produk tidak tersedia untuk game ini.</p>';
                    return;
                }
                
                products.sort((a, b) => {
                    const extractAmount = (productName) => {
                        const match = productName.match(/\d+/);
                        return match ? parseInt(match[0], 10) : 0;
                    };
                    const amountA = extractAmount(a.product_name);
                    const amountB = extractAmount(b.product_name);
                    return amountA - amountB;
                });

                products.forEach(product => {
                    const item = document.createElement('div');
                    item.classList.add('nominal-item');
                    
                    const isAvailable = product.buyer_product_status === true && product.seller_product_status === true;
                    if (!isAvailable) {
                        item.classList.add('disabled');
                    }

                    item.setAttribute('data-price', product.price);
                    item.setAttribute('data-sku', product.buyer_sku_code);
                    let iconClass = brand === 'GENSHIN IMPACT' ? 'fa-solid fa-star' : 'fa-solid fa-gem';
                    
                    const productName = isAvailable ? product.product_name : `${product.product_name}<br><small style="color: #ffc107;">(Gangguan)</small>`;
                    item.innerHTML = `<i class="${iconClass}"></i> ${productName}`;
                    
                    if (isAvailable) {
                        item.addEventListener('click', () => {
                            document.querySelectorAll('.nominal-item').forEach(i => i.classList.remove('active'));
                            item.classList.add('active');
                            selectedPrice = parseInt(product.price);
                            selectedSku = product.buyer_sku_code;
                            updatePriceSummary();
                        });
                    }
                    nominalGrid.appendChild(item);
                });
            }
        } catch (error) {
            console.error('Error fetching products:', error);
            if(nominalGrid) nominalGrid.innerHTML = '<p>Gagal memuat produk. Pastikan server berjalan.</p>';
        }
    }

    fetchProducts();
    
    if (buyButton) {
        buyButton.addEventListener('click', async function() {
            const userIdInput = document.getElementById('user-id');
            const zoneIdInput = document.getElementById('zone-id');
            
            if (!userIdInput || !userIdInput.value) { alert('User ID wajib diisi!'); return; }
            if (!selectedSku) { alert('Silakan pilih nominal top up!'); return; }

            let customer_no = userIdInput.value + (zoneIdInput && zoneIdInput.value ? zoneIdInput.value : '');
            
            buyButton.disabled = true;
            buyButton.textContent = 'Mengarahkan...';

            try {
                const response = await fetch('http://localhost:3000/api/buat-transaksi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        customer_no: customer_no, 
                        sku: selectedSku,
                        price: selectedPrice
                    })
                });

                const result = await response.json();

                if (result.success) {
                    window.location.href = `konfirmasi.html?ref_id=${result.data.ref_id}`;
                } else {
                    alert('Gagal membuat transaksi: ' + result.message);
                    buyButton.disabled = false;
                    buyButton.textContent = 'Bayar Sekarang';
                }
                
            } catch (error) {
                alert('Gagal terhubung ke server.');
                buyButton.disabled = false;
                buyButton.textContent = 'Bayar Sekarang';
            }
        });
    }
});
