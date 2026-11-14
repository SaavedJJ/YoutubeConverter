# Convertidor de YouTube

Aplicación local para descargar vídeos de YouTube como audio MP3 o vídeo MP4.
Utilízala únicamente con contenido propio o para el que tengas permiso y respeta las condiciones de la plataforma.

## Requisitos

- Node.js 18 o posterior.
- FFmpeg instalado y disponible en el `PATH` (`ffmpeg -version`).
- Conexión a Internet. La instalación descarga yt-dlp y las conversiones acceden a YouTube.

## Uso

En una terminal dentro de esta carpeta:

```powershell
npm install
npm start
```

Abre <http://127.0.0.1:3000>, pega un enlace de vídeo, selecciona **Audio MP3** o **Vídeo MP4** y pulsa **Descargar**. Mantén la terminal abierta mientras utilizas la aplicación; detén el servidor con `Ctrl+C`.

La aplicación solo escucha en tu equipo. Los archivos temporales se eliminan después de cada descarga. El tiempo y el espacio necesario dependen del vídeo; los archivos se preparan completos antes de enviarse al navegador. No se admiten listas completas, vídeos privados sin acceso ni restricciones que requieran autenticación. Algunos vídeos pueden no estar disponibles debido a cambios o restricciones de YouTube; consulta la terminal si se produce un error. Para actualizar yt-dlp, ejecuta `npm rebuild youtube-dl-exec`.

Para ejecutar las pruebas: `npm test`.

## Acceso privado con Tailscale

Instala Tailscale e inicia sesión en este equipo y en los dispositivos desde los que quieras acceder. La aplicación sigue escuchando únicamente en `127.0.0.1`; Tailscale Serve actúa como proxy HTTPS privado dentro de tu red Tailscale.

1. Obtén el nombre DNS de este equipo con `tailscale status`. Si es necesario, activa los certificados HTTPS en la consola de Tailscale.
2. En PowerShell, configura el puerto y la dirección HTTPS exacta de este equipo, sustituyendo el ejemplo:

   ```powershell
   $env:PORT = "3001"
   $env:TAILSCALE_ORIGIN = "https://equipo.tu-red.ts.net"
   npm start
   ```

3. En otra terminal, inicia el proxy privado:

   ```powershell
   tailscale serve 3001
   ```

4. Abre la dirección HTTPS que muestra Tailscale desde un dispositivo conectado a la misma red Tailscale. El ordenador, el servidor y el comando `tailscale serve` deben permanecer encendidos. El puerto local debe estar libre.

Usa **Serve**, no Funnel: Funnel expondría el servicio públicamente. El acceso también depende de las reglas de tu red Tailscale; los dispositivos autorizados por ellas podrán utilizar el convertidor. Para mantenerlo privado, revisa esas reglas y no compartas el dispositivo con personas no autorizadas.
