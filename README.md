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
powershell -ExecutionPolicy Bypass -File .\start-private.ps1
```

Elige una contraseña de al menos 12 caracteres cuando se solicite; no se guarda en el proyecto. Tendrás que introducirla de nuevo cada vez que inicies el servidor. Abre <http://127.0.0.1:3000>, inicia sesión, pega un enlace de vídeo, selecciona **Audio MP3** o **Vídeo MP4** y pulsa **Descargar**. Mantén la terminal abierta mientras utilizas la aplicación; detén el servidor con `Ctrl+C`. Las sesiones duran 12 horas y se invalidan al reiniciar.

La aplicación solo escucha en tu equipo. Los archivos temporales se eliminan después de cada descarga. El tiempo y el espacio necesario dependen del vídeo; los archivos se preparan completos antes de enviarse al navegador. No se admiten listas completas, vídeos privados sin acceso ni restricciones que requieran autenticación. Algunos vídeos pueden no estar disponibles debido a cambios o restricciones de YouTube; consulta la terminal si se produce un error. Para actualizar yt-dlp, ejecuta `npm rebuild youtube-dl-exec`.

Para ejecutar las pruebas: `npm test`.

## Acceso privado con Tailscale

Instala Tailscale e inicia sesión en este equipo y en los dispositivos desde los que quieras acceder. La aplicación sigue escuchando únicamente en `127.0.0.1`; Tailscale Serve actúa como proxy HTTPS privado dentro de tu red Tailscale.

1. Obtén el nombre DNS de este equipo con `tailscale status`. Si es necesario, activa los certificados HTTPS en la consola de Tailscale.
2. En PowerShell, configura el puerto y la dirección HTTPS exacta de este equipo, sustituyendo el ejemplo:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-private.ps1 -Port 3001 -TailscaleOrigin "https://equipo.tu-red.ts.net"
   ```

3. En otra terminal, inicia el proxy privado:

   ```powershell
   tailscale serve 3001
   ```

4. Abre la dirección HTTPS que muestra Tailscale desde un dispositivo conectado a la misma red Tailscale. El ordenador, el servidor y el comando `tailscale serve` deben permanecer encendidos. El puerto local debe estar libre.

Usa **Serve**, no Funnel: Funnel expondría el servicio públicamente. La contraseña no incluye límites de intentos ni otras protecciones contra abusos, por lo que no se recomienda publicar el servicio. El acceso también depende de las reglas de tu red Tailscale; revisa esas reglas y no compartas el dispositivo con personas no autorizadas.

## Inicio automático en Windows

Para ejecutar el convertidor en segundo plano al iniciar sesión en Windows, ejecuta una sola vez en PowerShell, desde la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-background.ps1 -Port 3001 -TailscaleOrigin "https://equipo.tu-red.ts.net"
```

Sustituye la dirección por la de tu equipo e introduce una contraseña de al menos 12 caracteres cuando se solicite. Se crea la tarea `YoutubeConverter-Personal` para tu usuario y se inicia inmediatamente. La contraseña se guarda cifrada por Windows en `%LOCALAPPDATA%\YoutubeConverter`, fuera del proyecto; otros procesos que se ejecuten como tu usuario pueden recuperarla. La tarea funciona mientras tu usuario haya iniciado sesión; no arranca antes del inicio de sesión ni cuando el equipo está apagado o suspendido. No muevas la carpeta del proyecto sin actualizar la tarea.

La tarea inicia el servidor, no configura Tailscale. Mantén Tailscale y Serve activos. El servidor y sus errores se registran en `server.log` y `server-error.log` dentro de `%LOCALAPPDATA%\YoutubeConverter`. Para detenerlo o iniciarlo manualmente, usa el Programador de tareas de Windows y busca `YoutubeConverter-Personal`.

## Despliegue en Cloudflare

La configuración de Cloudflare ejecuta yt-dlp y FFmpeg dentro de un contenedor, a través de un Worker. **Esta versión es pública y no requiere contraseña:** cualquiera con la dirección podrá usarla y generar costes. Cloudflare Containers requiere Workers Paid; la cuota de 5 USD no garantiza un coste máximo. Los límites de gasto de Workers no cubren todos los productos. Consulta la facturación y configura alertas antes de desplegar.

Requisitos: cuenta con Workers Paid, Node.js 22.12 o posterior y Docker en ejecución. Desde la carpeta del proyecto:

```powershell
npm install
npx wrangler login
npx wrangler deploy
```

El despliegue puede tardar varios minutos en preparar el contenedor. Cloudflare proporcionará una dirección `workers.dev`. Tras desplegar, prueba una conversión real en ambos formatos: YouTube puede bloquear solicitudes procedentes de centros de datos, y las conversiones largas pueden agotar el tiempo de espera del proxy. El contenedor dispone de 1 GiB de memoria y 4 GB de disco temporal; los archivos grandes pueden fallar. La versión local con contraseña y Tailscale sigue disponible por separado.

Como alternativa a Docker local, conecta el repositorio en **Workers & Pages > Create application > GitHub**. Selecciona la rama de producción, utiliza el nombre `convertidor-youtube` y configura `npm ci` como comando de compilación y `npx wrangler deploy` como comando de despliegue. Workers Builds construye la imagen Docker en Cloudflare. No uses `wrangler versions upload` para desplegar cambios del contenedor.
