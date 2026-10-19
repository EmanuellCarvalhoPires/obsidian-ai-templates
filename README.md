# AI Templates

Deterministic Markdown templates for AI agents in Obsidian. Send structured JSON to a template note and get aligned Markdown tables, attachments saved in your vault's attachment folder, and notes written to the right destination path—or rendered as HTML for Telegram.

AI Templates is a companion module of the **AI Ecosystem** plugin. It does not open a network port of its own; instead, it registers its MCP tools, REST routes and the `templates` service on the AI Ecosystem Service Bus.

[Português](#português)

## Why AI Templates?

When AI agents write long Markdown notes or tables directly, they spend hundreds of output tokens on formatting, misalign columns, forget to escape `|` pipes or newlines inside cells, and struggle with binary attachments.

With **AI Templates**:
- **Deterministic Liquid engine** (`liquidjs` in pure interpreter mode: no `eval`, no `new Function`, no filesystem tags).
- **Automatic table formatting**: agents pass `{ headers, rows }` or an array of objects, and the plugin pads columns, escapes pipes (`\|`), converts line breaks to `<br>` and fills empty cells.
- **Smart image & attachment ingestion**: agents pass a local file path (from allowed folders), an existing vault filename, or Base64 data. New files are saved via Obsidian's `getAvailablePathForAttachment` and embedded as `![[file|width]]` or classic Markdown links.
- **Two render channels**: `"obsidian"` (standard Markdown) and `"telegram"` (HTML with `<pre>` monospace tables for the Telegram AI Gateway).
- **Self-healing validation**: every error tells the agent which field failed, why, and how to fix the call.

## Disclosures

- **Requires AI Ecosystem.** This plugin registers its tools and routes in the `ai-ecosystem` plugin. If AI Ecosystem is not installed, a prompt offers a one-click download from `EmanuellCarvalhoPires/obsidian-ai-ecosystem` on GitHub.
- **Local image folders.** When an agent passes a local file path for an `image` field, the plugin reads the file from disk **only** if its resolved real path (`fs.realpath`) is inside one of the folders configured under **Allowed local image folders** (by default `{tmpdir}` and `{tmpdir}/claude`).
- **No network requests or telemetry.** Aside from the optional one-click installer for AI Ecosystem when clicked by the user, AI Templates makes no network calls.
- **Desktop only.** Uses Node.js filesystem APIs for local attachment ingestion.

## Setup

1. Install and enable **AI Ecosystem** and **AI Templates**.
2. Create template notes inside your configured templates folder (default: `Templates/AI`), or open the **AI Templates manager** (ribbon icon or command) and click **Create starter template**.
3. Your AI client connected to AI Ecosystem immediately sees the template tools.

## Writing a template note

A template is a regular Markdown note inside `Templates/AI` (or subfolders) with `template_id` and `description` in its YAML frontmatter:

```markdown
---
template_id: sprint_report
description: Weekly sprint report with a task table and architecture diagram
target_path: Reports/Sprint-{{ sprint }} - {{ title | slug }}.md
collision_rule: incremental
fields:
  title:
    type: string
    required: true
    description: Report title
  sprint:
    type: number
    required: true
  diagram:
    type: image
    required: false
    description: Optional architecture diagram
  tasks:
    type: table
    required: true
    columns: [Ticket, Summary, Status]
    description: Tasks from the sprint
  notes:
    type: string
    required: false
    default: No blocking issues.
---

# Sprint {{ sprint }} — {{ title }}

Generated on {{ today }}.

{% if diagram %}
## Diagram

{{ diagram | obsidian_image: 600 }}
{% endif %}

## Tasks

{{ tasks | markdown_table }}

## Notes

{{ notes }}
```

### Supported field types

| Type | Accepted JSON input |
| --- | --- |
| `string` | String (or number/boolean converted to string). |
| `number` | Finite number (or numeric string). |
| `boolean` | `true` / `false` (or `"true"` / `"false"`). |
| `date` | ISO-8601 string, `YYYY-MM-DD`, epoch milliseconds, or `"now"` / `"today"`. |
| `table` | `{ "headers": [...], "rows": [[...]] }` or an array of row objects `[{ ... }]` (ordered by `columns` when declared). |
| `image` | Local file path (preferred), existing vault file name, Base64 / data URI, or `{ "path" \| "vault" \| "base64", "filename"? }`. |
| `list` | JSON array. |
| `object` | Plain JSON object. |

### Built-in variables, tags and filters

- **Built-in variables**: `{{ today }}` (`YYYY-MM-DD`) and `{{ now_iso }}` (ISO timestamp).
- **Tag**: `{% now "YYYY-MM-DD HH:mm" %}` formats the current date/time.
- **Filters**:
  - `markdown_table` — formats a `table` field as an aligned GFM table in Obsidian or a `<pre>` monospace table in Telegram.
  - `obsidian_image` — embeds an `image` field (`{{ foto | obsidian_image: 500 }}` or `{{ foto | obsidian_image: "600x400", "Caption" }}`).
  - `date_fmt: "DD/MM/YYYY HH:mm"` — formats a date value.
  - `slug` — lowercase ASCII slug (`"Sprint 42!"` → `"sprint-42"`).
  - `safe_filename` — strips characters forbidden in file names (`\ / : * ? " < > |`).
  - `md_escape` — escapes Markdown punctuation.
  - `wikilink` — builds `[[target]]` or `[[target|alias]]`.
  - `bullet_list` — renders an array as a Markdown `- ` list.

## MCP tools and REST routes

All REST routes are mounted under `/api/v1/ai-templates`.

| MCP tool | REST route | Description |
| --- | --- | --- |
| `list_templates` | `GET /templates` | Lists available templates (`id`, `description`) and any errors/warnings in template notes. |
| `get_template_schema` | `GET /templates/:id` | Returns field definitions, collision rule, usage notes and a ready-to-fill JSON `example`. |
| `preview_template` | `POST /render` | Renders a template without writing files (`channel`: `"obsidian"` or `"telegram"`). |
| `create_note_from_template` | `POST /notes` | Validates input, saves attachments, renders the template and writes the note in the vault. |
| `create_template` | — | Validates and creates (or updates) a template note in the templates folder. |

## Service Bus integration

When connected to AI Ecosystem, AI Templates registers the `"templates"` service so other plugins (such as **Telegram AI Gateway**) can render templates directly:

```ts
const templates = api.getService<TemplatesService>("templates");
const html = await templates.render("sprint_report", data, "telegram");
```

## Development

```bash
npm install
npm run dev        # esbuild in watch mode
npm test           # vitest suite
npm run lint       # eslint with eslint-plugin-obsidianmd
npm run typecheck  # tsc --noEmit
npm run build      # type-check + production bundle (main.js and styles.css)
```

---

# Português

Templates Markdown determinísticos para agentes de IA no Obsidian. Envie um JSON estruturado para uma nota de template e obtenha tabelas Markdown alinhadas, anexos salvos na pasta de anexos do cofre e notas criadas no caminho certo — ou renderizadas em HTML para o Telegram.

O AI Templates é um módulo complementar do plugin **AI Ecosystem**. Ele não abre porta de rede própria: registra suas tools MCP, rotas REST e o serviço `templates` no Service Bus do AI Ecosystem.

## Por que usar o AI Templates?

Quando agentes de IA escrevem notas longas ou tabelas Markdown diretamente, gastam centenas de tokens com formatação, desalinham colunas, esquecem de escapar `|` ou quebras de linha dentro de células e têm dificuldade para anexar imagens.

Com o **AI Templates**:
- **Motor Liquid determinístico** (`liquidjs` em modo interpretado puro: sem `eval`, sem `new Function`, sem acesso a arquivos pelo template).
- **Formatação automática de tabelas**: o agente envia `{ headers, rows }` ou uma lista de objetos e o plugin alinha colunas, escapa pipes (`\|`), converte quebras de linha em `<br>` e preenche células vazias.
- **Ingestão inteligente de imagens e anexos**: o agente envia o caminho absoluto de um arquivo local (de pastas permitidas), o nome de um arquivo já existente no cofre ou Base64. Novos arquivos são salvos via `getAvailablePathForAttachment` do Obsidian e inseridos como `![[arquivo|largura]]` ou link Markdown clássico.
- **Dois canais de renderização**: `"obsidian"` (Markdown padrão) e `"telegram"` (HTML com tabelas monoespaçadas em `<pre>` para o Telegram AI Gateway).
- **Validação orientativa**: cada erro informa exatamente qual campo falhou, o motivo e como corrigir a chamada.

## Avisos importantes

- **Requer o AI Ecosystem.** Este plugin registra suas tools e rotas no plugin `ai-ecosystem`. Caso o AI Ecosystem não esteja instalado, uma janela oferece a instalação em 1 clique a partir de `EmanuellCarvalhoPires/obsidian-ai-ecosystem` no GitHub.
- **Pastas locais de imagem.** Quando um agente envia um caminho de arquivo local para um campo `image`, o plugin só lê o arquivo se o caminho real resolvido (`fs.realpath`) estiver dentro de uma das pastas configuradas em **Pastas permitidas para imagens locais** (por padrão `{tmpdir}` e `{tmpdir}/claude`).
- **Sem telemetria.** Fora o instalador opcional de 1 clique acionado pelo usuário, o plugin não realiza chamadas de rede.
- **Apenas Desktop.** Usa APIs de sistema de arquivos do Node.js para ingestão de anexos locais.

## Como configurar

1. Instale e ative o **AI Ecosystem** e o **AI Templates**.
2. Crie notas de template dentro da pasta configurada (padrão: `Templates/AI`), ou abra o **Gerenciador do AI Templates** (ícone na barra lateral ou comando) e clique em **Criar template de exemplo**.
3. Seu cliente de IA conectado ao AI Ecosystem passará a enxergar as tools de template imediatamente.

## Tools MCP e rotas REST

Todas as rotas REST ficam sob `/api/v1/ai-templates`.

| Tool MCP | Rota REST | O que faz |
| --- | --- | --- |
| `list_templates` | `GET /templates` | Lista os templates disponíveis (`id`, `description`) e eventuais erros/avisos nas notas de template. |
| `get_template_schema` | `GET /templates/:id` | Retorna os campos declarados, regra de colisão, notas de uso e um `example` JSON pronto para preencher. |
| `preview_template` | `POST /render` | Renderiza um template sem salvar arquivos (`channel`: `"obsidian"` ou `"telegram"`). |
| `create_note_from_template` | `POST /notes` | Valida os dados, salva anexos, renderiza o template e grava a nota no cofre. |
| `create_template` | — | Valida e cria (ou atualiza) uma nota de template na pasta de templates. |

## Licença

MIT
