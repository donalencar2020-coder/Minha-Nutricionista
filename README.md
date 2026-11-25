# NutriTrack · Sua Nutri com IA

App de nutrição em um único `index.html` (Preact + htm, sem etapa de build), com login e dados no Firebase e IA pela Groq através de uma Netlify Function.

**No ar:** https://nutritra.netlify.app

## Estrutura

| Caminho | O que é |
|---|---|
| `public/index.html` | O app inteiro (telas, login, banco de dados, lembretes) |
| `public/sw.js`, `public/manifest.webmanifest`, `public/icons/` | App instalável (PWA) e funcionamento offline |
| `netlify/functions/ai.mjs` | Ponte segura da IA: confere o login, monta os prompts, chama a Groq e recalcula calorias pela tabela de referência (TACO) |
| `netlify.toml` | Publica a pasta `public` e a função, sem build |
| `firestore.rules` | Regras de segurança do Firestore (cada usuário só acessa os próprios dados) |

## Variáveis de ambiente (Netlify)

- `GROQ_API_KEY` — **obrigatória**, chave da Groq (marcar como secreta)
- `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL` — opcionais, para forçar modelos
- `AI_USER_LIMIT_PER_HOUR` — opcional, limite de pedidos de IA por usuário/hora (padrão 60)

## Coleções do Firestore

`users`, `meals`, `mealPhotos`, `dietPlans`, `waterLogs`, `weightLogs`, `recipes`, `reports`, `aiState`, `shoppingLists`, `pantry`.

Ao mudar `firestore.rules`, publique as regras no Console do Firebase (Firestore → banco `ai-studio-…` → Regras).

## Aviso

Os valores nutricionais são estimativas (IA + tabela de referência). O app não substitui nutricionista ou médico.
