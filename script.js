document.addEventListener('DOMContentLoaded', function () {
    // Cek status login di setiap halaman
    const loggedInUser = localStorage.getItem('loggedInUser');
    const userRole = localStorage.getItem('userRole');
    const authLinks = document.getElementById('auth-links');

    if (loggedInUser && authLinks) {
        // PERBAIKAN: Tambahkan role di sini
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
                localStorage.removeItem('userRole'); // Hapus role juga saat logout
                window.location.reload();
            });
        }
    }

    // --- FUNGSI SEARCH BAR BARU ---
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    const gamePages = {
        'mobile legends': 'mobile-legends.html',
        'ml': 'mobile-legends.html',
        'mlbb': 'mobile-legends.html',
        'free fire': 'free-fire.html',
        'ff': 'free-fire.html',
        'genshin impact': 'genshin-impact.html',
        'genshin': 'genshin-impact.html',
        'valorant': 'valorant.html'
    };

    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        
        if (gamePages[query]) {
            window.location.href = gamePages[query];
        } else {
            alert('Game tidak ditemukan. Silakan coba kata kunci lain (contoh: "ml", "ff", "genshin", "valorant").');
        }
    }

    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }

    if (searchInput) {
        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                performSearch();
            }
        });
    }

    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            once: true,
            offset: 50,
        });
    }

    if (typeof Swiper !== 'undefined') {
        const swiper = new Swiper('.swiper', {
            loop: true,
            autoplay: {
                delay: 4000,
                disableOnInteraction: false,
            },
            slidesPerView: 1,
            spaceBetween: 30,
            
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
        });
    }

    if (typeof particlesJS !== 'undefined') {
        particlesJS("particles-js", {
            "particles": {
                "number": { "value": 80, "density": { "enable": true, "value_area": 800 }},
                "color": { "value": "#8A4DFF" },
                "shape": { "type": "circle" },
                "opacity": { "value": 0.5, "random": true, "anim": { "enable": true, "speed": 1, "opacity_min": 0.1, "sync": false }},
                "size": { "value": 3, "random": true },
                "line_linked": { "enable": true, "distance": 150, "color": "#8A4DFF", "opacity": 0.2, "width": 1 },
                "move": { "enable": true, "speed": 2, "direction": "none", "out_mode": "out" }
            },
            "interactivity": {
                "detect_on": "canvas",
                "events": { "onhover": { "enable": true, "mode": "grab" }, "onclick": { "enable": true, "mode": "push" }, "resize": true },
                "modes": { "grab": { "distance": 140, "line_linked": { "opacity": 0.5 }}, "push": { "particles_nb": 4 }}
            },
            "retina_detect": true
        });
    }
});