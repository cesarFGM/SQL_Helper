import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_SQL_LENGTH = 20000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }

    const { sql, feedbackLevel = "intermediate" } = req.body || {};

    if (typeof sql !== "string" || !sql.trim()) {
      return res.status(400).json({ error: "SQL query is required" });
    }

    if (sql.length > MAX_SQL_LENGTH) {
      return res.status(413).json({ error: `SQL query is too large. Max ${MAX_SQL_LENGTH} characters.` });
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify({ sql, feedbackLevel })
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const analysis = JSON.parse(raw);

    return res.status(200).json(normalizeAnalysis(analysis, sql));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Analysis failed" });
  }
}

function buildSystemPrompt() {
  return `Eres un DBA senior experto en SQL Server. Tu tarea es revisar consultas T-SQL sin ejecutarlas.

Reglas:
- No inventes metadata: si no conoces índices, tipos de datos, volumen o plan real, dilo como supuesto.
- Distingue entre funciones aplicadas sobre columnas filtradas y funciones aplicadas sobre constantes, variables o GETDATE().
- Si hay YEAR(columna), CAST(columna AS date), CONVERT(date, columna), UPPER(columna), LOWER(columna), ISNULL(columna, ...), COALESCE(columna, ...) u otra función sobre columna filtrada, explica sargabilidad.
- Explica si una CTE no arregla el problema cuando solo mueve la función a un alias calculado.
- No recomiendes SELECT * en producción. Sugiere columnas explícitas con nombres placeholder si no conoces el modelo.
- Para fechas en SQL Server, prefiere rangos semiabiertos: columna >= inicio AND columna < fin.
- Para literales de fecha, prefiere formato YYYYMMDD cuando uses literales.
- La consulta sugerida debe ser T-SQL válido y no debe ejecutar cambios peligrosos.
- Si no puedes corregir algo de forma segura, deja un comentario TODO dentro de suggestedQuery.
- Adapta profundidad al feedbackLevel: beginner, intermediate, advanced.

Devuelve SOLO JSON válido con esta forma:
{
  "score": number,
  "summary": string,
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "title": string,
      "explanation": string,
      "suggestion": string
    }
  ],
  "suggestedQuery": string,
  "dbaReport": string,
  "glossaryTerms": string[]
}`;
}

function normalizeAnalysis(analysis, originalSql) {
  const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const score = Number.isFinite(Number(analysis.score))
    ? Math.max(0, Math.min(100, Number(analysis.score)))
    : 70;

  return {
    score,
    summary: String(analysis.summary || "Análisis completado."),
    findings: findings.map(item => ({
      severity: ["critical", "warning", "suggestion"].includes(item?.severity) ? item.severity : "suggestion",
      title: String(item?.title || "Hallazgo"),
      explanation: String(item?.explanation || ""),
      suggestion: String(item?.suggestion || "")
    })),
    suggestedQuery: String(analysis.suggestedQuery || originalSql),
    dbaReport: String(analysis.dbaReport || "No se generó reporte detallado."),
    glossaryTerms: Array.isArray(analysis.glossaryTerms) ? analysis.glossaryTerms.map(String) : [],
    source: "ai"
  };
}
