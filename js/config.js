/* =============================================================================
   config.js — O ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR PARA PERSONALIZAR
   ========================================================================== */

const CONFIG = {
  // ---- Identidade do restaurante ------------------------------------------
  nome: "Sabor & Arte",
  subtitulo: "Cardápio em 3D e Realidade Aumentada",
  emoji: "🍽️",
  moeda: "R$",
  whatsapp: "5551999999999",     // só números, com 55 + DDD. Deixe "" para esconder o botão.

  // ---- Endereço do site (usado no QR Code) --------------------------------
  // Deixe "" que o sistema usa o endereço que estiver aberto no navegador.
  // Depois de publicar no GitHub Pages, coloque aqui a URL final, por exemplo:
  // "https://gabrielmorais.github.io/cardapio/"
  urlDoSite: "https://cunhagabrielm.github.io/cardapio/",

  // ---- Senha da ÁREA DO DONO ----------------------------------------------
  // Por segurança não guardamos a senha, e sim o "hash" SHA-256 dela.
  // O valor abaixo corresponde à senha: admin123
  // Para trocar: abra a área do dono > Configurações > "Gerar hash de senha".
  senhaHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",

  // ---- Aparência -----------------------------------------------------------
  corPrincipal: "#d8471f",
  corDestaque: "#e8a020"
};
