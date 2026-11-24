# NutriTrack 2.0: como publicar

## O que tem no pacote

| Arquivo | Para que serve |
|---|---|
| `public/index.html` | O app inteiro: telas, login, banco de dados e chamadas da IA. |
| `netlify/functions/ai.mjs` | A "ponte" da IA. Guarda a chave da Groq escondida no servidor e só atende quem está logado. |
| `netlify.toml` | Diz ao Netlify que não precisa de build, que o site fica na pasta `public` e onde está a função. |

O app continua usando o **mesmo Firebase** de antes: mesmos usuários, mesmas refeições, planos, lista e despensa. Não precisa mudar as regras do Firestore.

---

## Passo 1: criar a chave da Groq (obrigatório)

> Hoje o site **não tem nenhuma chave configurada no Netlify**. Por isso a IA nunca funcionou lá (aparecia "IA OFFLINE").

1. Entre em https://console.groq.com e faça login.
2. Vá em **API Keys** e clique em **Create API Key**.
3. Copie a chave. Ela começa com `gsk_`.

## Passo 2: cadastrar a chave no Netlify

1. Abra https://app.netlify.com e entre no projeto **nutritra**.
2. Vá em **Project configuration → Environment variables → Add a variable**.
3. Preencha **Key** com `GROQ_API_KEY` e **Value** com a chave copiada.
4. Em **Scopes**, deixe marcado **Functions** (ou "All scopes") e salve.

## Passo 3: subir os arquivos no GitHub

O site publica automaticamente a partir do repositório `donalencar2020-coder/Minha-Nutricionista`.

1. Abra o repositório no GitHub.
2. Clique em **Add file → Upload files**.
3. Arraste as pastas **`public`** e **`netlify`** e o arquivo **`netlify.toml`**, mantendo as pastas como estão.
4. Clique em **Commit changes**.

O Netlify publica sozinho em 1 ou 2 minutos. Os arquivos antigos (`src/`, `package.json` etc.) podem ficar. Eles são ignorados porque o `netlify.toml` aponta para a pasta `public`. Se quiser, apague depois para deixar o repositório limpo.

> Atenção: o "arrastar e soltar" do Netlify Drop **não** publica a função da IA. Use o GitHub (ou o `netlify deploy` pelo terminal).

## Passo 4: testar

1. Abra https://nutritra.netlify.app e entre com a sua conta.
2. Em **Analisar**, descreva uma refeição e toque em **Analisar descrição**.
3. Se aparecer o resultado, está tudo certo ✅

Se aparecer *"A IA ainda não está publicada neste site"*, o deploy ainda não terminou. Se aparecer *"GROQ_API_KEY não configurada"*, revise o passo 2 e depois clique em **Deploys → Trigger deploy** no Netlify.

---

## Opcional: trocar o modelo da IA

A função tenta vários modelos da Groq em ordem e usa o primeiro que responder. Para forçar um modelo específico, crie no Netlify:

- `GROQ_TEXT_MODEL`: modelo para texto, plano e receitas (ex.: `openai/gpt-oss-120b`)
- `GROQ_VISION_MODEL`: modelo para fotos (ex.: `meta-llama/llama-4-scout-17b-16e-instruct`)

## Dica: instalar no celular

Abra o site no celular e use **Compartilhar → Adicionar à Tela de Início** (iPhone) ou **⋮ → Instalar app** (Android). O NutriTrack fica com ícone próprio, como um aplicativo.
