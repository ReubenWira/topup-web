document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('resetPasswordForm');
    const messageEl = document.getElementById('message');
    
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const username = params.get('username');

    if (!token || !username) {
        messageEl.textContent = 'Tautan reset tidak valid atau telah kedaluwarsa.';
        messageEl.classList.add('error-message');
        messageEl.style.display = 'block';
        form.style.display = 'none';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageEl.style.display = 'none';
        messageEl.classList.remove('success-message', 'error-message');

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('http://localhost:3000/api/perform-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    token: token,
                    password: data.password
                }),
            });

            const result = await response.json();

            if (result.success) {
                messageEl.textContent = 'Password berhasil direset! Anda akan diarahkan ke halaman login.';
                messageEl.classList.add('success-message');
                messageEl.style.display = 'block';
                form.style.display = 'none';

                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                messageEl.textContent = result.message;
                messageEl.classList.add('error-message');
                messageEl.style.display = 'block';
            }
        } catch (error) {
            messageEl.textContent = 'Gagal terhubung ke server.';
            messageEl.classList.add('error-message');
            messageEl.style.display = 'block';
        }
    });
});