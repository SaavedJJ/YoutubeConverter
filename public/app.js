const form = document.querySelector('#converter');
const urlInput = document.querySelector('#url');
const pasteButton = document.querySelector('#paste');
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector('#status');

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

pasteButton.addEventListener('click', async () => {
  try {
    urlInput.value = await navigator.clipboard.readText();
    urlInput.focus();
    showStatus('');
  } catch {
    showStatus('No se pudo acceder al portapapeles. Pega el enlace manualmente.', true);
    urlInput.focus();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const format = new FormData(form).get('format');
  submitButton.disabled = true;
  showStatus('Preparando tu archivo. Esto puede tardar unos minutos…');
  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.value, format }),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'No se pudo completar la descarga.');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = match ? decodeURIComponent(match[1]) : `descarga.${format}`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    showStatus('¡Listo! Tu descarga ha comenzado.');
  } catch (error) {
    showStatus(error.message || 'No se pudo completar la descarga.', true);
  } finally {
    submitButton.disabled = false;
  }
});
