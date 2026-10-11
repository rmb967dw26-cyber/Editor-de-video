# Editor de Video

Editor de video que funciona en el navegador. Todo se procesa en tu equipo: los archivos no se suben a ningún servidor.

## Funciones

- **Clips:** importa varios videos (botón o arrastrar y soltar), recórtalos, divídelos en el cursor y reordénalos arrastrando en la línea de tiempo.
- **Audio:** ajusta el volumen de cada clip o siléncialo, y añade música de fondo con punto de inicio, volumen y fundido de salida.
- **Vista previa** continua de toda la secuencia.
- **Exportación a MP4** (H.264 + AAC) con [FFmpeg.wasm](https://ffmpegwasm.netlify.app/), en 480p, 720p, 1080p, vertical o cuadrado. Los clips con distinta resolución se ajustan automáticamente.

Atajos: `Espacio` reproducir · `S` dividir · `←/→` fotograma a fotograma (`Mayús`: 1 s) · `Supr` eliminar el clip.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # versión de producción en dist/
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/App.tsx` | Estado del proyecto, reproductor de la secuencia, importación y atajos |
| `src/Timeline.tsx` | Línea de tiempo: regla, pistas, cursor, zoom y reordenar |
| `src/Inspector.tsx` | Panel lateral: recorte, volumen y música |
| `src/ExportDialog.tsx` | Diálogo de exportación y progreso |
| `src/exporter.ts` | Proceso de FFmpeg: normalizar cada clip, unirlos y mezclar la música |

## Limitaciones

- Codificar en el navegador es más lento que con FFmpeg nativo (aprox. 1–3× la duración del video a 720p).
- FFmpeg.wasm tiene un límite de memoria de unos 2 GB, así que es mejor evitar archivos muy grandes.
- La vista previa usa los códecs del navegador. Chrome, Edge y Safari reproducen MP4/MOV (H.264).

## Publicación

Cada push a `main` compila la app y la publica en GitHub Pages (`.github/workflows/deploy.yml`).
La primera vez hay que activarlo en **Settings → Pages → Source: GitHub Actions**.
