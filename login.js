const loginForm = document.getElementById('loginForm');
const messageBox = document.getElementById('message');

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  messageBox.textContent = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errorText = await response.text();
      messageBox.textContent = errorText || 'Falha ao entrar.';
      return;
    }

    window.location.href = '/';
  } catch (error) {
    messageBox.textContent = 'Erro de conexão. Tente novamente.';
    console.error(error);
  }
});

checkSession();
