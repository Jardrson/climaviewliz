// Chamadas às APIs públicas usadas pelo app. Nenhuma exige chave.

const URL_GEOCODIFICACAO = "https://geocoding-api.open-meteo.com/v1/search";
const URL_PREVISAO = "https://api.open-meteo.com/v1/forecast";
const URL_NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

// Lista de cidades que combinam com o termo digitado.
async function buscarCidades(termo) {
  const params = new URLSearchParams({
    name: termo,
    count: "8",
    language: "pt",
    format: "json",
  });

  const resposta = await fetch(`${URL_GEOCODIFICACAO}?${params}`);
  if (!resposta.ok) throw new Error("Falha na busca de cidades");

  const dados = await resposta.json();
  return dados.results ?? [];
}

// Clima atual, previsão horária (24h) e diária (7 dias) para um ponto.
async function buscarPrevisao(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max",
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "kmh",
  });

  const resposta = await fetch(`${URL_PREVISAO}?${params}`);
  if (!resposta.ok) throw new Error("Falha na previsão");

  return resposta.json();
}

// Converte coordenadas em nome de cidade. Se falhar, devolve null
// e a tela usa um texto genérico, sem bloquear a previsão.
async function buscarNomeLocal(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "json",
      addressdetails: "1",
      "accept-language": "pt-BR",
    });

    const resposta = await fetch(`${URL_NOMINATIM}?${params}`);
    if (!resposta.ok) return null;

    const dados = await resposta.json();
    const endereco = dados.address ?? {};

    return {
      nome: endereco.city ?? endereco.town ?? endereco.village ?? endereco.municipality ?? null,
      estado: endereco.state ?? null,
      pais: endereco.country ?? null,
    };
  } catch {
    return null;
  }
}
