// Fluxo principal: localização ao abrir, busca, exibição e cache offline.

const CHAVE_CACHE = "climaview-ultimo";
const ATRASO_BUSCA_MS = 400;

let tentarNovamente = null;
let temporizadorBusca = null;
let buscaAtual = 0;

const $ = (id) => document.getElementById(id);

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Ícone que repete a informação do texto ao lado. Leitores de tela o ignoram.
function decorativo(el) {
  el.setAttribute("aria-hidden", "true");
  return el;
}

// ---------- Cache (último resultado, só para quando não há conexão) ----------

function guardarCache(dados) {
  try {
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(dados));
  } catch {
    // Armazenamento indisponível: o app segue funcionando sem cache.
  }
}

function lerCache() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE));
  } catch {
    return null;
  }
}

function mesmoLocal(a, b) {
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

// ---------- Mensagens de status ----------

function mostrarStatus(texto, tipo = "info") {
  const el = $("status");
  el.textContent = texto;
  el.className = `status ${tipo}`;
  el.hidden = false;
}

function esconderStatus() {
  $("status").hidden = true;
}

function mostrarErro(texto, acao) {
  mostrarStatus(texto, "erro");
  const botao = criar("button", "botao", "Tentar de novo");
  botao.addEventListener("click", acao);
  $("status").append(botao);
}

// ---------- Renderização da tela principal ----------

function exibirClima({ local, previsao, salvoEm }, offline) {
  esconderStatus();

  const atual = previsao.current;
  const diario = previsao.daily;
  const [condicao, icone] = descricaoCondicao(atual.weather_code);

  const aviso = $("aviso");
  aviso.hidden = !offline;
  aviso.textContent = offline ? `Sem conexão. Dados de ${horaDeMs(salvoEm)}.` : "";

  $("cidade").textContent = [local.nome, local.estado, local.pais].filter(Boolean).join(", ");
  $("horario").textContent = `Horário local: ${horaDeIso(atual.time)} (${previsao.timezone.replaceAll("_", " ")})`;

  $("icone").textContent = icone;
  $("temp").textContent = `${arredondar(atual.temperature_2m)}°C`;
  $("condicao").textContent = condicao;
  $("sensacao").textContent = `Sensação de ${arredondar(atual.apparent_temperature)}°C`;
  $("minmax").textContent = `Máxima ${arredondar(diario.temperature_2m_max[0])}°C · Mínima ${arredondar(diario.temperature_2m_min[0])}°C`;

  renderizarDetalhes(atual, diario);
  renderizarHoras(previsao.hourly, atual.time);
  renderizarDias(diario);

  $("clima").hidden = false;
}

function renderizarDetalhes(atual, diario) {
  const itens = [
    ["Chance de chuva", percentual(diario.precipitation_probability_max[0])],
    ["Vento", `${arredondar(atual.wind_speed_10m)} km/h ${direcaoVento(atual.wind_direction_10m)}`.trim()],
    ["Umidade", percentual(atual.relative_humidity_2m)],
    ["Índice UV (máx.)", textoUV(diario.uv_index_max[0])],
  ];

  $("detalhes").replaceChildren(
    ...itens.map(([rotulo, valor]) => {
      const li = criar("li", "detalhe");
      li.append(criar("span", "detalhe-rotulo", rotulo), criar("span", "detalhe-valor", valor));
      return li;
    })
  );
}

function renderizarHoras(horario, horaAtual) {
  // Começa na hora atual (mesma hora do bloco "agora").
  const chaveHora = horaAtual.slice(0, 13);
  let inicio = horario.time.findIndex((t) => t.slice(0, 13) >= chaveHora);
  if (inicio < 0) inicio = 0;

  const itens = [];
  for (let i = inicio; i < Math.min(inicio + 24, horario.time.length); i++) {
    const [condicao, icone] = descricaoCondicao(horario.weather_code[i]);
    const li = criar("li", "hora");
    li.append(
      criar("span", "hora-rotulo", i === inicio ? "Agora" : `${horaDeIso(horario.time[i])}`),
      decorativo(criar("span", "hora-icone", icone)),
      criar("span", "sr-only", condicao),
      criar("span", "hora-temp", `${arredondar(horario.temperature_2m[i])}°`),
      criar("span", "hora-chuva", `💧 ${percentual(horario.precipitation_probability[i])}`)
    );
    itens.push(li);
  }

  $("horas").replaceChildren(...itens);
}

function renderizarDias(diario) {
  const itens = diario.time.map((data, i) => {
    const [condicao, icone] = descricaoCondicao(diario.weather_code[i]);
    const li = criar("li", "dia");
    li.append(
      criar("span", "dia-rotulo", i === 0 ? "Hoje" : rotuloDia(data)),
      decorativo(criar("span", "dia-icone", icone)),
      criar("span", "dia-condicao", condicao),
      criar("span", "dia-temp", `${arredondar(diario.temperature_2m_max[i])}° / ${arredondar(diario.temperature_2m_min[i])}°`),
      criar("span", "dia-chuva", `💧 ${percentual(diario.precipitation_probability_max[i])}`)
    );
    return li;
  });

  $("dias").replaceChildren(...itens);
}

// ---------- Carregamento de dados ----------

async function carregarLocal(local) {
  tentarNovamente = () => carregarLocal(local);
  mostrarStatus("Carregando previsão...");

  try {
    const previsao = await buscarPrevisao(local.latitude, local.longitude);
    const dados = { local, previsao, salvoEm: Date.now() };
    guardarCache(dados);
    exibirClima(dados, false);
  } catch {
    // Sem conexão: mostra o último dado só se for da mesma cidade.
    const cache = lerCache();
    if (cache && mesmoLocal(cache.local, local)) {
      exibirClima(cache, true);
    } else {
      $("clima").hidden = true;
      mostrarErro("Não foi possível carregar a previsão. Verifique sua conexão.", tentarNovamente);
    }
  }
}

async function carregarPorCoordenadas(latitude, longitude) {
  mostrarStatus("Identificando sua cidade...");
  const nome = await buscarNomeLocal(latitude, longitude);

  await carregarLocal({
    nome: nome?.nome ?? "Sua localização",
    estado: nome?.estado ?? null,
    pais: nome?.pais ?? null,
    latitude,
    longitude,
  });
}

function escolherCidade(cidade) {
  $("campo-busca").value = cidade.name;
  esconderResultados();

  carregarLocal({
    nome: cidade.name,
    estado: cidade.admin1 ?? null,
    pais: cidade.country ?? null,
    latitude: cidade.latitude,
    longitude: cidade.longitude,
  });
}

// ---------- Busca ----------

function mostrarResultados(itens) {
  $("resultados").hidden = false;
  $("campo-busca").setAttribute("aria-expanded", "true");
  $("resultados").replaceChildren(...itens);
}

function esconderResultados() {
  $("resultados").hidden = true;
  $("campo-busca").setAttribute("aria-expanded", "false");
}

// Setas movem o foco entre os resultados. Esc fecha a lista e volta ao campo.
function navegarResultados(evento, atual) {
  const botoes = [...$("resultados").querySelectorAll(".item-cidade")];
  const posicao = botoes.indexOf(atual);

  if (evento.key === "ArrowDown") {
    evento.preventDefault();
    botoes[(posicao + 1) % botoes.length].focus();
  } else if (evento.key === "ArrowUp") {
    evento.preventDefault();
    botoes[(posicao - 1 + botoes.length) % botoes.length].focus();
  } else if (evento.key === "Escape") {
    evento.preventDefault();
    esconderResultados();
    $("campo-busca").focus();
  }
}

function mensagemResultado(texto) {
  mostrarResultados([criar("li", "vazio", texto)]);
}

// escolherPrimeiro: Enter abre direto o primeiro resultado, sem exigir clique.
async function pesquisar(termo, escolherPrimeiro = false) {
  const id = ++buscaAtual;
  mensagemResultado("Buscando...");

  try {
    const { cidade: nomeCidade, filtros } = separarBusca(termo);
    if (nomeCidade.length < 2) {
      mensagemResultado("Digite o nome da cidade.");
      return;
    }

    const cidades = ordenarPorFiltros(await buscarCidades(nomeCidade), filtros);
    if (id !== buscaAtual) return; // resposta antiga, o usuário já digitou outra coisa

    if (cidades.length === 0) {
      mensagemResultado("Nenhuma cidade encontrada. Revise o nome.");
      return;
    }

    if (escolherPrimeiro) {
      escolherCidade(cidades[0]);
      return;
    }

    mostrarResultados(
      cidades.map((cidade) => {
        const rotulo = [cidade.name, cidade.admin1].filter(Boolean).join(", ");
        const botao = criar("button", "item-cidade", `${rotulo} · ${cidade.country ?? ""}`);
        botao.type = "button";
        botao.addEventListener("click", () => escolherCidade(cidade));
        botao.addEventListener("keydown", (evento) => navegarResultados(evento, botao));

        const li = criar("li");
        li.append(botao);
        return li;
      })
    );
  } catch {
    if (id !== buscaAtual) return;
    mensagemResultado("Não foi possível buscar agora. Tente de novo.");
  }
}

function agendarBusca(termo) {
  clearTimeout(temporizadorBusca);

  if (termo.length < 2) {
    esconderResultados();
    return;
  }

  temporizadorBusca = setTimeout(() => pesquisar(termo), ATRASO_BUSCA_MS);
}

// ---------- Tema claro e escuro ----------

const CHAVE_TEMA = "climaview-tema";

function temaSalvo() {
  try {
    return localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

function salvarTema(tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem armazenamento: o tema vale só nesta visita.
  }
}

// Escolha salva pelo usuário; se não houver, segue a preferência do sistema.
function temaAtual() {
  const salvo = temaSalvo();
  if (salvo === "dark" || salvo === "light") return salvo;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;

  // O botão mostra o modo que será ativado ao clicar.
  const botao = $("alternar-tema");
  const proximo = tema === "dark" ? "claro" : "escuro";
  botao.textContent = `Modo ${proximo}`;
  botao.setAttribute("aria-label", `Ativar modo ${proximo}`);
}

function configurarTema() {
  aplicarTema(temaAtual());

  $("alternar-tema").addEventListener("click", () => {
    const novo = temaAtual() === "dark" ? "light" : "dark";
    salvarTema(novo);
    aplicarTema(novo);
  });
}

// ---------- Inicialização ----------

function iniciar() {
  configurarTema();

  const campo = $("campo-busca");

  campo.addEventListener("input", () => agendarBusca(campo.value.trim()));

  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      esconderResultados();
      return;
    }

    const primeiro = $("resultados").querySelector(".item-cidade");
    if (evento.key === "ArrowDown" && primeiro && !$("resultados").hidden) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  // Clique fora da busca fecha a lista de resultados.
  document.addEventListener("click", (evento) => {
    if (!$("form-busca").contains(evento.target)) esconderResultados();
  });

  $("form-busca").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const termo = campo.value.trim();
    if (termo.length < 2) return;

    clearTimeout(temporizadorBusca);
    pesquisar(termo, true);
  });

  if (!("geolocation" in navigator)) {
    mostrarStatus("Seu aparelho não informa a localização. Pesquise uma cidade acima.");
    return;
  }

  mostrarStatus("Buscando sua localização...");

  navigator.geolocation.getCurrentPosition(
    (posicao) => {
      carregarPorCoordenadas(posicao.coords.latitude, posicao.coords.longitude);
    },
    () => {
      mostrarStatus("Não foi possível acessar sua localização. Pesquise uma cidade acima.");
    },
    { timeout: 10000, maximumAge: 600000 }
  );
}

iniciar();
