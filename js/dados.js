/* =============================================================================
   dados.js — de onde vêm e para onde vão os pratos do cardápio
   -----------------------------------------------------------------------------
   Existem DUAS FONTES de dados no projeto e é importante entender a diferença:

   1) O ARQUIVO  dados/cardapio.json
      É o cardápio PUBLICADO — o que todo cliente vê. Ele vive dentro do site,
      no GitHub. Para mudar o que o cliente vê, esse arquivo precisa ser
      atualizado (a área do dono gera ele prontinho no botão "Exportar").

   2) O NAVEGADOR DO DONO  (localStorage)
      É o RASCUNHO. Quando o dono cadastra um prato, ele é salvo só ali, na
      memória do navegador dele. Isso permite trabalhar, testar, ver a prévia,
      e só publicar quando estiver do jeito que ele quer.

   O fluxo é: cadastra (rascunho) -> confere na prévia -> exporta -> publica.
   ========================================================================== */

const Dados = {
  CHAVE: "cardapio-ra:rascunho",     // nome da "gaveta" dentro do localStorage
  CHAVE_SESSAO: "cardapio-ra:logado",

  // ---- lê o rascunho salvo no navegador (ou null se não houver) -----------
  lerRascunho() {
    try {
      const bruto = localStorage.getItem(this.CHAVE);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      console.warn("Não consegui ler o rascunho:", e);
      return null;
    }
  },

  // ---- grava o rascunho no navegador --------------------------------------
  gravarRascunho(cardapio) {
    cardapio.atualizado_em = new Date().toISOString().slice(0, 10);
    try {
      localStorage.setItem(this.CHAVE, JSON.stringify(cardapio));
      return true;
    } catch (e) {
      // Erro típico: passou do limite de ~5 MB do localStorage (fotos grandes).
      alert("Não consegui salvar: o navegador ficou sem espaço.\n" +
            "Use fotos menores ou exporte o cardápio e limpe o rascunho.");
      return false;
    }
  },

  apagarRascunho() { localStorage.removeItem(this.CHAVE); },

  // ---- lê o arquivo publicado ---------------------------------------------
  async lerArquivo() {
    const resposta = await fetch("dados/cardapio.json?t=" + Date.now()); // ?t= evita cache
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);
    return await resposta.json();
  },

  /* ---- carrega o cardápio escolhendo a fonte certa ------------------------
     Regra:
       • página do cliente  -> sempre o arquivo publicado
       • ?fonte=local na URL -> usa o rascunho (é assim que a prévia funciona)
       • área do dono        -> sempre o rascunho (e, se não existir, começa do
                                arquivo publicado)                          */
  async carregar({ preferirRascunho = false } = {}) {
    const querRascunho = preferirRascunho ||
      new URLSearchParams(location.search).get("fonte") === "local";

    if (querRascunho) {
      const rascunho = this.lerRascunho();
      if (rascunho) return { cardapio: rascunho, fonte: "rascunho" };
    }
    try {
      return { cardapio: await this.lerArquivo(), fonte: "arquivo" };
    } catch (e) {
      const rascunho = this.lerRascunho();
      if (rascunho) return { cardapio: rascunho, fonte: "rascunho" };
      throw e;
    }
  },

  // ---- cardápio vazio, usado quando ainda não existe nada -----------------
  vazio() {
    return {
      versao: 1,
      atualizado_em: new Date().toISOString().slice(0, 10),
      categorias: ["Entradas", "Pratos", "Bebidas", "Sobremesas"],
      itens: []
    };
  }
};

/* ---------------------------------------------------------------------------
   Pequenas funções de formatação usadas nas duas páginas.
   ------------------------------------------------------------------------ */
const Formato = {
  preco(valor) {
    return (CONFIG.moeda || "R$") + " " +
      Number(valor || 0).toFixed(2).replace(".", ",");
  },
  medida(cm) {
    const n = Number(cm) || 0;
    return n >= 100 ? (n / 100).toFixed(2).replace(".", ",") + " m"
                    : Math.round(n) + " cm";
  },
  // Transforma "Pizza Marguerita" em "pizza-marguerita" (bom para id/arquivo).
  apelido(texto) {
    return (texto || "item").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // tira acentos
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
  }
};

/* ---------------------------------------------------------------------------
   SHA-256 — usado só para conferir a senha da área do dono sem guardá-la.
   (É a mesma função de hash que o site usa para gerar o valor de CONFIG.senhaHash.)
   ------------------------------------------------------------------------ */
async function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Dispara o download de um arquivo criado na hora, dentro do navegador.
function baixarArquivo(nome, bytesOuTexto, tipo) {
  const blob = bytesOuTexto instanceof Uint8Array
    ? new Blob([bytesOuTexto], { type: tipo })
    : new Blob([bytesOuTexto], { type: tipo || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
