// Funções puras de formatação e tradução de códigos. Sem acesso ao DOM,
// por isso podem ser testadas diretamente.

const CONDICOES = {
  0: ["Céu limpo", "☀️"],
  1: ["Predominantemente limpo", "🌤️"],
  2: ["Parcialmente nublado", "⛅"],
  3: ["Nublado", "☁️"],
  45: ["Nevoeiro", "🌫️"],
  48: ["Nevoeiro", "🌫️"],
  51: ["Garoa", "🌦️"],
  53: ["Garoa", "🌦️"],
  55: ["Garoa", "🌦️"],
  56: ["Garoa congelante", "🌧️"],
  57: ["Garoa congelante", "🌧️"],
  61: ["Chuva", "🌧️"],
  63: ["Chuva", "🌧️"],
  65: ["Chuva forte", "🌧️"],
  66: ["Chuva congelante", "🌧️"],
  67: ["Chuva congelante", "🌧️"],
  71: ["Neve", "❄️"],
  73: ["Neve", "❄️"],
  75: ["Neve forte", "❄️"],
  77: ["Granizo", "🌨️"],
  80: ["Pancadas de chuva", "🌦️"],
  81: ["Pancadas de chuva", "🌦️"],
  82: ["Pancadas fortes", "🌧️"],
  85: ["Pancadas de neve", "🌨️"],
  86: ["Pancadas de neve", "🌨️"],
  95: ["Trovoada", "⛈️"],
  96: ["Trovoada com granizo", "⛈️"],
  99: ["Trovoada com granizo", "⛈️"],
};

const DIRECOES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function arredondar(valor) {
  return valor === null || valor === undefined ? "—" : Math.round(valor);
}

function percentual(valor) {
  return valor === null || valor === undefined ? "—" : `${valor}%`;
}

function descricaoCondicao(codigo) {
  return CONDICOES[codigo] ?? ["Condição indisponível", "•"];
}

function direcaoVento(graus) {
  if (graus === null || graus === undefined) return "";
  return DIRECOES[Math.round(graus / 22.5) % 16];
}

function textoUV(indice) {
  if (indice === null || indice === undefined) return "—";
  const valor = Math.round(indice);
  let nivel = "extremo";
  if (valor < 3) nivel = "baixo";
  else if (valor < 6) nivel = "moderado";
  else if (valor < 8) nivel = "alto";
  else if (valor < 11) nivel = "muito alto";
  return `${valor} (${nivel})`;
}

// "2026-10-18T14:00" -> "14:00"
function horaDeIso(iso) {
  return iso.slice(11, 16);
}

// Timestamp em milissegundos -> "14:00"
function horaDeMs(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// "2026-10-18" -> "seg., 18/10"
function rotuloDia(dataIso) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

// Siglas de estado brasileiro, para aceitar "Santa Maria, RS".
const ESTADOS_BR = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

// Minúsculas e sem acento, para comparar "São Paulo" com "sao paulo".
function normalizarTexto(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// "Santa Maria, RS" -> { cidade: "Santa Maria", filtros: ["RS"] }
// Aceita vírgula ou traço com espaços como separador.
function separarBusca(termo) {
  const [cidade, ...filtros] = termo.split(/,|\s[-–]\s/).map((parte) => parte.trim());
  return { cidade, filtros: filtros.filter(Boolean) };
}

// Quantos filtros (estado ou país) batem com a cidade. Aceita sigla de estado.
function pontuarCidade(cidade, filtros) {
  const alvos = [cidade.admin1, cidade.country].filter(Boolean).map(normalizarTexto);

  return filtros.reduce((pontos, filtro) => {
    const termos = [normalizarTexto(filtro)];
    const estado = ESTADOS_BR[filtro.toUpperCase()];
    if (estado) termos.push(normalizarTexto(estado));

    const bate = termos.some((termo) => alvos.some((alvo) => alvo.includes(termo)));
    return pontos + (bate ? 1 : 0);
  }, 0);
}

// Coloca primeiro as cidades que batem com os filtros. Mantém a ordem original no empate.
function ordenarPorFiltros(cidades, filtros) {
  if (filtros.length === 0) return cidades;

  return cidades
    .map((cidade, posicao) => ({ cidade, posicao, pontos: pontuarCidade(cidade, filtros) }))
    .sort((a, b) => b.pontos - a.pontos || a.posicao - b.posicao)
    .map((item) => item.cidade);
}

// Posição da barra de temperatura de um dia dentro da faixa da semana, em porcentagem.
function posicaoFaixa(minimo, maximo, semanaMin, semanaMax) {
  const amplitude = semanaMax - semanaMin;
  if (amplitude <= 0) return { inicio: 0, largura: 100 };

  const largura = Math.max(6, ((maximo - minimo) / amplitude) * 100);
  const inicio = Math.min(100 - largura, Math.max(0, ((minimo - semanaMin) / amplitude) * 100));
  return { inicio, largura };
}

// Frase de resumo a partir das probabilidades de chuva do próximo período.
function resumoChuva(probabilidades) {
  const validas = probabilidades.filter((p) => p !== null && p !== undefined);
  const maior = Math.max(0, ...validas);

  if (maior >= 50) return "Chuva provável nas próximas horas.";
  if (maior >= 30) return "Possibilidade de chuva nas próximas horas.";
  return "Sem chuva prevista para as próximas horas.";
}

// Intensidade da chuva em mm no intervalo atual.
function intensidadeChuva(mm) {
  if (mm === null || mm === undefined || mm < 0.2) return "nenhuma";
  if (mm < 1) return "fraca";
  if (mm < 4) return "moderada";
  return "forte";
}

// Cobertura de nuvens em porcentagem.
function nivelNuvens(percentual) {
  if (percentual === null || percentual === undefined) return "media";
  if (percentual < 30) return "pouca";
  if (percentual < 70) return "media";
  return "muita";
}

// Vento em km/h.
function nivelVento(kmh) {
  if (kmh === null || kmh === undefined) return "medio";
  if (kmh < 12) return "calmo";
  if (kmh < 30) return "medio";
  return "forte";
}

// Temperatura em °C, para o tom do fundo.
function faixaTemperatura(celsius) {
  if (celsius === null || celsius === undefined) return "ameno";
  if (celsius <= 8) return "frio";
  if (celsius >= 30) return "quente";
  return "ameno";
}

// Escolhe o cenário de fundo a partir do código WMO e de dia ou noite.
function categoriaClima(codigo, ehDia = true) {
  if ([95, 96, 99].includes(codigo)) return "tempestade";
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return "neve";
  if ((codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return "chuva";
  if (codigo === 45 || codigo === 48) return "nevoeiro";
  if (codigo === 2 || codigo === 3) return "nuvens";
  return ehDia ? "sol" : "noite";
}
