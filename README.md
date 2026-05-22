# 🔍 LinguaLens

**Aprende idiomas mientras ves YouTube** — subtítulos duales, traducción instantánea, y explicaciones AI.

## Quick Start

1. Abre `chrome://extensions/`
2. Activa **"Modo de desarrollador"**
3. Click **"Cargar extensión sin empaquetar"** → selecciona la carpeta `lingua-lens/`
4. Abre un video de YouTube con subtítulos → click en el ícono → selecciona idiomas → listo

## API Key (gratis)

1. Ve a **console.groq.com** → regístrate (sin tarjeta de crédito)
2. Crea una API key
3. Edita `src/background/service-worker.js` → `GROQ_API_KEY: 'gsk_...'`

## Shortcuts

| Atajo | Acción |
|-------|--------|
| `Alt+S` | Toggle subtítulos |
| `Alt+R` | Repetir segmento actual |
