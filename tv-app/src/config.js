// URL do seu backend de ativacao. Troque pelo seu dominio (use HTTPS em producao).
export const API_BASE = 'https://SEU-DOMINIO.com';

// Codigos de tecla do controle remoto (o botao Voltar muda entre fabricantes).
export const KEYS = {
  BACK_TIZEN: 10009, // Samsung Return
  BACK_WEBOS: 461, // LG Back
  BACK_PC: 8, // Backspace (teste no navegador)
  ESC: 27,
};

export const isBackKey = (code) =>
  code === KEYS.BACK_TIZEN || code === KEYS.BACK_WEBOS || code === KEYS.BACK_PC || code === KEYS.ESC;
