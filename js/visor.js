/* =============================================================================
   visor.js — a janela que mostra o prato em 3D e abre a Realidade Aumentada
   -----------------------------------------------------------------------------
   O QUE ACONTECE QUANDO O CLIENTE TOCA NUM PRATO:
     1. abrimos a janela
     2. chamamos gerarModelos() (js/modelo3d.js) -> vira .glb e .usdz na memória
     3. transformamos esses bytes num endereço temporário (blob:...)
     4. entregamos esse endereço para o <model-viewer>, que renderiza o 3D
     5. o botão "Ver no meu ambiente" chama a RA do próprio celular

   ATALHO IMPORTANTE: se o prato tiver os campos "modelo_glb" / "modelo_usdz"
   apontando para arquivos publicados no site, usamos ELES em vez de gerar na
   hora. Isso é melhor, porque alguns modos de RA (o Scene Viewer do Android e o
   Quick Look do iPhone) exigem um arquivo com endereço de verdade, não um
   blob temporário. A área do dono tem um botão para gerar e baixar esses
   arquivos — veja o LEIA-ME, item "Deixando a RA 100%".
   ========================================================================== */

const Visor = {
  itemAtual: null,
  orientacaoAtual: "mesa",
  urlsTemporarias: [],

  elementos() {
    return {
      janela: document.getElementById("janelaItem"),
      visor: document.getElementById("visor"),
      carregando: document.getElementById("visorCarregando"),
      regua: document.getElementById("regua"),
      nome: document.getElementById("itemNome"),
      preco: document.getElementById("itemPreco"),
      desc: document.getElementById("itemDesc"),
      dica: document.getElementById("dicaRA"),
      pedir: document.getElementById("btnPedir"),
      orientacao: document.getElementById("btnOrientacao")
    };
  },

  // ---------------------------------------------------------------- abrir --
  async abrir(item) {
    const el = this.elementos();
    this.itemAtual = item;
    this.orientacaoAtual = item.orientacao === "empe" ? "empe" : "mesa";

    el.nome.textContent = item.nome;
    el.preco.textContent = Formato.preco(item.preco);
    el.desc.textContent = item.descricao || "";
    el.janela.hidden = false;
    document.body.style.overflow = "hidden";   // trava o fundo enquanto a janela está aberta

    // Link do WhatsApp já com a mensagem escrita
    if (CONFIG.whatsapp) {
      const texto = encodeURIComponent(`Olá! Vi o cardápio 3D e quero pedir: ${item.nome}.`);
      el.pedir.href = `https://wa.me/${CONFIG.whatsapp}?text=${texto}`;
      el.pedir.classList.remove("escondido");
    } else {
      el.pedir.classList.add("escondido");
    }

    await this.montarModelo();
  },

  // ------------------------------------------------- gerar e mostrar o 3D --
  async montarModelo() {
    const el = this.elementos();
    const item = this.itemAtual;
    el.carregando.classList.remove("escondido");
    this.limparURLs();

    try {
      // Caminho A: o dono já publicou os arquivos 3D -> use-os (RA mais confiável)
      const temArquivos = item.modelo_glb && this.orientacaoAtual === (item.orientacao || "mesa");
      let dimensoes;

      /* Usamos setAttribute (e não .src = ...) de propósito: se o script do
         model-viewer ainda estiver carregando, a tag ainda é um elemento comum
         e uma propriedade JS se perderia. O atributo, não — ele fica no HTML e
         o componente lê assim que fica pronto. */
      if (temArquivos) {
        el.visor.setAttribute("src", item.modelo_glb);
        if (item.modelo_usdz) el.visor.setAttribute("ios-src", item.modelo_usdz);
        dimensoes = {
          larguraCm: item.largura_cm,
          alturaCm: item.altura_cm || item.largura_cm,
          orientacao: this.orientacaoAtual
        };
      } else {
        // Caminho B: monta o 3D na hora, a partir da foto
        const modelos = await gerarModelos({ ...item, orientacao: this.orientacaoAtual });
        const urlGLB = bytesParaURL(modelos.glb, "model/gltf-binary");
        const urlUSDZ = bytesParaURL(modelos.usdz, "model/vnd.usdz+zip");
        this.urlsTemporarias.push(urlGLB, urlUSDZ);
        el.visor.setAttribute("src", urlGLB);
        el.visor.setAttribute("ios-src", urlUSDZ);
        dimensoes = modelos;
      }

      // A "régua" que comunica o tamanho real — o coração da proposta
      const l = Formato.medida(dimensoes.larguraCm);
      const a = Formato.medida(dimensoes.alturaCm);
      const eixo = dimensoes.orientacao === "empe" ? "altura" : "profundidade";
      el.regua.innerHTML =
        `📏 Tamanho real: <strong>${l}</strong> de largura × <strong>${a}</strong> de ${eixo}`;

      this.atualizarDica();

      /* Entregar o arquivo ao visor NÃO significa que ele já apareceu na tela:
         o model-viewer ainda precisa ler o modelo e preparar o desenho. Se a
         gente escondesse o "carregando" aqui, o cliente ficaria olhando um
         quadrado vazio sem saber se travou. Então esperamos o aviso de pronto. */
      const estado = await this.esperarModelo(el.visor);
      if (estado === "sem-componente") {
        el.regua.innerHTML += "<br>⚠️ O visualizador 3D não carregou — ele vem da " +
                              "internet. Verifique a conexão e recarregue a página.";
      } else if (estado !== "pronto") {
        el.regua.innerHTML += "<br>⚠️ O modelo 3D demorou demais para abrir. " +
                              "Tente abrir o prato de novo.";
      }
    } catch (erro) {
      console.error(erro);
      el.regua.textContent = "Não consegui montar o modelo 3D deste prato.";
    } finally {
      el.carregando.classList.add("escondido");
    }
  },

  /* Espera o model-viewer avisar "load" (deu certo) ou "error" (falhou).
     O limite de tempo evita que o aviso de carregando fique preso para sempre
     numa conexão ruim. */
  esperarModelo(visor, limiteMs = 20000) {
    // Sem o script do model-viewer (sem internet, CDN bloqueado pela rede) a tag
    // é só um elemento comum: não existe aviso nenhum para esperar.
    if (!customElements.get("model-viewer")) return Promise.resolve("sem-componente");
    if (visor.loaded) return Promise.resolve("pronto");

    return new Promise((resolver) => {
      const encerrar = (estado) => {
        clearTimeout(relogio);
        visor.removeEventListener("load", aoCarregar);
        visor.removeEventListener("error", aoFalhar);
        resolver(estado);
      };
      const aoCarregar = () => encerrar("pronto");
      const aoFalhar = () => encerrar("falhou");
      const relogio = setTimeout(() => encerrar("demorou"), limiteMs);
      visor.addEventListener("load", aoCarregar);
      visor.addEventListener("error", aoFalhar);
    });
  },

  // Mensagem de ajuda conforme o aparelho do cliente
  atualizarDica() {
    const el = this.elementos();
    const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const podeRA = el.visor.canActivateAR;

    if (podeRA) {
      el.dica.innerHTML = "Toque em <strong>Ver no meu ambiente</strong>, aponte a câmera para a mesa " +
        "e mexa o celular devagar até o prato aparecer no tamanho real.";
    } else if (ehIOS) {
      el.dica.innerHTML = "No iPhone a Realidade Aumentada abre pelo <strong>Safari</strong>. " +
        "Se o botão não aparecer, abra este cardápio no Safari.";
    } else {
      el.dica.innerHTML = "Você está num aparelho sem câmera de RA — dá para girar o modelo com o dedo/mouse. " +
        "Abra pelo celular para ver o prato na sua mesa.";
    }
  },

  // Alterna entre "deitado na mesa" e "em pé"
  async virar() {
    this.orientacaoAtual = this.orientacaoAtual === "mesa" ? "empe" : "mesa";
    await this.montarModelo();
  },

  fechar() {
    const el = this.elementos();
    el.janela.hidden = true;
    el.visor.removeAttribute("src");
    document.body.style.overflow = "";
    this.limparURLs();
    this.itemAtual = null;
  },

  // Libera a memória dos endereços temporários criados com createObjectURL
  limparURLs() {
    this.urlsTemporarias.forEach(u => URL.revokeObjectURL(u));
    this.urlsTemporarias = [];
  }
};
