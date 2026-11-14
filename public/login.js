const form = document.querySelector('#login');
const password = document.querySelector('#password');
const status = document.querySelector('#status');
const button = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
    window.location.assign('/');
  } catch (error) {
    status.textContent = error.message || 'No se pudo iniciar sesión.';
    status.classList.add('error');
  } finally {
    password.value = '';
    button.disabled = false;
  }
});
