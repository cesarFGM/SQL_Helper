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
const copyQueryButton = document.getElementById('copyQueryButton');
const copyReportButton = document.getElementById('copyReportButton');
const glossaryTooltip = document.getElementById('glossaryTooltip');

let currentReport = null;

const GLOSSARY = [
  {
    id: 'sargable',
    label: 'Sargable',
    aliases: ['sargabilidad', 'sargable', 'no sargable', 'no sargables'],
    definition: 'Search ARGument ABLE. Una condición es sargable cuando SQL Server puede aprovechar un índice para buscar por rango o por igualdad. Si aplicas una función sobre la columna, normalmente deja de ser sargable.',
    example: `-- No sargable: tiende a scan
WHERE YEAR(fecha) = 2026

-- Sargable: puede hacer seek
WHERE fecha >= '20260101'
  AND fecha < '20270101'`
  },
  {
    id: 'index-seek',
    label: 'Index Seek',
    aliases: ['index seek', 'seek', 'seeks'],
    definition: 'El motor va directo al dato usando el índice, como buscar una palabra en el índice de un libro.',
    example: `-- Si hay índice sobre email, esto puede hacer seek
WHERE email = 'juan@mail.com'`
  },
  {
    id: 'index-scan',
    label: 'Index Scan',
    aliases: ['index scan', 'scan', 'scans'],
    definition: 'El motor recorre un índice completo de inicio a fin. Puede ser caro si el índice tiene muchas filas.',
    example: `-- Esto suele forzar más lectura
WHERE UPPER(email) = 'JUAN@MAIL.COM'`
  },
  {
    id: 'table-scan',
    label: 'Table Scan',
    aliases: ['table scan'],
    definition: 'SQL Server recorre toda la tabla porque no tiene un índice útil para resolver el filtro.',
    example: `-- Sin índice útil, revisa cada fila
WHERE descripcion LIKE '%laptop%'`
  },
  {
    id: 'between',
    label: 'BETWEEN',
    aliases: ['between'],
    definition: 'Filtra un rango inclusivo en ambos extremos. Con columnas de fecha que tienen hora puede dejar fuera registros del último día.',
    example: `-- Puede excluir registros del 31 después de medianoche
WHERE fecha BETWEEN '20260501' AND '20260531'

-- Más seguro con horas
WHERE fecha >= '20260501'
  AND fecha < '20260601'`
  },
  {
    id: 'covering-index',
    label: 'Covering Index',
    aliases: ['covering index', 'índice cubriente', 'indices cubrientes', 'índices cubrientes'],
    definition: 'Índice que contiene todas las columnas que necesita una consulta, evitando ir a la tabla base para completar el resultado.',
    example: `-- Si el índice contiene email y nombre:
SELECT nombre
FROM usuarios
WHERE email = 'juan@mail.com'`
  },
  {
    id: 'implicit-conversion',
    label: 'Implicit Conversion',
    aliases: ['implicit conversion', 'conversión implícita', 'conversion implicita'],
    definition: 'SQL Server convierte automáticamente un tipo de dato a otro. Puede romper el uso del índice si la conversión ocurre sobre la columna.',
    example: `-- Riesgoso por formato regional
WHERE fecha_envio = '01/05/2026'

-- Formato seguro
WHERE fecha_envio = '20260501'`
  },
  {
    id: 'null',
    label: 'NULL',
    aliases: ['null'],
    definition: 'Valor que significa dato desconocido. No es cero ni cadena vacía. Para compararlo se usa IS NULL o IS NOT NULL.',
    example: `-- Incorrecto
WHERE telefono = NULL

-- Correcto
WHERE telefono IS NULL`
  },
  {
    id: 'join',
    label: 'JOIN',
    aliases: ['join', 'inner join', 'left join'],
    definition: 'Une tablas usando una relación entre columnas.',
    example: `SELECT p.id, c.nombre
FROM pedidos p
INNER JOIN clientes c
  ON p.cliente_id = c.id`
  },
  {
    id: 'alias',
    label: 'Alias',
    aliases: ['alias'],
    definition: 'Nombre corto que das a una tabla o columna para simplificar la consulta.',
    example: `SELECT p.id, c.nombre
FROM pedidos p
INNER JOIN clientes c
  ON p.cliente_id = c.id`
  },
  {
    id: 'top',
    label: 'TOP',
    aliases: ['top'],
    definition: 'Limita la cantidad de filas devueltas. Conviene usarlo con ORDER BY para tener resultados deterministas.',
    example: `SELECT TOP 10 *
FROM pedidos
ORDER BY fecha DESC`
  },
  {
    id: 'order-by',
    label: 'ORDER BY',
    aliases: ['order by'],
    definition: 'Ordena el resultado. ASC es ascendente y DESC descendente.',
    example: `SELECT nombre, salario
FROM empleados
ORDER BY salario DESC`
  },
  {
    id: 'group-by',
    label: 'GROUP BY',
    aliases: ['group by'],
    definition: 'Agrupa filas con el mismo valor para aplicar funciones como COUNT, SUM o AVG.',
    example: `SELECT cliente_id, COUNT(*) AS total_pedidos
FROM pedidos
GROUP BY cliente_id`
  },
  {
    id: 'having',
    label: 'HAVING',
    aliases: ['having'],
    definition: 'Es el filtro aplicado a grupos agregados. Se usa después de GROUP BY.',
    example: `SELECT cliente_id, COUNT(*) AS total
FROM pedidos
GROUP BY cliente_id
HAVING COUNT(*) > 5`
  },
  {
    id: 'deadlock',
    label: 'Deadlock',
    aliases: ['deadlock'],
    definition: 'Dos procesos se bloquean mutuamente esperando recursos que el otro tiene. SQL Server cancela uno para liberar el bloqueo.',
    example: `-- Proceso A bloquea Clientes y espera Pedidos
-- Proceso B bloquea Pedidos y espera Clientes
-- SQL Server cancela uno de los dos`
  },
  {
    id: 'transaction',
    label: 'Transaction',
    aliases: ['transaction', 'transacción', 'transaccion'],
    definition: 'Agrupa varias operaciones en una unidad. Si algo falla, puedes revertir todo con ROLLBACK.',
    example: `BEGIN TRANSACTION
  UPDATE cuentas SET saldo = saldo - 100 WHERE id = 1
  UPDATE cuentas SET saldo = saldo + 100 WHERE id = 2
COMMIT
-- ROLLBACK si algo falla`
  },
  {
    id: 'nonclustered-index',
    label: 'Nonclustered Index',
    aliases: ['nonclustered index', 'nonclustered', 'índice nonclustered', 'indice nonclustered', 'índice no agrupado', 'indice no agrupado'],
    definition: 'Índice separado de la tabla base. Guarda claves ordenadas y punteros a las filas, útil para búsquedas frecuentes sin cambiar el orden físico de la tabla.',
    example: `CREATE NONCLUSTERED INDEX IX_usuarios_email
ON dbo.usuarios(email)
INCLUDE (nombre);`
  },
  {
    id: 'index',
    label: 'Índice',
    aliases: ['índice', 'indice', 'índices', 'indices'],
    definition: 'Estructura que ayuda a SQL Server a encontrar filas más rápido, parecido al índice de un libro.',
    example: `CREATE INDEX IX_pedidos_fecha
ON dbo.pedidos(fecha_envio);`
  }
];

const GLOSSARY_BY_ID = Object.fromEntries(GLOSSARY.map(item => [item.id, item]));

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
  detailedReport.innerHTML = withGlossaryTerms(report.detailed);
  analysisStatus.textContent = 'Analizado';

  findingsList.classList.toggle('empty-state', report.findings.length === 0);
  findingsList.innerHTML = report.findings.length
    ? report.findings.map(item => `
      <article class="finding ${item.severity}">
        <strong>${severityLabel(item.severity)} · ${withGlossaryTerms(item.title)}</strong>
        <p>${withGlossaryTerms(item.explanation)}</p>
        <small>${withGlossaryTerms(item.suggestion)}</small>
      </article>
    `).join('')
    : 'No se detectaron hallazgos con las reglas actuales.';
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

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function withGlossaryTerms(value) {
  const escaped = escapeHtml(value);
  const aliases = GLOSSARY
    .flatMap(item => item.aliases.map(alias => ({ alias, id: item.id })))
    .sort((a, b) => b.alias.length - a.alias.length);

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${aliases.map(item => escapeRegExp(item.alias)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return escaped.replace(pattern, match => {
    const found = aliases.find(item => item.alias.toLocaleLowerCase('es') === match.toLocaleLowerCase('es'));
    if (!found) return match;
    return `<span class="glossary-term" tabindex="0" data-term="${found.id}">${match}</span>`;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showGlossaryTooltip(target) {
  const term = GLOSSARY_BY_ID[target.dataset.term];
  if (!term) return;

  glossaryTooltip.innerHTML = `
    <strong>${escapeHtml(term.label)}</strong>
    <p>${escapeHtml(term.definition)}</p>
    <pre>${escapeHtml(term.example)}</pre>
  `;
  glossaryTooltip.hidden = false;

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = glossaryTooltip.getBoundingClientRect();
  const margin = 10;
  const left = Math.min(
    Math.max(margin, targetRect.left),
    window.innerWidth - tooltipRect.width - margin
  );
  const preferredTop = targetRect.bottom + 8;
  const top = preferredTop + tooltipRect.height + margin > window.innerHeight
    ? Math.max(margin, targetRect.top - tooltipRect.height - 8)
    : preferredTop;

  glossaryTooltip.style.left = `${left}px`;
  glossaryTooltip.style.top = `${top}px`;
}

function hideGlossaryTooltip() {
  glossaryTooltip.hidden = true;
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

sqlInput.addEventListener('input', autoGrowSqlInput);

loadExampleButton.addEventListener('click', () => {
  sqlInput.value = `SELECT *
FROM dbo.tabla
WHERE CAST(fechaenvio AS date) = '2025-12-01'`;
  autoGrowSqlInput();
  analysisStatus.textContent = 'Ejemplo cargado';
});

copyQueryButton.addEventListener('click', () => copyText(improvedQuery.textContent, copyQueryButton));
copyReportButton.addEventListener('click', () => copyText(buildTextReport(), copyReportButton));

document.addEventListener('mouseover', event => {
  const target = event.target.closest('.glossary-term');
  if (target) showGlossaryTooltip(target);
});

document.addEventListener('focusin', event => {
  const target = event.target.closest('.glossary-term');
  if (target) showGlossaryTooltip(target);
});

document.addEventListener('mouseout', event => {
  if (event.target.closest('.glossary-term')) hideGlossaryTooltip();
});

document.addEventListener('focusout', event => {
  if (event.target.closest('.glossary-term')) hideGlossaryTooltip();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideGlossaryTooltip();
});

function autoGrowSqlInput() {
  sqlInput.style.height = 'auto';
  sqlInput.style.height = `${Math.min(sqlInput.scrollHeight, 620)}px`;
  sqlInput.style.overflowY = sqlInput.scrollHeight > 620 ? 'auto' : 'hidden';
}

renderReport(analyzeSql('', feedbackLevel.value));
analysisStatus.textContent = 'Listo';
scoreValue.textContent = '--';
summaryText.textContent = 'Ejecuta un análisis para ver el diagnóstico.';
findingsList.textContent = 'Todavía no hay hallazgos.';
findingCount.textContent = '0';
improvedQuery.textContent = 'Sin sugerencia todavía.';
detailedReport.innerHTML = 'Sin reporte todavía.';
currentReport = null;
autoGrowSqlInput();




