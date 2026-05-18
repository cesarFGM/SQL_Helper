const sqlInput = document.getElementById('sqlInput');
const feedbackLevel = document.getElementById('feedbackLevel');
const analyzeButton = document.getElementById('analyzeButton');
const loadExampleButton = document.getElementById('loadExampleButton');
const analysisStatus = document.getElementById('analysisStatus');
const scoreValue = document.getElementById('scoreValue');
const summaryText = document.getElementById('summaryText');
const findingsList = document.getElementById('findingsList');
const findingCount = document.getElementById('findingCount');
const improvedQuery = document.getElementById('improvedQuery');
const detailedReport = document.getElementById('detailedReport');
const checklist = document.getElementById('checklist');
const copyQueryButton = document.getElementById('copyQueryButton');
const copyReportButton = document.getElementById('copyReportButton');

let currentReport = null;

const RULES = [
  {
    id: 'empty',
    severity: 'critical',
    test: sql => sql.trim().length === 0,
    title: 'Consulta vacía',
    explain: {
      beginner: 'No hay texto para analizar. Pega una consulta SQL antes de iniciar la revisión.',
      intermediate: 'El editor está vacío, así que no se puede evaluar sintaxis ni prácticas.',
      advanced: 'No se detectó entrada T-SQL; se omite el resto del análisis estático.'
    },
    suggestion: 'Pega una consulta SELECT, INSERT, UPDATE, DELETE o bloque T-SQL.'
  },
  {
    id: 'select-star',
    severity: 'warning',
    test: sql => /select\s+(top\s*\([^)]*\)\s+|top\s+\d+\s+)?\*/i.test(sql),
    title: 'Uso de SELECT *',
    explain: {
      beginner: 'Trae todas las columnas, incluso las que no necesitas. Eso puede hacer la consulta más lenta y menos clara.',
      intermediate: 'SELECT * aumenta lectura, tráfico y acopla la consulta a cambios futuros de la tabla.',
      advanced: 'SELECT * puede impedir índices cubrientes, aumentar grants de memoria y romper consumidores ante cambios de esquema.'
    },
    suggestion: 'Lista explícitamente las columnas necesarias.'
  },
  {
    id: 'delete-without-where',
    severity: 'critical',
    test: sql => /\bdelete\b/i.test(sql) && !/\bwhere\b/i.test(sql),
    title: 'DELETE sin WHERE',
    explain: {
      beginner: 'Un DELETE sin WHERE puede borrar todos los registros de una tabla.',
      intermediate: 'La sentencia DELETE no tiene filtro visible; revisa si el borrado masivo es intencional.',
      advanced: 'Un DELETE sin predicado puede generar bloqueo amplio, crecimiento de log y pérdida masiva de datos.'
    },
    suggestion: 'Agrega una condición WHERE y valida primero con SELECT.'
  },
  {
    id: 'update-without-where',
    severity: 'critical',
    test: sql => /\bupdate\b/i.test(sql) && !/\bwhere\b/i.test(sql),
    title: 'UPDATE sin WHERE',
    explain: {
      beginner: 'Un UPDATE sin WHERE puede modificar todos los registros de una tabla.',
      intermediate: 'La sentencia UPDATE no tiene filtro visible; confirma si quieres actualizar toda la tabla.',
      advanced: 'Un UPDATE masivo sin predicado puede bloquear, crecer el log y provocar escalamiento de locks.'
    },
    suggestion: 'Agrega WHERE y prueba primero el conjunto afectado.'
  },
  {
    id: 'nolock',
    severity: 'warning',
    test: sql => /\bwith\s*\(\s*nolock\s*\)|\bnolock\b/i.test(sql),
    title: 'Uso de NOLOCK',
    explain: {
      beginner: 'NOLOCK puede leer datos que todavía no están confirmados y mostrar resultados incorrectos.',
      intermediate: 'NOLOCK evita esperas, pero permite lecturas sucias, filas duplicadas o filas omitidas.',
      advanced: 'READ UNCOMMITTED puede devolver estados físicamente inconsistentes durante modificaciones concurrentes.'
    },
    suggestion: 'Evalúa READ COMMITTED SNAPSHOT o revisa índices antes de usar NOLOCK.'
  },
  {
    id: 'function-in-where',
    severity: 'warning',
    test: sql => /\bwhere\b[\s\S]*(upper|lower|year|month|day|convert|cast|isnull|coalesce)\s*\(/i.test(sql),
    title: 'Función aplicada en filtros',
    explain: {
      beginner: 'Usar funciones sobre columnas en WHERE puede impedir que SQL Server use índices de forma eficiente.',
      intermediate: 'Las funciones en predicados suelen hacer la condición no sargable y fuerzan más lectura.',
      advanced: 'Predicados no sargables reducen seeks, empeoran cardinalidad estimada y elevan I/O.'
    },
    suggestion: 'Reescribe el filtro para comparar la columna directamente o usa columnas calculadas indexadas.'
  },
  {
    id: 'leading-wildcard',
    severity: 'suggestion',
    test: sql => /like\s+N?'%/i.test(sql),
    title: 'LIKE con comodín inicial',
    explain: {
      beginner: 'Buscar con % al inicio obliga a revisar muchos valores porque el texto puede aparecer en cualquier parte.',
      intermediate: "LIKE '%texto' normalmente no aprovecha índices tradicionales para buscar desde el inicio.",
      advanced: 'Un predicado con wildcard inicial suele terminar en scan; considera full-text search si es búsqueda textual.'
    },
    suggestion: 'Usa búsquedas por prefijo cuando sea posible o evalúa full-text index.'
  },
  {
    id: 'cursor',
    severity: 'warning',
    test: sql => /\bcursor\b/i.test(sql),
    title: 'Uso de cursor',
    explain: {
      beginner: 'Los cursores procesan fila por fila y suelen ser más lentos que operaciones por conjuntos.',
      intermediate: 'Un cursor puede ser correcto, pero conviene revisar si se puede resolver con JOIN, CTE o ventanas.',
      advanced: 'RBAR suele elevar CPU, duración y bloqueos; intenta una solución set-based antes de aceptar el cursor.'
    },
    suggestion: 'Busca una alternativa set-based con JOIN, APPLY, CTE o funciones de ventana.'
  },
  {
    id: 'missing-schema',
    severity: 'suggestion',
    test: sql => /\bfrom\s+(?!\(|@|#|\w+\.)(\[?\w+\]?)/i.test(sql),
    title: 'Tabla sin esquema explícito',
    explain: {
      beginner: 'Es mejor escribir el esquema, por ejemplo dbo.Clientes, para que la consulta sea más clara.',
      intermediate: 'Omitir el esquema puede generar resolución extra y ambigüedad entre objetos.',
      advanced: 'Calificar objetos con esquema mejora claridad, evita resolución dependiente del usuario y favorece reutilización de planes.'
    },
    suggestion: 'Usa nombres como dbo.NombreTabla cuando corresponda.'
  },
  {
    id: 'order-without-top',
    severity: 'suggestion',
    test: sql => /\border\s+by\b/i.test(sql) && !/\btop\b|\boffset\b|\bfetch\b/i.test(sql),
    title: 'ORDER BY sin paginación o TOP',
    explain: {
      beginner: 'Ordenar puede costar bastante si hay muchos datos. Úsalo cuando realmente necesitas ese orden.',
      intermediate: 'ORDER BY sin TOP/OFFSET puede requerir sort grande si no hay índice compatible.',
      advanced: 'El operador Sort puede pedir memoria alta, derramar a tempdb y dominar el costo del plan.'
    },
    suggestion: 'Confirma que el orden es necesario y revisa índices que soporten el ORDER BY.'
  },
  {
    id: 'no-semicolon',
    severity: 'suggestion',
    test: sql => sql.trim().length > 0 && !/;\s*$/.test(sql.trim()),
    title: 'Falta punto y coma final',
    explain: {
      beginner: 'El punto y coma marca claramente el final de la instrucción SQL.',
      intermediate: 'SQL Server lo permite en muchos casos, pero terminar sentencias con ; evita problemas con CTEs y futuras reglas.',
      advanced: 'El terminador explícito reduce ambigüedad en lotes T-SQL, especialmente antes de WITH, MERGE y THROW.'
    },
    suggestion: 'Agrega ; al final de cada sentencia.'
  }
];

const CHECKS = [
  'Selecciona solo las columnas necesarias.',
  'Incluye WHERE en UPDATE y DELETE salvo operaciones controladas.',
  'Evita funciones sobre columnas filtradas cuando necesites usar índices.',
  'Revisa NOLOCK antes de aceptarlo como solución a bloqueos.',
  'Califica tablas con esquema, por ejemplo dbo.Tabla.',
  'Usa parámetros en consultas generadas desde aplicaciones.',
  'Verifica índices para columnas usadas en JOIN, WHERE y ORDER BY.'
];

function analyzeSql(sql, level) {
  const findings = RULES.filter(rule => rule.test(sql)).map(rule => ({
    id: rule.id,
    severity: rule.severity,
    title: rule.title,
    explanation: rule.explain[level],
    suggestion: rule.suggestion
  }));

  const penalties = { critical: 28, warning: 13, suggestion: 6 };
  const score = Math.max(0, 100 - findings.reduce((sum, item) => sum + penalties[item.severity], 0));
  const improved = buildImprovedQuery(sql, findings);
  const summary = buildSummary(score, findings, level);
  const detailed = buildDetailedReport(sql, improved, findings);

  return { score, findings, improved, summary, detailed };
}

function buildImprovedQuery(sql, findings) {
  let text = sql.trim();
  if (!text) return 'Pega una consulta para generar una versión sugerida.';

  if (findings.some(item => item.id === 'select-star')) {
    text = text.replace(/select\s+(top\s*\([^)]*\)\s+|top\s+\d+\s+)?\*/i, match => {
      const topPart = match.match(/top\s*(\([^)]*\)|\d+)/i)?.[0];
      return topPart ? `SELECT ${topPart} columna1, columna2` : 'SELECT columna1, columna2';
    });
  }

  if (findings.some(item => item.id === 'missing-schema')) {
    text = text.replace(/\bfrom\s+(?!\(|@|#|\w+\.)(\[?\w+\]?)/i, 'FROM dbo.$1');
  }

  if (findings.some(item => item.id === 'function-in-where')) {
    text = suggestSargableFilters(text);
  }

  if (findings.some(item => item.id === 'no-semicolon') && !/;\s*(--[\s\S]*)?$/.test(text.trim())) {
    text += ';';
  }

  if (findings.some(item => item.id === 'update-without-where')) {
    text += '\n-- TODO: agrega una condición WHERE antes de ejecutar este UPDATE.';
  }

  if (findings.some(item => item.id === 'delete-without-where')) {
    text += '\n-- TODO: agrega una condición WHERE antes de ejecutar este DELETE.';
  }

  return text;
}

function suggestSargableFilters(sql) {
  let text = sql;
  let changed = false;

  text = text.replace(/\b(upper|lower)\s*\(\s*([\w.\[\]]+)\s*\)\s*=\s*(N?'[^']*'|@[\w]+)/gi, (match, fn, column, value) => {
    changed = true;
    return `${column} = ${value} /* Revisa collation: reemplaza ${fn.toUpperCase()}(${column}) para permitir uso de índice. */`;
  });

  text = text.replace(/\byear\s*\(\s*([\w.\[\]]+)\s*\)\s*=\s*(\d{4})/gi, (match, column, year) => {
    changed = true;
    const nextYear = Number(year) + 1;
    return `${column} >= '${year}-01-01' AND ${column} < '${nextYear}-01-01'`;
  });

  text = text.replace(/\bconvert\s*\(\s*date\s*,\s*([\w.\[\]]+)\s*\)\s*(=|>=|>|<=|<)\s*(N?'[^']*'|@[\w]+)/gi, (match, column, operator, value) => {
    changed = true;
    return buildDateRangePredicate(column, operator, value);
  });

  text = text.replace(/\bcast\s*\(\s*([\w.\[\]]+)\s+as\s+date\s*\)\s*(=|>=|>|<=|<)\s*(N?'[^']*'|@[\w]+)/gi, (match, column, operator, value) => {
    changed = true;
    return buildDateRangePredicate(column, operator, value);
  });

  if (!changed) {
    text += '\n-- TODO: hay funciones en WHERE. Reescribe el filtro para comparar la columna directamente.';
    text += "\n-- Ejemplo: YEAR(Fecha) = 2026 -> Fecha >= '2026-01-01' AND Fecha < '2027-01-01'.";
  }

  return text;
}

function buildDateRangePredicate(column, operator, value) {
  const safeValue = toSafeSqlDateLiteral(value);

  if (operator === '=') {
    return `${column} >= ${safeValue} AND ${column} < DATEADD(day, 1, ${safeValue})`;
  }

  if (operator === '>=') {
    return `${column} >= ${safeValue}`;
  }

  if (operator === '>') {
    return `${column} >= DATEADD(day, 1, ${safeValue})`;
  }

  if (operator === '<=') {
    return `${column} < DATEADD(day, 1, ${safeValue})`;
  }

  return `${column} < ${safeValue}`;
}

function toSafeSqlDateLiteral(value) {
  const match = value.match(/^N?'(\d{4})-(\d{2})-(\d{2})'$/i);
  return match ? `'${match[1]}${match[2]}${match[3]}'` : value;
}

function buildSummary(score, findings, level) {
  if (!findings.length) {
    return level === 'advanced'
      ? 'No se detectaron problemas con las reglas locales. Aun así, valida plan de ejecución, estadísticas e índices reales.'
      : 'La consulta se ve bien según las reglas de esta primera versión.';
  }

  const critical = findings.filter(item => item.severity === 'critical').length;
  const warnings = findings.filter(item => item.severity === 'warning').length;
  const suggestions = findings.filter(item => item.severity === 'suggestion').length;

  if (critical) return `Hay ${critical} punto(s) crítico(s) que conviene revisar antes de usar esta consulta.`;
  if (score < 75) return `La consulta funciona como borrador, pero tiene ${warnings} advertencia(s) y ${suggestions} sugerencia(s).`;
  return `Buen punto de partida. Hay ${suggestions + warnings} mejora(s) recomendada(s).`;
}

function renderReport(report) {
  currentReport = report;
  scoreValue.textContent = report.score;
  summaryText.textContent = report.summary;
  findingCount.textContent = report.findings.length;
  improvedQuery.textContent = report.improved;
  detailedReport.textContent = report.detailed;
  analysisStatus.textContent = 'Analizado';

  findingsList.classList.toggle('empty-state', report.findings.length === 0);
  findingsList.innerHTML = report.findings.length
    ? report.findings.map(item => `
      <article class="finding ${item.severity}">
        <strong>${severityLabel(item.severity)} · ${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.explanation)}</p>
        <small>${escapeHtml(item.suggestion)}</small>
      </article>
    `).join('')
    : 'No se detectaron hallazgos con las reglas actuales.';

  checklist.innerHTML = CHECKS.map(check => {
    const done = isCheckSatisfied(check, report.findings);
    return `<li class="${done ? 'done' : ''}"><span>${done ? '✓' : '•'}</span><span>${escapeHtml(check)}</span></li>`;
  }).join('');
}

function buildDetailedReport(originalSql, improvedSql, findings) {
  if (!originalSql.trim()) return 'Ejecuta un análisis para generar el reporte detallado.';

  const problems = findings.length
    ? findings.map(item => `- ${item.title}: ${buildDetailedProblem(item)}`).join('\n')
    : '- No se detectaron problemas con las reglas actuales.';

  const notes = buildOptimizationNotes(originalSql, findings);

  return `Problemas en la consulta original:
sql
${originalSql.trim()}

${problems}

Versión corregida y optimizada:
sql
${improvedSql}

${notes}`;
}

function buildDetailedProblem(item) {
  if (item.id === 'function-in-where') {
    return 'aplicar funciones sobre columnas en el WHERE rompe la sargabilidad. SQL Server puede dejar de usar un índice sobre esa columna y terminar evaluando fila por fila.';
  }

  if (item.id === 'select-star') {
    return 'trae columnas innecesarias, acopla la consulta al esquema e impide que el optimizador aproveche índices cubrientes cuando solo necesitas pocas columnas.';
  }

  if (item.id === 'no-semicolon') {
    return 'conviene terminar la sentencia con punto y coma para evitar ambigüedades en lotes T-SQL.';
  }

  if (item.id === 'missing-schema') {
    return 'usar el esquema explícito, por ejemplo dbo.Tabla, evita ambigüedad y mejora la claridad.';
  }

  return `${item.explanation} ${item.suggestion}`;
}

function buildOptimizationNotes(originalSql, findings) {
  const dateCast = getDateCastInfo(originalSql);
  const hasDateCast = Boolean(dateCast);
  const hasHyphenDate = /N?'\d{4}-\d{2}-\d{2}'/i.test(originalSql);
  const parts = [];

  if (hasDateCast) {
    parts.push(`¿Por qué funciona sin el CAST?
SQL Server puede comparar la columna directamente contra un literal de fecha. Si la columna es DATETIME o DATETIME2, el rango conserva las horas del día completo sin convertir la columna.

Ejemplo:
${dateCast.column} >= ${dateCast.safeValue}
${dateCast.column} < DATEADD(day, 1, ${dateCast.safeValue})

Así el motor puede buscar por rango en un índice sobre ${dateCast.column} en vez de hacer un scan evaluando CAST fila por fila.`);
  }

  if (hasHyphenDate) {
    parts.push(`¿Por qué usar 'YYYYMMDD' y no 'YYYY-MM-DD'?
El formato 'YYYYMMDD' es el formato más seguro para literales de fecha en SQL Server porque no depende de SET LANGUAGE ni de SET DATEFORMAT.

Comparativa:
Formato        Seguro    Riesgo
'20251201'     Sí        Ninguno para fecha compacta YYYYMMDD
'2025-12-01'   Depende   Puede variar según configuración regional`);
  }

  if (findings.some(item => item.id === 'function-in-where')) {
    parts.push(`Comparativa final:
Versión con función en columna: no sargable, tiende a scan.
Versión con rango directo: sargable, puede usar index seek.

El resultado lógico se mantiene, pero el rendimiento puede cambiar muchísimo en tablas grandes.`);
  }

  if (!parts.length) {
    parts.push('TODO: revisa el plan de ejecución real, las estadísticas y los índices disponibles antes de llevar la consulta a producción.');
  }

  return parts.join('\n\n');
}

function getDateCastInfo(sql) {
  const castMatch = sql.match(/\bcast\s*\(\s*([\w.\[\]]+)\s+as\s+date\s*\)\s*(=|>=|>|<=|<)\s*(N?'[^']*'|@[\w]+)/i);
  if (castMatch) return { column: castMatch[1], operator: castMatch[2], safeValue: toSafeSqlDateLiteral(castMatch[3]) };

  const convertMatch = sql.match(/\bconvert\s*\(\s*date\s*,\s*([\w.\[\]]+)\s*\)\s*(=|>=|>|<=|<)\s*(N?'[^']*'|@[\w]+)/i);
  if (convertMatch) return { column: convertMatch[1], operator: convertMatch[2], safeValue: toSafeSqlDateLiteral(convertMatch[3]) };

  return null;
}

function severityLabel(severity) {
  return {
    critical: 'Crítico',
    warning: 'Advertencia',
    suggestion: 'Sugerencia'
  }[severity];
}

function isCheckSatisfied(check, findings) {
  const text = check.toLowerCase();
  if (text.includes('columnas')) return !findings.some(item => item.id === 'select-star');
  if (text.includes('update') || text.includes('delete')) return !findings.some(item => item.id.includes('without-where'));
  if (text.includes('funciones')) return !findings.some(item => item.id === 'function-in-where');
  if (text.includes('nolock')) return !findings.some(item => item.id === 'nolock');
  if (text.includes('esquema')) return !findings.some(item => item.id === 'missing-schema');
  return true;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function buildTextReport() {
  if (!currentReport) return 'No hay análisis todavía.';
  return `SQL Helper\nPuntuación: ${currentReport.score}/100\nResumen: ${currentReport.summary}\n\n${currentReport.detailed}`;
}

async function copyText(text, button) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.left = '-9999px';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }

    const original = button.textContent;
    button.textContent = 'Copiado';
    setTimeout(() => {
      button.textContent = original;
    }, 1300);
  } catch (error) {
    button.textContent = 'No copiado';
    setTimeout(() => {
      button.textContent = 'Copiar';
    }, 1300);
  }
}

analyzeButton.addEventListener('click', () => {
  const report = analyzeSql(sqlInput.value, feedbackLevel.value);
  renderReport(report);
});

loadExampleButton.addEventListener('click', () => {
  sqlInput.value = `SELECT *
FROM Clientes
WHERE UPPER(Nombre) = 'ANA'
ORDER BY FechaAlta`;
  analysisStatus.textContent = 'Ejemplo cargado';
});

copyQueryButton.addEventListener('click', () => copyText(improvedQuery.textContent, copyQueryButton));
copyReportButton.addEventListener('click', () => copyText(buildTextReport(), copyReportButton));

renderReport(analyzeSql('', feedbackLevel.value));
analysisStatus.textContent = 'Listo';
scoreValue.textContent = '--';
summaryText.textContent = 'Ejecuta un análisis para ver el diagnóstico.';
findingsList.textContent = 'Todavía no hay hallazgos.';
findingCount.textContent = '0';
improvedQuery.textContent = 'Sin sugerencia todavía.';
detailedReport.textContent = 'Sin reporte todavía.';
checklist.innerHTML = CHECKS.map(check => `<li><span>•</span><span>${escapeHtml(check)}</span></li>`).join('');
currentReport = null;




