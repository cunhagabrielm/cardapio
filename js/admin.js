/* =============================================================================
   admin.js — a ÁREA DO DONO: login, cadastro dos pratos e publicação
   -----------------------------------------------------------------------------
   SOBRE A SEGURANÇA (leia, é importante):
   Este site é 100% estático (só arquivos), então a conferência da senha acontece
   no navegador. Isso segura o cliente curioso, mas NÃO é uma tranca de verdade:
   quem entende de programação consegue ver o cardápio de rascunho. Como aqui só
   existem preços e fotos de pratos, o risco é baixo.
   Quando quiser uma tranca real, o caminho é ter um servidor conferindo a senha
   (Supabase Auth, Firebase Auth ou Netlify Identity) — está explicado no LEIA-ME.
   ========================================================================== */

const Admin = {
  cardapio: null,
  fotoTemp: null,     // {dataURL, largura, altura} da foto que acabou de ser enviada

  /* ======================================================== 1. INÍCIO === */
  async iniciar() {
    document.getElementById("formLogin").onsubmit = (e) => this.entrar(e);

    // Se a pessoa já entrou nesta aba do navegador, pula o login.
    if (this.lembrado()) await this.abrirPainel();
  },

  /* O sessionStorage pode estar BLOQUEADO: navegador configurado para recusar
     dados de site, aba anônima restrita, política da empresa. Se a gente
     chamasse sessionStorage direto, ele lançaria erro no meio do login e a tela
     ficaria parada sem explicação nenhuma. Por isso ele fica isolado aqui. */
  lembrado() {
    try { return sessionStorage.getItem(Dados.CHAVE_SESSAO) === "1"; }
    catch (e) { return false; }
  },

  lembrar(ligado) {
    try {
      if (ligado) sessionStorage.setItem(Dados.CHAVE_SESSAO, "1");
      else sessionStorage.removeItem(Dados.CHAVE_SESSAO);
    } catch (e) {
      console.warn("Não consegui guardar a sessão neste navegador:", e);
    }
  },

  async entrar(evento) {
    evento.preventDefault();
    const erro = document.getElementById("erroLogin");
    const senha = document.getElementById("senha").value;
    erro.textContent = "";

    try {
      // crypto.subtle só existe em "origem segura" (https:// ou localhost).
      if (!window.crypto || !window.crypto.subtle) {
        erro.textContent = "Abra esta página por https:// — fora disso o navegador " +
                           "não libera a função que confere a senha.";
        return;
      }

      const hash = await sha256(senha);
      if (hash !== CONFIG.senhaHash) {
        erro.textContent = "Senha incorreta.";
        document.getElementById("senha").select();
        return;
      }

      this.lembrar(true);
      await this.abrirPainel();
    } catch (falha) {
      // Regra de ouro: falha nunca pode ser silenciosa. Se algo quebrar, a
      // pessoa precisa LER o motivo na tela, não ficar olhando um botão morto.
      console.error(falha);
      erro.textContent = "Erro ao abrir o painel: " + (falha && falha.message ? falha.message : falha);
    }
  },

  async abrirPainel() {
    // 1) Mostra o painel PRIMEIRO. Se algum passo abaixo falhar, a pessoa pelo
    //    menos entra e vê a mensagem de erro, em vez de ficar presa no login.
    document.getElementById("telaLogin").classList.add("escondido");
    document.getElementById("telaPainel").classList.remove("escondido");

    // 2) Liga os botões antes de qualquer coisa que possa dar errado.
    this.ligarBotoes();

    // 3) Carrega o rascunho; se não existir, começa do cardápio publicado.
    try {
      const { cardapio } = await Dados.carregar({ preferirRascunho: true });
      this.cardapio = cardapio;
    } catch (e) {
      console.warn("Comecei um cardápio vazio:", e);
      this.cardapio = Dados.vazio();
    }

    // 4) Preenche a tela.
    try {
      this.desenharLista();
      this.preencherConfig();
      document.getElementById("fURL").value = QR.urlDoSite();
      document.getElementById("btnPrevia").href = "index.html?fonte=local";
    } catch (falha) {
      console.error(falha);
      document.getElementById("resumoPratos").textContent =
        "Não consegui montar a lista: " + (falha && falha.message ? falha.message : falha);
    }
  },

  /* ======================================================== 2. ABAS ===== */
  // Cada aba e a seção que ela mostra. Um mapa explícito evita erro de digitação
  // (foi justamente isso que quebrou a primeira versão: "abaQr" x "abaQR").
  SECOES: {
    pratos: "abaPratos",
    novo: "abaNovo",
    qr: "abaQR",
    publicar: "abaPublicar",
    config: "abaConfig"
  },

  trocarAba(nome) {
    document.querySelectorAll(".aba").forEach(a =>
      a.setAttribute("aria-selected", a.dataset.aba === nome));
    for (const [aba, idSecao] of Object.entries(this.SECOES)) {
      const secao = document.getElementById(idSecao);
      if (secao) secao.classList.toggle("escondido", aba !== nome);
    }
    if (nome === "qr") this.gerarQR();
  },

  /* ============================================ 3. LISTA DE PRATOS ====== */
  desenharLista() {
    const lista = document.getElementById("listaPratos");
    const itens = this.cardapio.itens || [];
    document.getElementById("resumoPratos").textContent =
      `${itens.length} prato(s) no rascunho · atualizado em ${this.cardapio.atualizado_em || "—"}`;
    document.getElementById("statusRascunho").textContent =
      itens.length + " prato(s) · rascunho local";

    if (!itens.length) {
      lista.innerHTML = `<div class="vazio"><h3>Nenhum prato ainda</h3>
        <p>Use a aba <strong>Cadastrar</strong> para criar o primeiro.</p></div>`;
      return;
    }

    lista.innerHTML = "";
    itens.forEach((item, indice) => {
      const linha = document.createElement("div");
      linha.className = "linha-item";
      linha.innerHTML = `
        <img src="${item.foto}" alt="">
        <div class="linha-item__info">
          <div class="linha-item__nome">${this.escapar(item.nome)} ${item.ativo === false ? "🚫" : ""}</div>
          <div class="linha-item__meta">
            ${this.escapar(item.categoria || "—")} · ${Formato.preco(item.preco)} ·
            ${Formato.medida(item.largura_cm)} × ${Formato.medida(item.altura_cm)} ·
            ${item.orientacao === "empe" ? "em pé" : "na mesa"}
          </div>
        </div>
        <div class="linha-item__acoes">
          <button class="btn btn--suave btn--pequeno" data-acao="subir" title="Subir">↑</button>
          <button class="btn btn--suave btn--pequeno" data-acao="editar">✏️</button>
          <button class="btn btn--perigo btn--pequeno" data-acao="excluir">🗑️</button>
        </div>`;

      linha.querySelector('[data-acao="editar"]').onclick = () => this.editar(item.id);
      linha.querySelector('[data-acao="excluir"]').onclick = () => this.excluir(item.id);
      linha.querySelector('[data-acao="subir"]').onclick = () => this.mover(indice, -1);
      lista.appendChild(linha);
    });
  },

  mover(indice, passo) {
    const destino = indice + passo;
    if (destino < 0 || destino >= this.cardapio.itens.length) return;
    const itens = this.cardapio.itens;
    [itens[indice], itens[destino]] = [itens[destino], itens[indice]];
    this.salvarRascunho();
  },

  /* ============================================ 4. FORMULÁRIO =========== */
  limparFormulario() {
    document.getElementById("formItem").reset();
    document.getElementById("itemId").value = "";
    document.getElementById("fAtivo").checked = true;
    document.getElementById("previaFoto").classList.add("escondido");
    document.getElementById("infoFoto").textContent = "";
    document.getElementById("erroForm").textContent = "";
    document.getElementById("tituloForm").textContent = "Cadastrar prato";
    this.fotoTemp = null;
    this.atualizarCategorias();
  },

  atualizarCategorias() {
    const usadas = [...new Set((this.cardapio.itens || []).map(i => i.categoria).filter(Boolean)),
                    ...(this.cardapio.categorias || [])];
    document.getElementById("listaCategorias").innerHTML =
      [...new Set(usadas)].map(c => `<option value="${this.escapar(c)}">`).join("");
  },

  editar(id) {
    const item = this.cardapio.itens.find(i => i.id === id);
    if (!item) return;
    this.trocarAba("novo");
    document.getElementById("tituloForm").textContent = "Editar prato";
    document.getElementById("itemId").value = item.id;
    document.getElementById("fNome").value = item.nome || "";
    document.getElementById("fDesc").value = item.descricao || "";
    document.getElementById("fPreco").value = item.preco ?? "";
    document.getElementById("fCategoria").value = item.categoria || "";
    document.getElementById("fLargura").value = item.largura_cm ?? "";
    document.getElementById("fAltura").value = item.altura_cm ?? "";
    document.getElementById("fOrientacao").value = item.orientacao || "mesa";
    document.getElementById("fDestaque").checked = !!item.destaque;
    document.getElementById("fAtivo").checked = item.ativo !== false;

    if (item.foto && item.foto.startsWith("data:")) {
      this.fotoTemp = { dataURL: item.foto };
      document.getElementById("fCaminho").value = "";
    } else {
      document.getElementById("fCaminho").value = item.foto || "";
      this.fotoTemp = null;
    }
    this.mostrarPrevia(item.foto);
    this.atualizarCategorias();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  excluir(id) {
    const item = this.cardapio.itens.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Excluir "${item.nome}" do rascunho?`)) return;
    this.cardapio.itens = this.cardapio.itens.filter(i => i.id !== id);
    this.salvarRascunho();
  },

  // Junta o que está no formulário num objeto de prato
  lerFormulario() {
    const nome = document.getElementById("fNome").value.trim();
    const foto = this.fotoTemp ? this.fotoTemp.dataURL
                               : document.getElementById("fCaminho").value.trim();
    const idAtual = document.getElementById("itemId").value;
    return {
      id: idAtual || this.idUnico(Formato.apelido(nome)),
      nome,
      descricao: document.getElementById("fDesc").value.trim(),
      preco: Number(document.getElementById("fPreco").value) || 0,
      categoria: document.getElementById("fCategoria").value.trim(),
      foto,
      largura_cm: Number(document.getElementById("fLargura").value) || 0,
      altura_cm: Number(document.getElementById("fAltura").value) || 0,
      orientacao: document.getElementById("fOrientacao").value,
      destaque: document.getElementById("fDestaque").checked,
      ativo: document.getElementById("fAtivo").checked
    };
  },

  idUnico(base) {
    let id = base, n = 2;
    const existe = (x) => (this.cardapio.itens || []).some(i => i.id === x);
    while (existe(id)) id = base + "-" + n++;
    return id;
  },

  salvarItem(evento) {
    evento.preventDefault();
    const erro = document.getElementById("erroForm");
    const item = this.lerFormulario();

    if (!item.foto) { erro.textContent = "Escolha uma foto ou informe o caminho dela."; return; }
    if (!item.largura_cm || !item.altura_cm) { erro.textContent = "Informe largura e altura em centímetros."; return; }
    erro.textContent = "";

    const indice = (this.cardapio.itens || []).findIndex(i => i.id === item.id);
    if (indice >= 0) {
      // preserva modelos já publicados, se as medidas não mudaram
      const antigo = this.cardapio.itens[indice];
      const mesmasMedidas = antigo.largura_cm === item.largura_cm &&
                            antigo.altura_cm === item.altura_cm &&
                            antigo.orientacao === item.orientacao &&
                            antigo.foto === item.foto;
      if (mesmasMedidas) {
        item.modelo_glb = antigo.modelo_glb;
        item.modelo_usdz = antigo.modelo_usdz;
      }
      this.cardapio.itens[indice] = item;
    } else {
      this.cardapio.itens = this.cardapio.itens || [];
      this.cardapio.itens.push(item);
    }

    if (item.categoria && !(this.cardapio.categorias || []).includes(item.categoria)) {
      this.cardapio.categorias = [...(this.cardapio.categorias || []), item.categoria];
    }

    this.salvarRascunho();
    this.limparFormulario();
    this.trocarAba("pratos");
  },

  salvarRascunho() {
    Dados.gravarRascunho(this.cardapio);
    this.desenharLista();
  },

  /* ============================================ 5. FOTO ================= */
  /* Reduz e converte a foto ANTES de guardar. Duas regras:
       • se a imagem tem fundo transparente -> vira PNG (preserva o recorte)
       • se não tem                          -> vira JPEG (arquivo bem menor)
     Isso não é capricho: o formato 3D glTF só aceita PNG e JPEG como textura. */
  async processarFoto(arquivo) {
    const bitmap = await createImageBitmap(arquivo);
    const temAlfa = this.detectarTransparencia(bitmap);
    const maximo = temAlfa ? 900 : 1200;
    const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const tela = document.createElement("canvas");
    tela.width = w; tela.height = h;
    const ctx = tela.getContext("2d");
    if (!temAlfa) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bitmap, 0, 0, w, h);

    const dataURL = temAlfa ? tela.toDataURL("image/png")
                            : tela.toDataURL("image/jpeg", 0.85);
    return { dataURL, largura: w, altura: h, temAlfa, kb: Math.round(dataURL.length * 0.75 / 1024) };
  },

  detectarTransparencia(bitmap) {
    const t = document.createElement("canvas");
    const lado = 160;                       // basta uma amostra pequena
    t.width = lado; t.height = lado;
    const c = t.getContext("2d");
    c.drawImage(bitmap, 0, 0, lado, lado);
    const px = c.getImageData(0, 0, lado, lado).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return true;
    return false;
  },

  mostrarPrevia(src) {
    const img = document.getElementById("previaFoto");
    if (!src) { img.classList.add("escondido"); return; }
    img.src = src;
    img.classList.remove("escondido");
  },

  // Calcula a altura mantendo a proporção da foto (evita imagem esticada)
  async calcularProporcao() {
    const src = this.fotoTemp ? this.fotoTemp.dataURL : document.getElementById("fCaminho").value.trim();
    const largura = Number(document.getElementById("fLargura").value);
    if (!src || !largura) {
      document.getElementById("erroForm").textContent = "Informe a foto e a largura primeiro.";
      return;
    }
    const img = new Image();
    img.onload = () => {
      document.getElementById("fAltura").value =
        (largura * img.naturalHeight / img.naturalWidth).toFixed(1);
      document.getElementById("erroForm").textContent = "";
    };
    img.onerror = () => document.getElementById("erroForm").textContent = "Não consegui abrir a foto.";
    img.src = src;
  },

  /* ============================================ 6. QR CODE ============== */
  async gerarQR() {
    const url = document.getElementById("fURL").value.trim() || QR.urlDoSite();
    try {
      await QR.desenhar(document.getElementById("qrAdminCanvas"), url, 512, "M");
    } catch (e) {
      alert("Não consegui carregar o gerador de QR (precisa de internet).");
    }
  },

  /* ============================================ 7. PUBLICAÇÃO =========== */
  // Só o JSON — rápido, mas as fotos enviadas ficam embutidas (arquivo grande).
  exportarJSON() {
    const texto = JSON.stringify(this.cardapio, null, 2);
    baixarArquivo("cardapio.json", texto, "application/json");
  },

  /* Pacote completo: cardapio.json + fotos/ + modelos/ (.glb e .usdz).
     É o botão mais importante do painel: com os modelos publicados, a
     Realidade Aumentada passa a funcionar em qualquer celular. */
  async exportarPacote() {
    const status = document.getElementById("statusPacote");
    const copia = JSON.parse(JSON.stringify(this.cardapio));
    const arquivos = [];
    const avisos = [];

    for (let i = 0; i < copia.itens.length; i++) {
      const item = copia.itens[i];
      const apelido = Formato.apelido(item.id || item.nome);
      status.textContent = `Preparando ${i + 1} de ${copia.itens.length}: ${item.nome}…`;
      await new Promise(r => setTimeout(r));      // deixa a tela respirar

      // 7.1 — gera os modelos 3D a partir da foto ORIGINAL
      try {
        const modelos = await gerarModelos(item);
        arquivos.push({ nome: `modelos/${apelido}.glb`, dados: modelos.glb });
        arquivos.push({ nome: `modelos/${apelido}.usdz`, dados: modelos.usdz });
        item.modelo_glb = `modelos/${apelido}.glb`;
        item.modelo_usdz = `modelos/${apelido}.usdz`;
      } catch (e) {
        avisos.push(`${item.nome}: não consegui gerar o 3D (${e.message}).`);
      }

      // 7.2 — se a foto estava embutida, vira arquivo de verdade na pasta fotos/
      if (item.foto && item.foto.startsWith("data:")) {
        const { bytes, mime } = this.dataURLparaBytes(item.foto);
        const ext = mime === "image/jpeg" ? "jpg" : "png";
        arquivos.push({ nome: `fotos/${apelido}.${ext}`, dados: bytes });
        item.foto = `fotos/${apelido}.${ext}`;
      }
    }

    arquivos.push({
      nome: "dados/cardapio.json",
      dados: new TextEncoder().encode(JSON.stringify(copia, null, 2))
    });

    const zip = criarZip(arquivos);      // sem alinhamento: zip comum
    baixarArquivo("cardapio-para-publicar.zip", zip, "application/zip");

    status.innerHTML = `✅ Pacote gerado com ${arquivos.length} arquivo(s) — ` +
      `${(zip.length / 1024 / 1024).toFixed(2)} MB.` +
      (avisos.length ? "<br>⚠️ " + avisos.join("<br>⚠️ ") : "");
  },

  dataURLparaBytes(dataURL) {
    const [cabecalho, base64] = dataURL.split(",");
    const mime = cabecalho.slice(5).split(";")[0];
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return { bytes, mime };
  },

  importarJSON(arquivo) {
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const dados = JSON.parse(leitor.result);
        if (!Array.isArray(dados.itens)) throw new Error("Formato inesperado");
        this.cardapio = dados;
        this.salvarRascunho();
        alert(`Importado: ${dados.itens.length} prato(s).`);
      } catch (e) {
        alert("Arquivo inválido: " + e.message);
      }
    };
    leitor.readAsText(arquivo);
  },

  /* ============================================ 8. CONFIGURAÇÕES ======== */
  preencherConfig() {
    document.getElementById("infoConfig").innerHTML = `
      Restaurante: <strong>${this.escapar(CONFIG.nome)}</strong><br>
      Endereço do QR: <strong>${this.escapar(QR.urlDoSite())}</strong><br>
      WhatsApp: <strong>${this.escapar(CONFIG.whatsapp || "não configurado")}</strong>`;
  },

  async gerarHash() {
    const senha = document.getElementById("fSenhaNova").value;
    if (senha.length < 6) { alert("Use pelo menos 6 caracteres."); return; }
    const hash = await sha256(senha);
    const saida = document.getElementById("saidaHash");
    saida.style.display = "block";
    saida.innerHTML = `Copie a linha abaixo e substitua a que está em <code>js/config.js</code>:<br><br>
      <code>senhaHash: "${hash}",</code>`;
  },

  escapar(texto) {
    const d = document.createElement("div");
    d.textContent = texto == null ? "" : texto;
    return d.innerHTML;
  },

  /* ============================================ 9. LIGAR OS BOTÕES ====== */
  ligarBotoes() {
    document.querySelectorAll(".aba").forEach(a => a.onclick = () => this.trocarAba(a.dataset.aba));

    document.getElementById("btnSair").onclick = () => {
      this.lembrar(false);
      location.reload();
    };

    document.getElementById("formItem").onsubmit = (e) => this.salvarItem(e);
    document.getElementById("btnLimparForm").onclick = () => this.limparFormulario();
    document.getElementById("btnProporcao").onclick = () => this.calcularProporcao();

    document.getElementById("fArquivo").onchange = async (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      const info = document.getElementById("infoFoto");
      info.textContent = "Processando a foto…";
      try {
        this.fotoTemp = await this.processarFoto(arquivo);
        document.getElementById("fCaminho").value = "";
        this.mostrarPrevia(this.fotoTemp.dataURL);
        info.textContent = `${this.fotoTemp.largura}×${this.fotoTemp.altura} px · ` +
          `${this.fotoTemp.kb} KB · ` +
          (this.fotoTemp.temAlfa ? "fundo transparente ✅ (ótimo para RA)"
                                 : "fundo sólido — considere recortar a foto");
        if (!document.getElementById("fAltura").value) this.calcularProporcao();
      } catch (erro) {
        info.textContent = "Não consegui ler esta imagem.";
      }
    };

    document.getElementById("fCaminho").oninput = (e) => {
      if (e.target.value) { this.fotoTemp = null; this.mostrarPrevia(e.target.value); }
    };

    document.getElementById("btnTestarRA").onclick = () => {
      const item = this.lerFormulario();
      if (!item.foto || !item.largura_cm) {
        document.getElementById("erroForm").textContent = "Preencha a foto e a largura antes de testar.";
        return;
      }
      Visor.abrir(item);
    };

    // janela de teste 3D
    document.getElementById("btnOrientacao").onclick = () => Visor.virar();
    document.querySelectorAll("[data-fechar]").forEach(b => b.onclick = () => Visor.fechar());
    document.getElementById("janelaItem").addEventListener("click", (e) => {
      if (e.target.id === "janelaItem") Visor.fechar();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("janelaItem").hidden) Visor.fechar();
    });

    // QR
    document.getElementById("btnGerarQR").onclick = () => this.gerarQR();
    document.getElementById("btnBaixarQRAdmin").onclick = () =>
      QR.baixarPNG(document.getElementById("qrAdminCanvas"), "qrcode-cardapio.png");

    // publicação
    document.getElementById("btnJSON").onclick = () => this.exportarJSON();
    document.getElementById("btnPacote").onclick = async (e) => {
      e.target.disabled = true;
      try { await this.exportarPacote(); }
      catch (erro) { document.getElementById("statusPacote").textContent = "Erro: " + erro.message; }
      finally { e.target.disabled = false; }
    };
    document.getElementById("btnImportar").onclick = () => document.getElementById("fImportar").click();
    document.getElementById("fImportar").onchange = (e) => {
      if (e.target.files[0]) this.importarJSON(e.target.files[0]);
    };
    document.getElementById("btnApagarTudo").onclick = () => {
      if (!confirm("Isso apaga o rascunho salvo neste navegador. Continuar?")) return;
      Dados.apagarRascunho();
      location.reload();
    };

    // configurações
    document.getElementById("btnGerarHash").onclick = () => this.gerarHash();
  }
};

document.addEventListener("DOMContentLoaded", () => Admin.iniciar());
