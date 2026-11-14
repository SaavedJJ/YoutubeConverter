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
