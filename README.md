# Editor de Video

Editor de video que funciona en el navegador. Todo se procesa en tu equipo: los archivos no se suben a ningún servidor.

## Funciones

Interfaz de editor profesional: biblioteca de medios, visor de origen y de programa, inspector con pestañas, panel de efectos, línea de tiempo con pistas V1/A1/A2 y formas de onda, y mezclador con medidores de nivel.

- **Clips:** importa varios videos (botón o arrastrar y soltar), recórtalos, divídelos en el cursor y reordénalos arrastrando en la línea de tiempo.
- **Banco de transiciones:** importa una carpeta completa (p. ej. la de tus paquetes descomprimidos) y el editor guarda todos los WEBM en el navegador, agrupados por paquete. Siguen ahí la próxima vez que abras el editor.
- **Transiciones stinger:** importa WEBM con transparencia, elige el punto de corte y asígnalas entre clips. Se ven en la vista previa y se incluyen al exportar, con su sonido.
- **Audio:** ajusta el volumen de cada clip o siléncialo, y añade música de fondo con punto de inicio, volumen y fundido de salida.
- **Vista previa** continua de toda la secuencia.
- **Exportación a MP4** (H.264 + AAC) con [FFmpeg.wasm](https://ffmpegwasm.netlify.app/), en 480p, 720p, 1080p, vertical o cuadrado. Los clips con distinta resolución se ajustan automáticamente.

Doble clic en el nombre de una pista para cambiarlo. El fader del máster ajusta el volumen general (también al exportar).

Deshacer y rehacer con los botones ↶ ↷ de la barra superior o con `Ctrl+Z` / `Ctrl+Mayús+Z` (`Ctrl+Y`).

Atajos: `Espacio` reproducir · `S` dividir en el cursor · `B` cuchilla · `A` selección · `←/→` fotograma a fotograma (`Mayús`: 1 s) · `Supr` eliminar el clip.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # versión de producción en dist/
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/App.tsx` | Estado del proyecto, distribución de paneles, reproductor de la secuencia y atajos |
| `src/MediaPool.tsx` · `src/SourceViewer.tsx` | Biblioteca de medios y visor de origen (entrada/salida) |
| `src/EffectsLibrary.tsx` · `src/Mixer.tsx` | Panel de transiciones y mezclador con medidores |
| `src/waveform.tsx` · `src/audioEngine.ts` | Formas de onda y enrutado de audio (Web Audio) |
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
