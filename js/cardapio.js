/* =============================================================================
   cardapio.js — a página que o CLIENTE vê
   -----------------------------------------------------------------------------
   Responsabilidades deste arquivo:
     • aplicar as configurações visuais (nome, cores)
     • carregar os pratos
     • desenhar os cartões e os filtros
     • ligar os botões (abrir prato, QR Code, fechar janelas)
   ========================================================================== */

const Pagina = {
  cardapio: null,
  categoriaAtiva: "Todos",
  termoBusca: "",

  // ------------------------------------------------------------- iniciar --
  async iniciar() {
    this.aplicarConfig();
    this.ligarBotoes();

    try {
      const { cardapio, fonte } = await Dados.carregar();
      this.cardapio = cardapio;
      if (fonte === "rascunho") document.getElementById("avisoPrevia").classList.remove("escondido");
    } catch (erro) {
      document.getElementById("grade").innerHTML = `
        <div class="vazio">
          <h3>Não consegui carregar o cardápio</h3>
          <p>Se você abriu o arquivo com duplo clique, o navegador bloqueia a leitura
             do <code>cardapio.json</code>. Rode um servidor local — está explicado no LEIA-ME.</p>
        </div>`;
      console.error(erro);
      return;
    }

    this.desenharCategorias();
    this.desenharGrade();
  },

  aplicarConfig() {
    document.title = CONFIG.nome + " — Cardápio 3D e Realidade Aumentada";
    document.getElementById("marcaNome").textContent = CONFIG.nome;
    document.getElementById("marcaSub").textContent = CONFIG.subtitulo;
    document.getElementById("marcaIcone").textContent = CONFIG.emoji || "🍽️";
    const raiz = document.documentElement.style;
    if (CONFIG.corPrincipal) raiz.setProperty("--principal", CONFIG.corPrincipal);
    if (CONFIG.corDestaque) raiz.setProperty("--destaque", CONFIG.corDestaque);
  },

  // ------------------------------------------------------------- filtros --
  itensVisiveis() {
    const termo = this.termoBusca.trim().toLowerCase();
    return (this.cardapio.itens || [])
      .filter(i => i.ativo !== false)
      .filter(i => this.categoriaAtiva === "Todos" || i.categoria === this.categoriaAtiva)
      .filter(i => !termo ||
        (i.nome + " " + (i.descricao || "") + " " + (i.categoria || "")).toLowerCase().includes(termo));
  },

  desenharCategorias() {
    const usadas = [...new Set((this.cardapio.itens || [])
      .filter(i => i.ativo !== false).map(i => i.categoria).filter(Boolean))];
    const lista = ["Todos", ...usadas];
    const caixa = document.getElementById("categorias");
    caixa.innerHTML = "";

    lista.forEach(cat => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = cat;
      b.setAttribute("aria-pressed", cat === this.categoriaAtiva);
      b.onclick = () => {
        this.categoriaAtiva = cat;
        caixa.querySelectorAll(".chip").forEach(c =>
          c.setAttribute("aria-pressed", c.textContent === cat));
        this.desenharGrade();
      };
      caixa.appendChild(b);
    });
  },

  // -------------------------------------------------------------- cartões --
  desenharGrade() {
    const grade = document.getElementById("grade");
    const itens = this.itensVisiveis();
    grade.innerHTML = "";

    if (!itens.length) {
      grade.innerHTML = `<div class="vazio"><h3>Nada por aqui</h3>
        <p>Tente outra busca ou outra categoria.</p></div>`;
      return;
    }

    itens.forEach(item => {
      const medida = Formato.medida(item.largura_cm);
      const cartao = document.createElement("button");
      cartao.className = "cartao";
      cartao.innerHTML = `
        <div class="cartao__foto"><img src="${item.foto}" alt="${this.escapar(item.nome)}" loading="lazy"></div>
        <div class="cartao__corpo">
          <div class="cartao__nome">${this.escapar(item.nome)}</div>
          <p class="cartao__desc">${this.escapar(item.descricao || "")}</p>
          <div class="cartao__rodape">
            <span class="cartao__preco">${Formato.preco(item.preco)}</span>
            <span class="selo">3D · ${medida}</span>
            ${item.destaque ? '<span class="selo selo--destaque">Destaque</span>' : ""}
          </div>
        </div>`;
      cartao.onclick = () => Visor.abrir(item);
      grade.appendChild(cartao);
    });
  },

  // Evita que um nome com < ou > quebre o HTML (boa prática de segurança).
  escapar(texto) {
    const d = document.createElement("div");
    d.textContent = texto;
    return d.innerHTML;
  },

  // -------------------------------------------------------------- botões --
  ligarBotoes() {
    document.getElementById("busca").addEventListener("input", (e) => {
      this.termoBusca = e.target.value;
      this.desenharGrade();
    });

    document.getElementById("btnOrientacao").onclick = () => Visor.virar();

    // fechar janelas: no X, no fundo escuro ou com a tecla Esc
    document.querySelectorAll("[data-fechar]").forEach(b => {
      b.onclick = () => this.fecharJanelas();
    });
    document.querySelectorAll(".janela").forEach(j => {
      j.addEventListener("click", (e) => { if (e.target === j) this.fecharJanelas(); });
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.fecharJanelas(); });

    const abrirQR = () => this.abrirQR();
    document.getElementById("btnQR").onclick = abrirQR;
    document.getElementById("btnQRTopo").onclick = abrirQR;

    document.getElementById("btnBaixarQR").onclick = () =>
      QR.baixarPNG(document.getElementById("qrCanvas"), "qrcode-" + Formato.apelido(CONFIG.nome) + ".png");

    document.getElementById("btnCopiarLink").onclick = async (e) => {
      try {
        await navigator.clipboard.writeText(QR.urlDoSite());
        e.target.textContent = "✅ Copiado!";
        setTimeout(() => (e.target.textContent = "🔗 Copiar link"), 1800);
      } catch (_) { alert(QR.urlDoSite()); }
    };
  },

  fecharJanelas() {
    if (!document.getElementById("janelaItem").hidden) Visor.fechar();
    document.getElementById("janelaQR").hidden = true;
    document.body.style.overflow = "";
  },

  async abrirQR() {
    const url = QR.urlDoSite();
    document.getElementById("janelaQR").hidden = false;
    document.getElementById("qrUrl").textContent = url;
    document.body.style.overflow = "hidden";
    try {
      await QR.desenhar(document.getElementById("qrCanvas"), url, 512, "M");
    } catch (e) {
      document.getElementById("qrUrl").textContent =
        "Sem internet para gerar o QR agora. Endereço: " + url;
    }
  }
};

// Começa tudo assim que a página estiver pronta.
document.addEventListener("DOMContentLoaded", () => Pagina.iniciar());
