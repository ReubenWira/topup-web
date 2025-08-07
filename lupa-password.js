document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotPasswordForm');
    const messageEl = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.style.display = 'none';
        messageEl.classList.remove('success-message', 'error-message');

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('http://localhost:3000/api/request-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            // Selalu tampilkan pesan sukses untuk alasan keamanan
            messageEl.textContent = "Jika username terdaftar, kami telah membuatkan tautan reset. Dalam simulasi ini, Anda akan diarahkan.";
            messageEl.classList.add('success-message');
            messageEl.style.display = 'block';
            
            // Jika user benar-benar ada, arahkan ke halaman reset
            if (result.success && result.token) {
                setTimeout(() => {
                    window.location.href = `reset-password.html?token=${result.token}&username=${data.username}`;
                }, 2000);
            }

        } catch (error) {
            messageEl.textContent = 'Terjadi kesalahan. Coba lagi nanti.';
            messageEl.classList.add('error-message');
            messageEl.style.display = 'block';
        }
    });
});