# SQL Helper

Revisor de consultas T-SQL para SQL Server.

## Modo actual

La app tiene dos modos:

- **IA Pro**: usa `/api/analyze` con OpenAI desde un backend seguro en Vercel.
- **Fallback local**: si el backend no está disponible, usa reglas locales en el navegador.

## Archivos principales

- `index.html`: interfaz.
- `styles.css`: estilos.
- `app.js`: lógica del frontend y fallback local.
- `api/analyze.js`: backend seguro para Vercel.
- `package.json`: dependencias del proyecto.

## Configurar IA

Crea una API key en OpenAI Platform y configúrala como variable de entorno:

```text
OPENAI_API_KEY=tu_api_key
```

Opcionalmente puedes elegir modelo:

```text
OPENAI_MODEL=gpt-4.1-mini
```

## Ejecutar local con Vercel

Instala dependencias:

```bash
npm install
```

Ejecuta el servidor local:

```bash
npx vercel dev
```

Abre la URL que indique Vercel, normalmente:

```text
http://localhost:3000
```

## Desplegar

1. Sube el proyecto a GitHub.
2. Importa el repositorio en Vercel.
3. Agrega `OPENAI_API_KEY` en Project Settings > Environment Variables.
4. Despliega.

## Seguridad

La consulta no se ejecuta contra SQL Server. Solo se analiza texto. La API key vive en Vercel, no en el navegador.
