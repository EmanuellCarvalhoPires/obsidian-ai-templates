# Plano de implementação: itens da auditoria do módulo AI Templates

## Sumário
- Etapa 1: Schema e erro com exemplo curto (linhas 64-179)
- Etapa 2: Campos lista e objeto com exemplo (linhas 181-308)
- Etapa 3: Molde genérico nota_livre no starter pack (linhas 310-412)
- Etapa 4: Hook do AI Ecosystem, alvos *.md geram aviso (linhas 414-519)
- Etapa 5: Instalação de moldes e create_template sem sobrescrever (linhas 521-645)
- Etapa 6: target_path sem pastas ocultas e overwrite explícito (linhas 647-771)
- Etapa 7: Remoção do código morto de append e upsert (linhas 773-895)
- Etapa 8: create_note com dry_run, resposta mínima e anexos sem órfãos (linhas 897-1020)
- Etapa 9: Tools expostas e instruções curtas (linhas 1022-1121)
- Etapa 10: Aprovação dos moldes e saída compacta (linhas 1123-1223)
- Etapa 11: Verificação geral (linhas 1225-1325)

## 1. Objetivo
Entregar os 15 itens aceitos da auditoria do AI Ecosystem para o módulo AI Templates, na ordem do arquivo `C:\Users\Trabalho\AppData\Local\Temp\claude\C--Users-Trabalho-Documents-Cofre\f7346580-c5be-4117-a93c-bde037b7aa6b\scratchpad\itens-tpl.md`.
Pronto quando: cada item tem a alteração descrita na sua etapa; `npm run typecheck`, `npm test` e `npm run lint` passam no repositório do módulo; e os critérios da seção 6 são verdadeiros. Os itens que dependem só do usuário (deploy, data.json do plugin, apagar moldes de uso único) estão na seção 7, fora das etapas.

## 2. Contexto completo
- **Projeto:** plugin do Obsidian "AI Templates" 1.2.0, em TypeScript, com esbuild, vitest 5, eslint-plugin-obsidianmd 0.4.2 e liquidjs. Raiz: `C:\Users\Trabalho\Documents\obsidian-ai-templates`. O plugin preenche moldes Markdown com JSON enviado por agentes de IA. Expõe tools MCP (`src\tools\templates-module.ts`), rotas REST no mesmo arquivo e uma entrada de índice por molde (`src\tools\template-index.ts`), registradas no AI Ecosystem.
- **Repositório externo:** o hook que bloqueia escritas de notas pertence ao AI Ecosystem, em `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem` (fonte: `src\hooks\script\ai-ecosystem-hook.mjs`). A cópia instalada no cofre (`C:\Users\Trabalho\Documents\Cofre\.claude\ai-ecosystem\hooks\`) só muda com deploy, que é ação do usuário.
- **Estado atual confirmado na leitura do código:**
  - `src\templates\template-service.ts`: método `check` monta a mensagem de erro com `Call get_template_schema for the fields and an example.`; `createNote` grava os anexos (`withImages` com `save: true`) antes de `deps.notes.write`; `resolveTargetPath` chama `checkVaultPath` e depois `toMarkdownPath`.
  - `src\templates\schema.ts`: `exampleValue` devolve `["item 1","item 2"]` para `list` e `{}` para `object`; `buildSchema` monta `example` para todos os campos.
  - `src\templates\template-creator.ts`: `create` substitui a nota quando `loader.find(id)` acha um molde, senão grava em `<pasta de moldes>\<id>.md` sem checar se o arquivo existe e não é molde.
  - `src\storage\path-guard.ts`: `checkVaultPath` bloqueia só `configDir`, `..`, caminhos absolutos e caracteres proibidos; não bloqueia segmentos que começam com ponto.
  - `src\storage\note-merge.ts` (139 linhas) e `NoteCreator.planFor` / `modify` em `src\storage\note-creator.ts` implementam os modos `append` e `upsert_section`; `WriteMode` em `src\types\template-types.ts` os declara; `template-parser.ts`, `template-creator.ts` e `template-validator.ts` ainda leem e gravam `append_block`, `index_block` e `index_heading`.
  - `src\tools\templates-module.ts`: `buildTools` expõe 5 tools (`list_templates`, `get_template_schema`, `create_note_from_template`, `preview_template`, `create_template`); `buildRoutes` tem `GET /templates`, `GET /templates/:id`, `POST /render` e `POST /notes`; `MODULE_INSTRUCTIONS` tem cerca de 800 caracteres; `jsonResultOf` serializa com indentação (`JSON.stringify(clean, null, 2)`).
  - `src\tools\template-index.ts`: `buildTemplateIndexEntries` põe `aprovacao = "obrigatoria"` quando a regra é `overwrite`; `inputSchema` das entradas de molde não declara `data_file`.
  - `src\main.ts`: `installStarterTemplates(restore)` retorna cedo se `!restore && !settings.installStarterPack`; é chamado em `onLayoutReady` com `false`.
  - `src\ecosystem\hooks-integration.ts`: `targetToGlob` converte alvos de molde em globs (`{{ }}` vira `*`) e `publishRuleData` envia `templateTargets` ao serviço de hooks.
- **Motivação:** a auditoria encontrou erros que obrigam chamadas extras, notas com campos vazios sem aviso, perda de dados em sobrescrita, brecha de escrita em `.claude\`, código morto e instruções repetidas em toda sessão.
- **Fora do escopo:** publicar, fazer deploy, commit, push ou merge; alterar o cofre (data.json, moldes de uso único, cópia instalada do hook); mudar comportamento que não esteja nos 15 itens; alterar o AI Ecosystem além do hook da etapa 4.
- **Ordem:** no arquivo, os itens 1, 9 e 10 têm status `p` (priorizados). Como a demanda pede a ordem do arquivo, a execução segue a numeração 1 a 15.

## 3. Regras globais de implementação
1. Código e comentários em inglês, como já é no repositório. Textos para o usuário ficam em `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\i18n.ts` quando forem de interface; mensagens de erro de tools seguem o estilo em inglês já existente.
2. Todo caminho citado é absoluto. Raiz do módulo: `C:\Users\Trabalho\Documents\obsidian-ai-templates`.
3. Comandos rodados a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`: `npm run typecheck` (tsc --noEmit), `npm test` (vitest run), `npm run lint` (eslint .). O build (`npm run build`) só roda na etapa 11.
4. Não adicionar dependências. Não alterar `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, `esbuild.config.mjs`.
5. Não rodar `npm run deploy`. Não criar nem editar `C:\Users\Trabalho\Documents\obsidian-ai-templates\.deploy-target`. Não fazer commit, push, merge. Não ler nem escrever arquivos de credenciais (.env, .credentials.json).
6. Teste que falha por causa de uma mudança pedida: atualize a asserção que ficou desatualizada. Não apague teste para fazê-lo passar.
7. Não altere comportamento além do que o item da etapa pede.
8. Se algo não bater com o descrito (arquivo, função ou assinatura diferente da citada), pare e relate, sem improvisar.

## 4. Mapa das etapas
| # | Etapa | Esforço | Depende de | Paralelizável com |
| --- | --- | --- | --- | --- |
| 1 | Schema e erro com exemplo curto (itens 1 e 5) | médio | nenhuma | 3, 4 |
| 2 | Campos lista e objeto com exemplo (item 6) | alto | 1 | 3, 4 |
| 3 | Molde nota_livre no starter pack (item 2, parte do módulo) | médio | nenhuma | 1, 2, 4 |
| 4 | Hook do AI Ecosystem, alvos *.md geram aviso (item 2, repositório externo) | alto | nenhuma | todas as outras |
| 5 | Instalação de moldes e create_template sem sobrescrever (itens 3 e 4) | alto | 2 | 4 |
| 6 | target_path sem pastas ocultas e overwrite explícito (item 7) | alto | 5 | 4 |
| 7 | Remoção do código morto de append e upsert (item 8) | médio | 6 | 4 |
| 8 | create_note com dry_run, resposta mínima e anexos sem órfãos (itens 9, 10 e 14) | alto | 7 | 4 |
| 9 | Tools expostas e instruções curtas (itens 11 e 13) | médio | 8 | 4 |
| 10 | Aprovação dos moldes e saída compacta (itens 12 e 15) | médio | 9 | 4 |
| 11 | Verificação geral (build, lint, testes, conferência dos 15 itens) | alto | 1 a 10 | nenhuma |

## 5. Etapas

## Etapa 1: Schema e erro com exemplo curto [Haiku 5.5 | esforço: médio]

**Objetivo:** o erro de validação traz os campos obrigatórios e um exemplo curto, e o exemplo do schema mostra só os campos obrigatórios com placeholders curtos (itens 1 e 5).
**Depende de:** nenhuma
**Paralelizável com:** Etapa 3, Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\schema.ts` (exampleValue, nova função requiredExample, buildSchema)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts` (método private check: mensagem de erro)
- Alterar, só se tiverem asserção sobre o exemplo ou a mensagem: `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\templates\template-workflow.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools\template-index.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\field-data.ts` e os demais arquivos.

**Regras de implementação**
1. Em `exampleValue`, string vira `<${spec.name}>` (sem a descrição, que já aparece em `fields`).
2. Se o campo tem `default`, o exemplo usa o default. Para os demais tipos, os valores são: number 0, boolean true, date "2026-01-31", image "<absolute path of a local image file>", list ["item"], object {}, table com headers das `columns` (ou ["Column 1", "Column 2"]) e uma linha de "...".
3. `requiredExample(def)` é exportada e devolve só os campos com `required === true`.
4. `buildSchema` põe em `example` o resultado de `requiredExample(def)`. Os demais campos do retorno (id, description, targetPath, collisionRule, fields, notes) não mudam.
5. A mensagem de erro de `check` troca a frase `Call get_template_schema for the fields and an example.` por duas linhas: `Required fields: <nome> (<tipo>), ...` (ou `Required fields: none.`) e `Example with the required fields: <JSON compacto de requiredExample(def)>`.
6. A mensagem não cita nome de tool.

**Passos** (em ordem; cada sub-tópico tem verificação própria)
- **1.1 Exemplo só com obrigatórios:** ajustar `exampleValue`, criar `requiredExample`, usar em `buildSchema`.
  1. Em `schema.ts`, trocar o caso `string` por `` `<${spec.name}>` ``, e o caso `image` pelo texto da regra 2.
  2. Acrescentar `export function requiredExample(def: TemplateDefinition): Record<string, unknown>` que percorre `def.fields` e inclui só os `required === true`, com `exampleValue`.
  3. Em `buildSchema`, trocar o laço que monta `example` por `example = requiredExample(def)`.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **1.2 Mensagem de erro:** atualizar `check` em `template-service.ts`.
  1. Importar `requiredExample` junto de `buildSchema` em `template-service.ts` (o import de `./schema` já existe).
  2. No `throw new UserError(...)` do método `check`, substituir a linha `Call get_template_schema ...` pelas duas linhas da regra 5. Montar a lista de obrigatórios com `def.fields.filter((f) => f.required)`.
  3. Manter `UserError` e as linhas de erros já existentes.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **1.3 Testes:** ajustar asserções que o novo exemplo invalidou.
  1. Rodar `npm test`. Para cada falha causada pelo novo exemplo ou pela nova mensagem, atualizar só a asserção.
  2. Não remover teste.
  - Verificação do sub-tópico: `npm test` → todos passam.

**BDD (estado esperado ao concluir)**
- Dado um molde com `titulo` (string, required) e `notas` (string, required false, default "vazio"), Quando `buildSchema(def, "incremental")` é chamado, Então `example` tem só a chave `titulo`.
- Dado um molde cujo campo obrigatório é do tipo `table` sem `columns`, Quando `requiredExample(def)` é chamado, Então o valor do campo é `{ headers: ["Column 1","Column 2"], rows: [["...","..."]] }`.
- Dado dados sem o campo obrigatório `titulo`, Quando `createNote` ou `preview` roda, Então a mensagem de erro contém `Required fields: titulo (string)` e `Example with the required fields`, e não contém `get_template_schema`.
- Dado dados válidos, Quando o molde é renderizado, Então o resultado é igual ao de antes da mudança.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos os testes passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai alterar um plugin do Obsidian escrito em TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd; liquidjs).
- O plugin preenche moldes Markdown com JSON enviado por agentes de IA. Um molde é uma nota com frontmatter `template_id` e `fields`. O método `buildSchema` (src\templates\schema.ts) monta o que o agente lê antes de preencher o molde.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve os itens 1 e 5:
  - Item 1: o erro de validação manda chamar get_template_schema. O erro deve trazer os campos obrigatórios e um exemplo curto.
  - Item 5: o exemplo do schema repete descrições e defaults. Deve ter placeholders curtos por tipo e exemplo só dos campos obrigatórios.
- Esta é a primeira etapa; nenhuma etapa anterior alterou estes arquivos.
- Idioma: código e comentários em inglês. Mensagens de erro em inglês, no estilo das existentes.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não crie nem altere .deploy-target. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\schema.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts (só o método private check e o import de ./schema)
- Alterar só se tiverem asserção sobre o exemplo ou a mensagem: C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\templates\template-workflow.test.ts e C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools\template-index.test.ts
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\field-data.ts e os demais arquivos.

SUB-TÓPICO 1.1: exemplo do schema só com obrigatórios
1. Em schema.ts, função exampleValue: o caso string passa a devolver `<${spec.name}>` (sem a descrição). Caso image: devolver "<absolute path of a local image file>". Os demais casos ficam como estão, exceto: se spec.default estiver definido, devolver o default (já é o comportamento atual).
2. Acrescentar a função exportada: export function requiredExample(def: TemplateDefinition): Record<string, unknown>. Ela percorre def.fields e inclui só os campos com required === true, com o valor de exampleValue.
3. Em buildSchema, trocar a montagem de example por example = requiredExample(def). Não mudar os demais campos do retorno.
- Verificação do sub-tópico: npm run typecheck → sem erros.

SUB-TÓPICO 1.2: mensagem de erro de check
1. Em template-service.ts, importar requiredExample junto com buildSchema (o import de ./schema já existe).
2. No método private check, no UserError que hoje contém "Call get_template_schema for the fields and an example.", remover essa frase e acrescentar duas linhas:
   - "Required fields: <nome> (<tipo>), <nome> (<tipo>)" com os campos de def.fields que têm required === true; se não houver nenhum, escrever "Required fields: none.";
   - "Example with the required fields: " seguido de JSON.stringify(requiredExample(def)).
3. Manter as linhas de erro já existentes (- <erro>) como estão.
- Verificação do sub-tópico: npm run typecheck → sem erros.

SUB-TÓPICO 1.3: testes
1. Rodar npm test. Para cada falha causada pelo novo exemplo ou pela nova mensagem, atualizar só a asserção afetada.
2. Não remover nenhum teste.
- Verificação do sub-tópico: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado um molde com titulo (string, required) e notas (string, required false, default "vazio"), Quando buildSchema é chamado, Então example tem só a chave titulo.
- Dado dados sem o campo obrigatório titulo, Quando createNote ou preview é chamado, Então a mensagem contém "Required fields: titulo (string)" e "Example with the required fields", e não contém "get_template_schema".
- Dado dados válidos, Então o resultado é igual ao de antes.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere validateData em field-data.ts nem o parser de campos.
- Não altere os tipos FieldSpec ou TemplateDefinition.
- Não refatore nada fora dos trechos citados.

SE ALGO NÃO BATER
- Se check, buildSchema ou exampleValue estiverem diferentes do descrito, pare e relate sem improvisar.

RELATÓRIO FINAL
- Liste os arquivos alterados com caminho absoluto.
- Para cada sub-tópico (1.1, 1.2, 1.3), diga PASSOU ou FALHOU.
- Cole a saída real dos três comandos (typecheck, test com contagem de testes, lint).
- Liste desvios e dúvidas.
```

## Etapa 2: Campos lista e objeto com exemplo [Haiku 5.5 | esforço: alto]

**Objetivo:** um campo `list` ou `object` pode declarar `example` (ou `items`) com o formato dos itens; o exemplo do schema usa esse formato; e o render avisa quando um campo opcional usado pelo corpo do molde não foi enviado (item 6).
**Depende de:** Etapa 1 (usa requiredExample e a nova versão de exampleValue)
**Paralelizável com:** Etapa 3, Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\types\template-types.ts` (interface FieldSpec: campo opcional `example?: unknown`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-parser.ts` (função parseFields: lê `example` e `items`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts` (função fieldToYaml: grava `example`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\schema.ts` (exampleValue: usa spec.example quando definido)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts` (método private check: aviso de variável indefinida)
- Criar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\templates\field-example.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\field-data.ts` (validateData segue igual)

**Regras de implementação**
1. Em `parseFields`, cada campo aceita `example` e também `items` como apelido. Se os dois vierem, `example` vence. O valor é guardado sem validação de formato.
2. `FieldSpec.example` é opcional. `fieldToYaml` grava `example` no frontmatter quando estiver definido, para que `create_template` regrave o campo sem perda (a releitura do `create_template` deve bater com o que foi gravado).
3. Em `exampleValue`, se `spec.example !== undefined`, devolver `spec.example`; essa checagem vem antes do default e dos casos por tipo.
4. Aviso de variável indefinida: em `check`, para cada campo de `def.fields` que não é required, não foi enviado, não tem `default`, e cujo nome aparece no corpo como palavra inteira (`new RegExp("\\b" + name + "\\b")` sobre `def.body`), acrescentar aos warnings: `Field "<nome>" was not given and the template body uses it; it renders empty.`
5. O aviso é warning, não erro. A renderização continua.
6. Não criar dependência para isso.

**Passos**
- **2.1 Tipos e parser:** acrescentar `example` a FieldSpec e ler `example`/`items` em parseFields.
  1. Em template-types.ts, acrescentar em FieldSpec: `example?: unknown;` com comentário em inglês: "Example value shown to agents. For list and object fields, the shape of the items."
  2. Em template-parser.ts, em parseFields, ao montar o objeto do campo, acrescentar `example: spec.example !== undefined ? spec.example : spec.items`.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **2.2 Exemplo e serialização:** usar example no schema e gravar no create_template.
  1. Em schema.ts, em exampleValue, antes do switch: `if (spec.example !== undefined) return spec.example;`.
  2. Em template-creator.ts, em fieldToYaml, acrescentar `if (spec.example !== undefined) out.example = spec.example;`.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **2.3 Aviso de variável indefinida:** em check (template-service.ts), calcular os avisos da regra 4 depois de validateData, usando input já validado (`check.data`) para saber o que foi enviado.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **2.4 Testes:** criar tests/templates/field-example.test.ts cobrindo os BDD abaixo, usando os mocks já existentes em tests\mocks\obsidian.ts e os padrões de tests\templates\template-workflow.test.ts.
  - Verificação do sub-tópico: `npm test` → todos passam, incluindo os novos.

**BDD (estado esperado ao concluir)**
- Dado um campo `fases` do tipo list com `example: [{numero: 1, titulo: "x", passos: ["p"], bdd: "b"}]`, Quando buildSchema é chamado, Então `example.fases` é exatamente esse valor, e não `["item 1","item 2"]`.
- Dado o mesmo campo declarado com `items:` no lugar de `example:`, Quando parseFields roda, Então o campo tem o mesmo `example`.
- Dado um molde salvo por create_template com um campo que tem example, Quando a nota é relida por parseTemplateNote, Então o campo mantém o example.
- Dado um molde cujo corpo usa `{{ notas }}`, com `notas` opcional e sem default, Quando o preview roda sem enviar notas, Então warnings contém `Field "notas"` e o render não lança.
- Dado um molde cujo corpo não usa o campo opcional `notas`, Quando o preview roda sem enviar notas, Então não há aviso sobre notas.
- Dado que nada mais mudou, Então os testes existentes continuam passando.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam, incluindo tests\templates\field-example.test.ts.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai alterar um plugin do Obsidian escrito em TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd; liquidjs).
- Um molde é uma nota com frontmatter template_id e fields. Cada campo é um FieldSpec (src\types\template-types.ts). Os campos de tipo list e object hoje não dizem o formato dos itens, e quem segue o exemplo gera uma nota com campos vazios sem aviso.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve o item 6: aceitar example (ou items) no campo, usar esse exemplo no schema, e avisar quando um campo opcional usado pelo corpo não é enviado.
- Etapa anterior (já feita): em schema.ts, exampleValue foi simplificado e existe requiredExample(def); em template-service.ts, o erro de check lista os obrigatórios. Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não crie nem altere .deploy-target. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\types\template-types.ts (FieldSpec)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-parser.ts (parseFields)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts (fieldToYaml)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\schema.ts (exampleValue)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts (método private check)
- Criar: C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\templates\field-example.test.ts
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\field-data.ts

SUB-TÓPICO 2.1: tipo e parser
1. Em template-types.ts, na interface FieldSpec, acrescentar: example?: unknown; com comentário em inglês: "Example value shown to agents. For list and object fields, the shape of the items."
2. Em template-parser.ts, em parseFields, no objeto que é empurrado para fields, acrescentar a propriedade example com o valor: spec.example se for !== undefined, senão spec.items. Se o nome `example` ou `items` não existir no spec, o valor fica undefined.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 2.2: exemplo e serialização
1. Em schema.ts, função exampleValue, logo no início: if (spec.example !== undefined) return spec.example;
2. Em template-creator.ts, função fieldToYaml: if (spec.example !== undefined) out.example = spec.example;
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 2.3: aviso de variável indefinida
1. Em template-service.ts, método private check: depois de validateData, para cada campo de def.fields tal que required é false, default é undefined, o nome não está em input (use a entrada original, antes da normalização, para saber o que foi enviado), e o nome aparece no corpo como palavra inteira (new RegExp("\\b" + spec.name + "\\b").test(def.body)), acrescentar a warnings: Field "<nome>" was not given and the template body uses it; it renders empty.
2. Esse aviso é warning. Não lançar erro.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 2.4: testes
1. Criar C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\templates\field-example.test.ts com um teste por cenário abaixo. Use o estilo dos testes existentes em tests\templates\template-workflow.test.ts e os mocks em tests\mocks\obsidian.ts.
   - list com example de objetos: get do schema mostra o example informado.
   - mesmo campo com items no lugar de example: parseFields produz o mesmo example.
   - create_template com campo que tem example: a nota gravada, relida por parseTemplateNote, mantém o example.
   - molde com {{ notas }} no corpo, notas opcional sem default, preview sem notas: warnings contém Field "notas" e não lança.
   - molde sem uso de notas no corpo, preview sem notas: nenhum aviso sobre notas.
2. Rodar npm test e corrigir só os próprios testes novos se falharem por erro de teste; não alterar a regra de negócio para passar.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado um campo fases do tipo list com example de objetos, Quando buildSchema é chamado, Então example.fases é esse valor.
- Dado o mesmo campo com items no lugar de example, Quando parseFields roda, Então o example é o mesmo.
- Dado um molde salvo por create_template com example num campo, Quando parseTemplateNote relê a nota, Então o campo mantém example.
- Dado um campo opcional usado pelo corpo e não enviado, Quando preview roda, Então warnings tem o aviso e o render não lança.
- Dado um campo opcional não usado pelo corpo, Então não há aviso para ele.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere validateData em field-data.ts.
- Não valide o formato dos itens de example.
- Não mude a mensagem de erro de check feita na etapa anterior.

SE ALGO NÃO BATER
- Se parseFields, fieldToYaml, exampleValue ou check estiverem diferentes do descrito, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados e criados, com caminho absoluto.
- Para cada sub-tópico (2.1 a 2.4), PASSOU ou FALHOU.
- Saída real dos três comandos (typecheck, test com contagem, lint).
- Desvios e dúvidas.
```

## Etapa 3: Molde nota_livre no starter pack [Haiku 5.5 | esforço: médio]

**Objetivo:** criar o molde genérico `nota_livre` no starter pack, em português e inglês, para ser o destino de notas sem molde próprio (item 2, parte do módulo).
**Depende de:** nenhuma
**Paralelizável com:** Etapa 1, Etapa 2, Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\starter\starter-pack.ts` (nova constante por idioma e inclusão na lista de starters)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\starter\starter-pack.test.ts` (contagens e ids esperados)
- Não tocar: os demais arquivos.

**Regras de implementação**
1. O id é `nota_livre`. A nota é salva como `<pasta de moldes>\nota_livre.md`, como os demais starters.
2. Descrição em português: "Nota livre com título e texto, para assuntos que não têm molde próprio." Em inglês: "Free note with a title and text, for topics that have no template of their own."
3. `target_path` é `"Notas/{{ titulo | slug }}.md"`, com `collision_rule: incremental`.
4. Campos: `titulo` (string, required true, com description); `texto` (string, required false); `up` (string, required false), com o mesmo tratamento de propriedade `up` que `nota_reuniao` usa no corpo.
5. Copie a estrutura do starter `nota_reuniao` que já existe em starter-pack.ts (constantes por idioma, lista de starters, formato do frontmatter).

**Passos**
- **3.1 Constantes:** criar NOTA_LIVRE_PT e NOTA_LIVRE_EN com o frontmatter e o corpo. Corpo: linha `# {{ titulo }}`, linha em branco, e `{% if texto %}{{ texto }}{% endif %}` seguido de quebra de linha.
  - Verificação: npm run typecheck → sem erros.
- **3.2 Lista de starters:** incluir o novo starter na lista exportada, na ordem em que os outros aparecem.
  - Verificação: npm run typecheck → sem erros.
- **3.3 Testes:** ajustar contagens e ids em tests\starter\starter-pack.test.ts; adicionar um teste que confirma que nota_livre é instalado quando a pasta está vazia, nos dois idiomas.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado uma pasta de moldes vazia e locale pt, Quando installStarterPack roda, Então cria `nota_livre.md` com `template_id: nota_livre` e a descrição em português.
- Dado locale en, Quando installStarterPack roda, Então cria `nota_livre.md` com a descrição em inglês.
- Dado que nada mais mudou, Então os testes de starter existentes continuam passando.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai adicionar um molde de nota ao starter pack de um plugin do Obsidian em TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest).
- O starter pack (src\starter\starter-pack.ts) instala moldes genéricos na pasta de moldes do cofre. Cada molde tem uma versão em português e uma em inglês, com o mesmo template_id.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa cria o molde genérico nota_livre (parte do item 2): destino para notas sem molde próprio, para que não seja preciso criar moldes de uso único.
- Outras etapas estão mudando, em paralelo, src\templates\*.ts e src\main.ts. Não altere esses arquivos.
- Idioma: código e comentários em inglês; conteúdo dos moldes em português e inglês conforme o padrão do arquivo.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\starter\starter-pack.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\starter\starter-pack.test.ts
- Não tocar: qualquer outro arquivo.

SUB-TÓPICO 3.1: constantes do molde
1. Leia src\starter\starter-pack.ts e localize a constante do molde nota_reuniao (português) e a versão em inglês. Copie a estrutura exata: frontmatter entre linhas ---, template_id, description entre aspas, target_path entre aspas, collision_rule, fields com type, required, description.
2. Crie NOTA_LIVRE_PT e NOTA_LIVRE_EN com:
   - template_id: nota_livre
   - description (pt): "Nota livre com título e texto, para assuntos que não têm molde próprio."
   - description (en): "Free note with a title and text, for topics that have no template of their own."
   - target_path: "Notas/{{ titulo | slug }}.md"
   - collision_rule: incremental
   - fields: titulo (string, required true, description curta no idioma); texto (string, required false, description curta); up (string, required false, description igual à de nota_reuniao).
   - Corpo: uma linha "# {{ titulo }}", uma linha em branco, e "{% if texto %}{{ texto }}{% endif %}". Para a propriedade up, copie exatamente o tratamento que nota_reuniao usa no corpo, se houver; se não houver, não adicione nada para up no corpo.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 3.2: incluir na lista
1. Localize o array/lista de starters exportado em starter-pack.ts. Inclua o novo starter com as duas versões no mesmo formato dos outros, na ordem em que os demais aparecem (nota_livre pode ficar por último).
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 3.3: testes
1. Em tests\starter\starter-pack.test.ts, ajustar as contagens e a lista de ids esperados para incluir nota_livre.
2. Acrescentar um teste: com a pasta de moldes vazia, installStarterPack cria nota_livre.md com template_id: nota_livre, nas duas línguas (usar o mesmo mock de vault do arquivo).
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado uma pasta de moldes vazia e locale pt, Quando installStarterPack roda, Então cria nota_livre.md com template_id: nota_livre e a descrição em português.
- Dado locale en, Quando installStarterPack roda, Então cria nota_livre.md com a descrição em inglês.
- Dado que os demais testes de starter existiam, Então continuam passando depois de ajustada a contagem.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere a lógica de instalação (installStarterPack) nem a regra de quando instalar. Isso é da etapa 5.
- Não altere moldes existentes.

SE ALGO NÃO BATER
- Se a estrutura de nota_reuniao for diferente da descrita, use a estrutura real e relate a diferença.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (3.1, 3.2, 3.3), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 4: Hook do AI Ecosystem, alvos *.md geram aviso [Haiku 5.5 | esforço: alto]

**Objetivo:** no hook do AI Ecosystem, um Write de arquivo novo cujo alvo de molde termina em `*.md` gera aviso em vez de bloqueio; alvos específicos continuam bloqueando (item 2, parte do hook). Esta etapa mexe em outro repositório.
**Depende de:** nenhuma
**Paralelizável com:** todas as demais etapas (repositório diferente)

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src\hooks\script\ai-ecosystem-hook.mjs` (protecção do módulo ai-templates, na tabela de despacho perto das linhas 779 a 792, e a função de decisão de Write para alvos de molde)
- Alterar, se a tabela de especificações espelhar a decisão: o arquivo hook-specs.ts localizado dentro de `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src` (use Glob com esse padrão para achar o caminho exato antes de editar)
- Alterar: o arquivo de teste do hook (hook-script.test.ts, localizado com Glob dentro de `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src` ou `tests`)
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-templates` (o lado do módulo já publica os alvos em hooks-integration.ts e não muda nesta etapa)
- Não tocar: `C:\Users\Trabalho\Documents\Cofre\.claude\ai-ecosystem\hooks\` (a cópia instalada muda só com deploy, que é ação do usuário)

**Regras de implementação**
1. Um alvo de molde (vindo de `templateTargets`, gerado por `targetToGlob` no módulo, em que `{{ }}` vira `*`) é "genérico" quando termina em `*.md`. Exemplos: `Projetos/*/*.md`, `Knowledge/Referências do Cofre/*.md`.
2. Write de arquivo novo que casa com alvo genérico: aviso (o hook informa e deixa passar). O texto do aviso sugere o molde `nota_livre` ou o molde específico, se houver.
3. Write de arquivo novo que casa com alvo que não termina em `*.md`: continua bloqueado, como hoje.
4. Write em arquivo que já existe: sem mudança de comportamento.
5. Nenhum outro módulo do AI Ecosystem muda de comportamento. Só o caminho de ai-templates.
6. Ler antes de editar: a decisão e as mensagens atuais estão no mesmo arquivo; siga o padrão de mensagens existente (MESSAGES) e de retorno de "aviso" já usado por outros módulos, se houver.

**Passos**
- **4.1 Ler o código atual:** localizar a decisão de Write para ai-templates, a lista de alvos e as mensagens. Anotar os nomes das funções e as linhas.
  - Verificação do sub-tópico: a anotação lista pelo menos a função de decisão, o ponto onde templateTargets é lido, e a forma de aviso já existente.
- **4.2 Implementar a regra:** no caminho de Write de ai-templates, separar alvos genéricos (terminam em `*.md`) de específicos; genéricos retornam aviso; específicos mantêm o bloqueio.
  - Verificação do sub-tópico: o teste do hook existente continua passando, ou falha apenas em caso que representa o comportamento antigo que agora mudou; atualizar esses casos.
- **4.3 Espelhar a tabela de especificações:** se hook-specs.ts descrever o comportamento de Write de ai-templates, atualizar a descrição para o novo comportamento.
  - Verificação do sub-tópico: o teste que mantém hook-specs.ts em sincronia com o hook (se existir) passa.
- **4.4 Testes:** acrescentar casos para os três cenários de Write e para arquivo existente.
  - Verificação do sub-tópico: rodar o comando de teste do repositório do AI Ecosystem (leia `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\package.json` para achar o script de teste e o de typecheck, se houver) e registrar a saída.

**BDD (estado esperado ao concluir)**
- Dado um Write de arquivo novo `Projetos/ABC/nota.md` e alvo de molde `Projetos/*/*.md`, Quando o hook avalia, Então a decisão é aviso (não bloqueio), e o texto cita `nota_livre`.
- Dado um Write de arquivo novo em alvo de molde que não termina em `*.md`, Quando o hook avalia, Então continua bloqueado como antes.
- Dado um Write em arquivo que já existe, Quando o hook avalia, Então a decisão é a mesma de antes.
- Dado o teste do hook, Quando rodado, Então passa.

**Verificação**
- Rodar, a partir de `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem`, o script de teste indicado no package.json. Esperado: todos os testes passam.
- Rodar o typecheck do mesmo repositório, se o package.json tiver o script. Esperado: sem erros.

**Prompt para o subagente**
```text
Você vai alterar o hook de proteção do AI Ecosystem, um script Node (.mjs) de um repositório TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Repositório do AI Ecosystem: C:\Users\Trabalho\Documents\obsidian-ai-ecosystem. Ele tem um hook PreToolUse que protege o cofre (Obsidian) de escritas e buscas indevidas. O arquivo fonte do hook é C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src\hooks\script\ai-ecosystem-hook.mjs.
- O módulo AI Templates (C:\Users\Trabalho\Documents\obsidian-ai-templates) publica no hook uma lista de alvos de molde (templateTargets). Cada alvo é um glob vault-relativo, por exemplo Projetos/*/*.md. Esses alvos vêm de targetToGlob em C:\Users\Trabalho\Documents\obsidian-ai-templates\src\ecosystem\hooks-integration.ts, que troca {{ }} por *. Não altere o lado do módulo.
- Problema (item 2 da auditoria): os 16 alvos de molde bloqueiam qualquer Write novo em Projetos/*/*.md e em Knowledge/Referências do Cofre/*.md, mesmo sem molde adequado. Isso obrigou a criar moldes de uso único.
- Solução decidida: alvo genérico (termina em *.md) gera aviso, não bloqueio. Alvo específico (não termina em *.md) continua bloqueando. O molde genérico nota_livre já foi criado no módulo (etapa 3).
- Idioma: código e comentários em inglês, como o arquivo já faz; mensagens seguem o estilo das existentes.

REGRAS GLOBAIS
1. Não adicione dependências. Não faça commit, push ou merge. Não rode deploy.
2. Não altere a cópia instalada no cofre (C:\Users\Trabalho\Documents\Cofre\.claude\ai-ecosystem\hooks\).
3. Não altere outros módulos do hook (ai-vault-search, environment-variables, ai-scripts, ai-git-tools). Só o caminho de ai-templates muda.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src\hooks\script\ai-ecosystem-hook.mjs
- Alterar, se existir e espelhar a decisão: o hook-specs.ts dentro de C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src (localize com Glob antes de editar)
- Alterar: o arquivo de teste do hook (hook-script.test.ts), localizado com Glob dentro de C:\Users\Trabalho\Documents\obsidian-ai-ecosystem
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates

SUB-TÓPICO 4.1: ler antes de editar
1. Abra ai-ecosystem-hook.mjs e localize: (a) a tabela PROTECTION_MODULES (perto da linha 779), (b) a função que decide o Write de ai-templates (procure pela string ai-templates e por templateTargets), (c) onde as mensagens de bloqueio e de aviso são montadas (MESSAGES ou equivalente), (d) como um aviso (não bloqueio) já é devolvido para outros casos, se existir.
2. Anote os nomes e as linhas. Não edite ainda.
- Verificação: você consegue dizer, em uma frase por item, o que cada um faz.

SUB-TÓPICO 4.2: implementar a regra
1. No caminho de Write de ai-templates, para cada alvo de templateTargets que casa com o caminho do arquivo escrito:
   - se o alvo termina em *.md, a decisão é aviso: o hook informa, não bloqueia. A mensagem diz que é um molde genérico e sugere nota_livre (e o molde específico, se houver um alvo específico que casa).
   - se o alvo não termina em *.md, mantém o bloqueio atual.
2. Se o arquivo já existe, mantenha o comportamento atual.
3. Use o mesmo mecanismo de aviso que outros pontos do hook já usam; não invente um formato de saída novo.
- Verificação: rodar o teste do hook (sub-tópico 4.4). Se algum caso antigo falhar só porque representava o bloqueio agora mudado, atualize o caso.

SUB-TÓPICO 4.3: tabela de especificações
1. Se hook-specs.ts existir e descrever o comportamento de Write de ai-templates, ajustar a descrição para o novo comportamento. Se não existir ou não descrever isso, não alterar.
- Verificação: o teste que mantém a tabela em sincronia passa, se existir.

SUB-TÓPICO 4.4: testes
1. Acrescentar ao teste do hook casos para: Write novo em Projetos/ABC/nota.md com alvo Projetos/*/*.md (aviso, texto cita nota_livre); Write novo em alvo que não termina em *.md (bloqueio); Write em arquivo existente (sem mudança).
2. Ler C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\package.json para achar o script de teste e o de typecheck (se houver). Rodar a partir de C:\Users\Trabalho\Documents\obsidian-ai-ecosystem.
- Verificação: o script de teste passa; o typecheck, se existir, não tem erros. Cole a saída real.

CRITÉRIOS (BDD)
- Dado um Write de arquivo novo Projetos/ABC/nota.md e alvo Projetos/*/*.md, Quando o hook avalia, Então a decisão é aviso, não bloqueio, e o texto cita nota_livre.
- Dado um Write de arquivo novo em alvo que não termina em *.md, Quando o hook avalia, Então continua bloqueado.
- Dado um Write em arquivo que já existe, Quando o hook avalia, Então a decisão é a mesma de antes.
- Dado o teste do hook, Quando rodado, Então passa.

NÃO FAÇA
- Não altere outros módulos do hook.
- Não altere o módulo AI Templates.
- Não copie o hook para o cofre.

SE ALGO NÃO BATER
- Se a decisão de Write de ai-templates não existir ou for diferente do descrito, pare e relate com as linhas que encontrou.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (4.1 a 4.4), PASSOU ou FALHOU.
- Saída real do teste e do typecheck.
- Desvios e dúvidas.
```

## Etapa 5: Instalação de moldes e create_template sem sobrescrever [Haiku 5.5 | esforço: alto]

**Objetivo:** o starter pack só é instalado com a pasta de moldes vazia (item 3), e create_template recusa gravar sobre nota comum e informa quando substitui um molde (item 4).
**Depende de:** Etapa 2 (fieldToYaml e template-creator já alterados)
**Paralelizável com:** Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\main.ts` (installStarterTemplates)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\starter\starter-pack.ts` (nova função pura shouldInstallStarter)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\vault-port.ts` (método hasNotesIn, se não existir método equivalente)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\obsidian-vault.ts` (implementação de hasNotesIn)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts` (recusa de nota comum e campo replaced)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts` (somente o handler de create_template: incluir replaced no resultado)
- Alterar: testes e mocks que implementam VaultPort (tests\mocks\obsidian.ts e os testes de starter e de creator, quando necessário)
- Não tocar: src\templates\schema.ts, src\templates\template-service.ts (são de outras etapas)

**Regras de implementação**
1. Instalação automática (não restore): só instala se `installStarterPack` estiver ligado E a pasta de moldes não tiver nenhuma nota `.md`. O comando de reinstalar (restore) continua instalando os que faltam, sem exigir pasta vazia.
2. A decisão fica numa função pura `shouldInstallStarter(restore: boolean, installEnabled: boolean, folderHasNotes: boolean): boolean` exportada de starter-pack.ts: `restore || (installEnabled && !folderHasNotes)`.
3. Se VaultPort não tem como saber se a pasta tem notas, acrescente `hasNotesIn(folder: string): boolean` à interface e implemente em obsidian-vault.ts com a API do Obsidian já usada no arquivo (pasta ausente ou sem `.md` devolve false). Atualize os fakes de VaultPort dos testes.
4. create_template: se o caminho final `<pasta>\<id>.md` existe como arquivo e não é molde carregado (`loader.find(id)` devolveu undefined), lançar UserError: `A note already exists at "<caminho>" and it is not a template. Choose another template_id.` Não gravar nada.
5. create_template: CreatedTemplate ganha `replaced: boolean` (true quando havia molde com o mesmo id e foi substituído). `created` continua sendo `!replaced`. O handler de create_template em templates-module.ts inclui `replaced` no JSON de saída.
6. Não altere o comportamento de restore nem o de reinstalação de main.ts.

**Passos**
- **5.1 Decisão de instalação:** criar shouldInstallStarter e usar em main.ts.
  1. Em starter-pack.ts, exportar shouldInstallStarter conforme a regra 2.
  2. Em vault-port.ts e obsidian-vault.ts, adicionar hasNotesIn (regra 3) se não houver método equivalente.
  3. Em main.ts, installStarterTemplates: calcular folderHasNotes = this.vaultPort.hasNotesIn(folder) e retornar cedo se shouldInstallStarter(restore, this.settings.installStarterPack, folderHasNotes) for false.
  - Verificação: npm run typecheck → sem erros.
- **5.2 Recusa e replaced em create_template:** ajustar template-creator.ts e o handler.
  1. Em create(), depois de calcular path e antes de gravar, aplicar a regra 4.
  2. Acrescentar replaced em CreatedTemplate (regra 5) e no retorno de create().
  3. Em templates-module.ts, no handler de create_template, incluir replaced: created.replaced no objeto retornado por jsonResult.
  - Verificação: npm run typecheck → sem erros.
- **5.3 Testes:** atualizar fakes de VaultPort; testes da decisão de instalação; testes da recusa e do replaced.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado installStarterPack ligado e a pasta de moldes com pelo menos uma nota .md, Quando a instalação automática roda, Então nenhum starter é instalado.
- Dado installStarterPack ligado e a pasta vazia ou inexistente, Quando a instalação automática roda, Então os starters são instalados.
- Dado o comando de reinstalar (restore), Quando roda com pasta com notas, Então os starters que faltam são instalados.
- Dado uma nota comum Templates/AI/x.md sem template_id, Quando create_template usa template_id x, Então lança o erro da regra 4 e o arquivo fica intacto.
- Dado um molde existente com id x, Quando create_template usa o mesmo id, Então o resultado tem replaced true e created false.
- Dado create_template com id novo, Então replaced é false e created é true.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai alterar um plugin do Obsidian em TypeScript: a instalação automática dos moldes iniciais e a criação de moldes. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- Moldes são notas com frontmatter template_id e fields, numa pasta de moldes do cofre (padrão Templates/AI).
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve os itens 3 e 4:
  - Item 3: sem data.json, o plugin instala 7 moldes iniciais a cada carga, mesmo com a pasta cheia. Regra nova: instalação automática só com a pasta de moldes vazia (sem nenhuma nota .md). Reinstalar pelo comando continua valendo.
  - Item 4: create_template sobrescreve um arquivo que existe em Templates/AI/<id>.md mesmo quando não é molde. Regra nova: recusar nesse caso, e informar replaced quando substituir um molde.
- Etapas anteriores (já feitas): template-creator.ts ganhou o tratamento de example em fieldToYaml (etapa 2). Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não crie nem altere .deploy-target. Não faça commit, push ou merge.
3. Não altere data.json nem nada dentro do cofre (C:\Users\Trabalho\Documents\Cofre).
4. Não altere arquivos fora da lista abaixo.
5. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\main.ts (installStarterTemplates)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\starter\starter-pack.ts (shouldInstallStarter)
- Alterar, se preciso: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\vault-port.ts e C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\obsidian-vault.ts (hasNotesIn)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts (somente o handler de create_template)
- Alterar, se implementarem VaultPort ou se testarem as funções: arquivos em C:\Users\Trabalho\Documents\obsidian-ai-templates\tests (localize com Glob: tests\mocks\obsidian.ts, tests\starter\starter-pack.test.ts, tests\storage\*.test.ts, tests\templates\*.test.ts)
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\schema.ts e C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts

SUB-TÓPICO 5.1: decisão de instalação
1. Em starter-pack.ts, exportar: export function shouldInstallStarter(restore: boolean, installEnabled: boolean, folderHasNotes: boolean): boolean { return restore || (installEnabled && !folderHasNotes); }
2. Em vault-port.ts, se não houver método que diga se uma pasta tem notas .md, acrescentar hasNotesIn(folder: string): boolean à interface VaultPort. Em obsidian-vault.ts, implementar com a API do Obsidian já usada no arquivo (pasta ausente ou sem arquivo .md devolve false). Atualizar todos os fakes de VaultPort nos testes.
3. Em main.ts, método private installStarterTemplates(restore): trocar a verificação inicial por: const folderHasNotes = this.vaultPort.hasNotesIn(this.settings.templatesFolder); if (!shouldInstallStarter(restore, this.settings.installStarterPack, folderHasNotes)) return; Importar shouldInstallStarter.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 5.2: create_template
1. Em template-creator.ts, método create: depois de calcular path e antes de montar o conteúdo, se existing for undefined e vault.kind(path) === "file", lançar UserError com a mensagem: A note already exists at "<path>" and it is not a template. Choose another template_id. (use a classe UserError já importada). Não gravar.
2. Acrescentar replaced: boolean em CreatedTemplate. Preencher com existing !== undefined. Manter created = !replaced. Atualizar o return.
3. Em templates-module.ts, no handler de create_template (procure o nome da tool "create_template" e o jsonResult que monta success, template_id, note, created, variables, warnings), acrescentar replaced: created.replaced.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 5.3: testes
1. Ajustar os fakes de VaultPort para incluir hasNotesIn.
2. Acrescentar testes: shouldInstallStarter nas quatro combinações relevantes (restore true/false, pasta com notas/vazia, instalação ligada/desligada); create_template recusa nota comum sem alterar o arquivo; create_template com molde existente devolve replaced true.
3. Não remover testes existentes.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado installStarterPack ligado e a pasta de moldes com pelo menos uma nota .md, Quando a instalação automática roda, Então nenhum starter é instalado.
- Dado a pasta vazia ou inexistente, Quando a instalação automática roda, Então os starters são instalados.
- Dado o comando de reinstalar, Quando a pasta tem notas, Então os starters que faltam são instalados.
- Dado uma nota comum Templates/AI/x.md sem template_id e create_template com template_id x, Então lança o erro e o arquivo fica igual.
- Dado um molde existente com o mesmo id, Quando create_template roda, Então o resultado tem replaced true e created false.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere o comportamento de restore/reinstalação além do que está na regra.
- Não altere o formato dos starters.
- Não mexa em schema.ts nem template-service.ts.

SE ALGO NÃO BATER
- Se installStarterTemplates ou o handler de create_template estiverem diferentes do descrito, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (5.1, 5.2, 5.3), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 6: target_path sem pastas ocultas e overwrite explícito [Haiku 5.5 | esforço: alto]

**Objetivo:** caminhos de nota não podem ter segmentos que começam com ponto (bloqueia gravação em `.claude\`), e quando o agente passa target_path que substituiria nota existente, exige overwrite true (item 7).
**Depende de:** Etapa 5
**Paralelizável com:** Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\path-guard.ts` (checkVaultPath: segmento que começa com ponto)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts` (NoteArgs.overwrite; createNote: exigência de overwrite)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts` (propriedade overwrite na tool create_note_from_template e no body de POST /notes)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts` (runner: repassar overwrite)
- Alterar testes: C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\storage\path-guard.test.ts, e o teste de workflow de notas (localize com Glob dentro de tests\templates e tests\storage)
- Não tocar: src\storage\note-creator.ts (é da etapa 7 e 8)

**Regras de implementação**
1. Em checkVaultPath, qualquer segmento que começa com `.` é recusado com PathError: `<label> "<raw>" has a folder or file name that starts with a dot, which is not allowed.` Vale para target_path e data_file. Isso já cobre `.obsidian` e `.claude`.
2. Em createNote: quando o chamador envia target_path (o argumento targetPath não está vazio), e o plano resolve para substituir nota existente (plan.overwrite === true), é preciso overwrite === true. Senão, UserError com: `target_path points to an existing note "<caminho>". Send overwrite: true to replace it.`
3. Sem target_path enviado, o comportamento segue a collision_rule do molde (inclusive overwrite), como hoje.
4. overwrite é opcional e booleano. Se vier outro tipo, UserError: `"overwrite" must be true or false.`
5. A tool create_note_from_template ganha a propriedade `overwrite` (boolean, descrição em inglês). O body de POST /notes aceita `overwrite`. O runner de template-index repassa `input.overwrite`.

**Passos**
- **6.1 Caminhos com ponto:** ajustar checkVaultPath em path-guard.ts.
  1. Acrescentar, no laço de segmentos já existente, a regra da regra 1 antes das demais checagens de segmento.
  - Verificação: npm run typecheck → sem erros.
- **6.2 overwrite no createNote:** em template-service.ts.
  1. Em NoteArgs, acrescentar overwrite?: unknown.
  2. Em createNote, depois de plan = deps.notes.plan(requested, rule) e antes do dry run: aplicar as regras 2, 3 e 4. Validar o tipo de overwrite antes do uso.
  - Verificação: npm run typecheck → sem erros.
- **6.3 Interfaces:** em templates-module.ts (tool create_note_from_template, inputSchema, e handler que chama service.createNote) e em POST /notes (buildRoutes), e em template-index.ts (TemplateToolRunner.run, objeto request), repassar overwrite.
  - Verificação: npm run typecheck → sem erros.
- **6.4 Testes:** acrescentar testes para os BDD abaixo; ajustar apenas asserções que a nova regra invalida.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado target_path "Notas/.claude/CLAUDE.md", Quando checkVaultPath roda, Então lança PathError que cita o ponto.
- Dado target_path "Pasta/.oculta/x.md", Quando checkVaultPath roda, Então lança PathError.
- Dado target_path "Notas/x.md" inexistente, Quando createNote roda sem overwrite, Então cria a nota.
- Dado target_path que aponta para nota existente, Quando createNote roda sem overwrite, Então lança o erro da regra 2 e o arquivo fica igual.
- Dado o mesmo caso com overwrite true, Quando createNote roda, Então substitui e o resultado tem overwritten true.
- Dado overwrite com valor "sim", Quando createNote roda, Então lança o erro de tipo.
- Dado um molde com collision_rule overwrite e sem target_path enviado, Quando createNote roda, Então substitui como antes (comportamento do molde preservado).

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai alterar um plugin do Obsidian em TypeScript: as regras de caminho de destino (target_path) das notas criadas por moldes. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- Um agente de IA chama create_note_from_template com template_id, data e, opcionalmente, target_path. A nota é gravada no caminho do cofre. Hoje, checkVaultPath (src\storage\path-guard.ts) bloqueia só o configDir, `..`, absolutos e caracteres proibidos. Dá para gravar em `.claude\**\*.md` (CLAUDE.md, skills), o que planta instruções para as próximas sessões. Um molde com collision_rule overwrite também substitui qualquer nota, inclusive quando o agente manda outro target_path.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve o item 7: recusar segmentos que começam com ponto e exigir overwrite true explícito quando o agente passar target_path que substituiria uma nota.
- Etapa anterior (feita): a instalação e create_template foram ajustados (etapa 5). Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\path-guard.ts (função checkVaultPath)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts (NoteArgs e createNote)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts (tool create_note_from_template e rota POST /notes)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts (TemplateToolRunner.run)
- Alterar testes: C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\storage\path-guard.test.ts e o teste de workflow de notas (localize com Glob em tests\templates e tests\storage)
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-creator.ts

SUB-TÓPICO 6.1: segmentos com ponto
1. Em path-guard.ts, função checkVaultPath, no laço for (const segment of segments), antes das demais checagens do segmento, acrescentar: se segment começa com ".", lançar PathError com a mensagem: `${label} "${raw}" has a folder or file name that starts with a dot, which is not allowed.`
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 6.2: overwrite no createNote
1. Em template-service.ts, na interface NoteArgs, acrescentar overwrite?: unknown.
2. Em createNote, logo depois de calcular plan = deps.notes.plan(requested, rule) e antes do dry run:
   - Se overwrite não for undefined nem null nem booleano, lançar UserError: "overwrite" must be true or false.
   - Se args.targetPath não for undefined, null ou "" E plan.overwrite for true E args.overwrite não for true, lançar UserError: `target_path points to an existing note "${plan.path}". Send overwrite: true to replace it.`
   - Caso contrário, seguir como hoje.
3. Em createNote, quando a nota é gravada e o resultado é montado, manter overwritten como já é.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 6.3: repassar overwrite nas interfaces
1. Em templates-module.ts, na tool create_note_from_template: acrescentar em inputSchema.properties a propriedade overwrite: { type: "boolean", description: "Required true to replace an existing note at target_path." }. No handler, passar overwrite: args.overwrite no objeto para service.createNote.
2. Em templates-module.ts, rota POST /notes em buildRoutes: passar overwrite: body.overwrite.
3. Em template-index.ts, em TemplateToolRunner.run, no objeto request: overwrite: input.overwrite.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 6.4: testes
1. Acrescentar testes em path-guard.test.ts para segmentos com ponto (".claude", ".oculta").
2. Acrescentar testes no workflow de notas para: nota nova sem overwrite; nota existente sem overwrite (erro, arquivo igual); nota existente com overwrite true (substitui, overwritten true); overwrite com tipo errado; molde com collision_rule overwrite e sem target_path (substitui como antes).
3. Ajustar só asserções que a nova regra invalida.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado target_path "Notas/.claude/CLAUDE.md", Quando checkVaultPath roda, Então lança PathError citando o ponto.
- Dado target_path "Notas/x.md" inexistente, Quando createNote roda sem overwrite, Então cria a nota.
- Dado target_path que aponta para nota existente, Quando createNote roda sem overwrite, Então lança o erro e o arquivo fica igual.
- Dado o mesmo caso com overwrite true, Quando createNote roda, Então substitui e overwritten é true.
- Dado um molde com collision_rule overwrite e sem target_path enviado, Quando createNote roda, Então substitui como antes.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere note-creator.ts.
- Não mude o modo de resolver target_path com {{ }} (resolveTargetPath).
- Não remova a checagem de configDir.

SE ALGO NÃO BATER
- Se checkVaultPath ou createNote estiverem diferentes do descrito, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (6.1 a 6.4), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 7: Remoção do código morto de append e upsert [Haiku 5.5 | esforço: médio]

**Objetivo:** remover os modos append e upsert_section que nada chama, com o arquivo note-merge.ts e os campos de frontmatter que só serviam a eles (item 8). Frontmatter antigo continua carregando, com aviso.
**Depende de:** Etapa 6
**Paralelizável com:** Etapa 4

**Arquivos**
- Excluir: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-merge.ts`
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-creator.ts` (remover planFor, o campo merge de NotePlan, e o método modify se ficar sem uso)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\types\template-types.ts` (WriteMode e WRITE_MODES; appendBlock, indexBlock e indexHeading de TemplateDefinition)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-parser.ts` (ler append_block, index_block e index_heading só para avisar que são ignorados)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts` (serializeTemplate e CreateTemplateArgs sem append_block, index_block, index_heading)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-validator.ts` (linhas que checam append_block e index_block)
- Alterar testes que importam note-merge ou usam esses campos (localize com Glob em tests\storage e tests\templates)
- Não tocar: os demais arquivos.

**Regras de implementação**
1. Antes de excluir, confirme por busca no módulo que nada além de note-merge.ts importa esse arquivo. Se algo mais importar, pare e relate.
2. Remover WriteMode e WRITE_MODES se nenhum outro arquivo do módulo os usar. Se usarem, remover os usos.
3. Remover de TemplateDefinition os campos appendBlock, indexBlock e indexHeading. Remover de template-creator.ts a escrita desses campos e os argumentos correspondentes em CreateTemplateArgs e na validação de create_template (appendBlock, indexBlock, indexHeading).
4. Compatibilidade: no template-parser, se o frontmatter de um molde tiver append_block, index_block ou index_heading, o molde continua carregando, mas com um problema de nível warning por chave: `<chave> is no longer used and was ignored.`
5. Em template-validator.ts, remover as checagens que dependem desses campos.
6. Não alterar o comportamento de create, preview e overwrite.

**Passos**
- **7.1 Confirmar o uso:** buscar no módulo as ocorrências de note-merge, planFor, modify, merge, WriteMode, WRITE_MODES, appendBlock, indexBlock, indexHeading, append_block, index_block, index_heading. Listar onde aparecem.
  - Verificação do sub-tópico: a lista de ocorrências está completa e os arquivos são os da seção Arquivos (ou outro, que você deve relatar antes de editar).
- **7.2 Remover os modos:** excluir note-merge.ts; retirar planFor, merge e modify de note-creator.ts; retirar WriteMode e WRITE_MODES.
  - Verificação: npm run typecheck → sem erros.
- **7.3 Remover os campos de template:** retirar appendBlock, indexBlock, indexHeading de template-types.ts, template-creator.ts e template-validator.ts; no parser, aplicar a regra 4.
  - Verificação: npm run typecheck → sem erros.
- **7.4 Testes:** remover testes de note-merge e de modos append/upsert; acrescentar um teste de que um molde com append_block carrega com o aviso da regra 4.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado o código do módulo, Quando se busca note-merge, planFor, WriteMode, appendBlock, indexBlock e indexHeading em src, Então não há ocorrência, exceto o texto do aviso de compatibilidade em template-parser.ts.
- Dado um molde com append_block no frontmatter, Quando parseTemplateNote roda, Então o molde carrega e há um problema de nível warning dizendo que a chave foi ignorada.
- Dado um molde sem essas chaves, Quando carrega, Então não há aviso sobre elas.
- Dado create_template e preview, Quando rodados como antes, Então o comportamento é o mesmo.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai remover código morto de um plugin do Obsidian em TypeScript: os modos de escrita append e upsert_section, que ninguém chama. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- Hoje existe src\storage\note-merge.ts (139 linhas, operações de texto para append e upsert_section). Ele é usado por src\storage\note-creator.ts (planFor com modos append e upsert_section, campo merge em NotePlan, método modify). Os tipos WriteMode e WRITE_MODES ficam em src\types\template-types.ts. O frontmatter de moldes aceita append_block, index_block e index_heading, lidos por src\templates\template-parser.ts, gravados por src\templates\template-creator.ts e checados por src\templates\template-validator.ts. Nenhum fluxo atual usa esses modos: a escrita de notas usa só create/incremental, overwrite ou error.
- Motivo (item 8 da auditoria): as peças existem mas nada as chama e não há teste. O motivo original deixou de existir, porque o Log Manager monta o log sozinho.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve o item 8.
- Etapas anteriores (feitas) alteraram template-creator.ts, template-service.ts e path-guard.ts. Não desfaça essas alterações.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo (exceto testes que importam o que foi removido).
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Excluir: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-merge.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-creator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\types\template-types.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-parser.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-creator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-validator.ts
- Alterar testes que importam note-merge ou usam appendBlock, indexBlock, indexHeading, WriteMode, planFor ou modify (localize com Glob em C:\Users\Trabalho\Documents\obsidian-ai-templates\tests)

SUB-TÓPICO 7.1: confirmar o uso
1. Procure no diretório C:\Users\Trabalho\Documents\obsidian-ai-templates\src e em tests as ocorrências de: note-merge, planFor, modify, merge, WriteMode, WRITE_MODES, appendBlock, indexBlock, indexHeading, append_block, index_block, index_heading. Use a busca de conteúdo do AI Ecosystem (ferramentas mcp__environment-variables__search e find) ou, se indisponível, Grep, com caminho absoluto.
2. Liste cada ocorrência (arquivo e linha). Se houver uso fora dos arquivos da seção Arquivos, pare e relate antes de editar.
- Verificação: a lista está completa.

SUB-TÓPICO 7.2: remover os modos de escrita
1. Excluir C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\note-merge.ts.
2. Em note-creator.ts: remover planFor, o campo merge de NotePlan, e o método modify se ficar sem uso. Remover imports que sobrarem. Manter plan, write, ensureFolder e a lógica de collision_rule.
3. Em template-types.ts: remover WriteMode e WRITE_MODES se nenhum outro arquivo usar.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 7.3: remover os campos de molde
1. Em template-types.ts, remover de TemplateDefinition os campos appendBlock, indexBlock e indexHeading, com o comentário correspondente.
2. Em template-creator.ts: remover de CreateTemplateArgs os campos appendBlock, indexBlock e indexHeading; remover o tratamento deles em create() (optionalText, a checagem de par indexBlock/indexHeading e a montagem em def); remover a escrita de append_block, index_block e index_heading em serializeTemplate.
3. Em template-validator.ts, remover as checagens das linhas que tratam append_block e index_block (e de qualquer outro campo que deixou de existir).
4. Em template-parser.ts: as chaves append_block, index_block e index_heading não viram mais campos. Se o frontmatter tiver alguma delas, acrescentar um problema de nível warning para cada chave encontrada, com a mensagem: `<chave> is no longer used and was ignored.` Não lançar erro. Remover a checagem de par indexBlock/indexHeading.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 7.4: testes
1. Remover testes de note-merge e dos modos append e upsert_section.
2. Acrescentar um teste: um molde com append_block no frontmatter é carregado (definition não nulo) e há problema warning com a mensagem da regra 7.3.4.
3. Não remover outros testes. Ajustar só o que depende dos campos removidos.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado o código de src, Quando se busca note-merge, planFor, WriteMode, appendBlock, indexBlock ou indexHeading, Então não há ocorrência, exceto a mensagem de aviso de compatibilidade no parser.
- Dado um molde com append_block no frontmatter, Quando parseTemplateNote roda, Então o molde carrega e o aviso aparece.
- Dado um molde sem essas chaves, Então não há aviso sobre elas.
- Dado create_template, preview e overwrite, Então o comportamento é o mesmo de antes.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não remova o modo create nem a collision_rule incremental, error ou overwrite.
- Não altere a escrita de anexos.
- Não remova campos de FieldSpec.

SE ALGO NÃO BATER
- Se houver uso de note-merge ou dos campos fora da lista, pare e relate antes de excluir.

RELATÓRIO FINAL
- Arquivos alterados e excluídos, com caminho absoluto.
- Lista de ocorrências encontradas no sub-tópico 7.1.
- Para cada sub-tópico (7.1 a 7.4), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 8: create_note com dry_run, resposta mínima e anexos sem órfãos [Haiku 5.5 | esforço: alto]

**Objetivo:** create_note_from_template ganha dry_run que valida sem gravar; a resposta de sucesso fica mínima; e, se a gravação da nota falhar, os anexos salvos nessa chamada vão para a lixeira (itens 9, 10 e 14).
**Depende de:** Etapa 7
**Paralelizável com:** Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts` (NoteArgs.dryRun; createNote: dry run e ordem de gravação com limpeza)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\vault-port.ts` e `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\obsidian-vault.ts` (método trash, se não existir; envia para a lixeira do Obsidian, nunca apaga de vez)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts` (noteResult; propriedade dry_run na tool; dry_run no body de POST /notes)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts` (runner: repassar dry_run)
- Alterar: testes de workflow de notas e de anexos (localize com Glob em tests\templates e tests\storage)
- Não tocar: src\storage\attachment-service.ts (a gravação de anexo continua igual; só a limpeza muda)

**Regras de implementação**
1. dry_run (boolean, opcional, padrão false). Com dry_run true, createNote: calcula o plano, faz o render de validação (withImages com save false, renderBody), e devolve sem gravar nota nem anexo e sem registrar atividade de criação. Erros de validação continuam sendo lançados.
2. noteResult devolve `{ path, renamed }`. Acrescentar `warnings` só quando houver aviso, e `overwritten: true` só quando a nota foi substituída. Não devolver mais success, file_path, requested_path, attachments. Vale para tool e rota /notes.
3. Ordem de gravação: anexos continuam sendo salvos antes da nota (o Markdown precisa dos caminhos). Se notes.write falhar, enviar para a lixeira (vault.trash) cada anexo salvo nesta chamada, antes de relançar o erro. Falha na lixeira não deve esconder o erro original (use try/catch interno).
4. Não criar nenhuma dependência nova.

**Passos**
- **8.1 dry_run:** acrescentar dryRun em NoteArgs; em createNote, depois do render de validação, retornar cedo se dryRun for true, com filePath = plan.path, requestedPath = requested, renamed, overwritten = plan.overwrite, attachments vazio, warnings. Propagar dry_run em templates-module.ts (tool, inputSchema e handler; body de POST /notes) e em template-index.ts (runner).
  - Verificação: npm run typecheck → sem erros.
- **8.2 Limpeza de anexos:** em createNote, envolver notes.write num try/catch; no catch, para cada item de real.saved, chamar vault.trash(path) dentro de try/catch próprio; relançar o erro original. Acrescentar trash a VaultPort e a obsidian-vault.ts se não existir, usando a API do Obsidian para enviar à lixeira (app.fileManager.trashFile ou equivalente já usado no arquivo).
  - Verificação: npm run typecheck → sem erros.
- **8.3 Resposta mínima:** reescrever noteResult conforme a regra 2 e ajustar quem o consome (tool, rota /notes e runner de template-index). Verifique se algum outro arquivo lê os campos antigos (success, file_path).
  - Verificação: npm run typecheck → sem erros.
- **8.4 Testes:** acrescentar os BDD abaixo e ajustar asserções que lêem os campos antigos.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado create_note_from_template com dry_run true e dados válidos, Quando roda, Então nenhum arquivo é criado e a resposta tem path e renamed.
- Dado dry_run true com imagem, Quando roda, Então nenhum anexo é gravado.
- Dado dry_run true com dado inválido, Quando roda, Então lança o mesmo erro de validação de antes.
- Dado uma criação normal sem aviso, Quando roda, Então a resposta é exatamente {path, renamed}.
- Dado uma criação com aviso, Quando roda, Então a resposta tem warnings além de path e renamed.
- Dado uma falha de notes.write depois de salvar um anexo, Quando createNote roda, Então vault.trash é chamado com o anexo salvo e o erro original é lançado.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai alterar a criação de notas por moldes em um plugin do Obsidian em TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- O método createNote de src\templates\template-service.ts: resolve o molde, valida os dados, calcula o caminho (notes.plan), faz um render de validação, salva anexos de imagem (withImages com save true, em src\storage\attachment-service.ts), renderiza o Markdown e grava com deps.notes.write. Depois devolve CreatedNote.
- Quem expõe createNote: a tool create_note_from_template e a rota POST /notes em src\tools\templates-module.ts, e o runner de template-index.ts. O resultado passa por noteResult (em templates-module.ts).
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve os itens 9, 10 e 14:
  - Item 9: falta um dry_run que valida e devolve só o caminho e os avisos, sem o Markdown inteiro.
  - Item 10: a resposta de sucesso traz success, requested_path, overwritten e listas vazias. Deve devolver só {path, renamed} (com warnings e overwritten só quando houver).
  - Item 14: se a gravação da nota falha, os anexos já salvos ficam órfãos. Deve haver limpeza.
- Etapas anteriores (feitas): path-guard.ts recusa segmentos com ponto; createNote exige overwrite true quando o agente passa target_path que substituiria nota; a limpeza de código morto (note-merge) foi feita. Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. A limpeza de anexo usa a lixeira do Obsidian (trash), nunca apagamento definitivo.
4. Não altere arquivos fora da lista abaixo.
5. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\templates\template-service.ts
- Alterar, se trash não existir: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\vault-port.ts e C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\obsidian-vault.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts
- Alterar testes: os de workflow de notas e de anexos (localize com Glob em tests\templates e tests\storage), e fakes de VaultPort se houver
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\storage\attachment-service.ts

SUB-TÓPICO 8.1: dry_run
1. Em template-service.ts, NoteArgs: acrescentar dryRun?: unknown.
2. Em createNote, depois de calcular plan e de chamar withImages com save false e renderBody (o render de validação já existente), se args.dryRun === true, retornar CreatedNote com: filePath = plan.path; requestedPath = requested; renamed = plan.path !== requested; overwritten = plan.overwrite; attachments = []; warnings = check.warnings. Não chamar notes.write, não salvar anexos e não chamar report("note-created") nem report("attachment-saved").
3. Se dryRun não for booleano nem undefined, lançar UserError: "dry_run" must be true or false.
4. Em templates-module.ts: na tool create_note_from_template, acrescentar em inputSchema a propriedade dry_run (boolean, descrição em inglês: "true validates and returns the target path and warnings, without writing anything."); no handler, passar dryRun: args.dry_run. Na rota POST /notes, passar dryRun: body.dry_run.
5. Em template-index.ts, no runner, passar dryRun: input.dry_run.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 8.2: limpeza de anexos
1. Verifique se VaultPort tem um método de lixeira (por exemplo trash). Se não tiver, acrescentar trash(path: string): Promise<void> à interface em vault-port.ts e implementar em obsidian-vault.ts usando a API do Obsidian para enviar o arquivo à lixeira (a mesma forma de acesso a arquivos já usada no arquivo). Não usar delete definitivo.
2. Em createNote, trocar a chamada deps.notes.write(plan, markdown, rule) por um try/catch: no catch, para cada item de real.saved, chamar deps.vault.trash(item.vaultPath) dentro de try/catch próprio (ignorar falha de limpeza); depois relançar o erro original.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 8.3: resposta mínima
1. Reescrever noteResult em templates-module.ts: retorna { path: result.filePath, renamed: result.renamed }. Acrescentar warnings somente se result.warnings tiver itens. Acrescentar overwritten: true somente se result.overwritten for true. Não devolver success, file_path, requested_path nem attachments.
2. Procure outros usos de noteResult e dos campos antigos (success, file_path, requested_path) no módulo (inclusive template-index.ts) e ajuste para o novo formato.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 8.4: testes
1. Acrescentar testes para os BDD abaixo.
2. Ajustar asserções que leem os campos antigos da resposta. Não remover testes.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado create_note_from_template com dry_run true e dados válidos, Quando roda, Então nenhum arquivo é criado e a resposta tem path e renamed.
- Dado dry_run true com imagem, Quando roda, Então nenhum anexo é gravado.
- Dado dry_run true com dado inválido, Quando roda, Então lança o mesmo erro de validação de antes.
- Dado criação normal sem aviso, Quando roda, Então a resposta é exatamente {path, renamed}.
- Dado criação com aviso, Quando roda, Então a resposta tem warnings.
- Dado falha de notes.write depois de salvar um anexo, Quando createNote roda, Então vault.trash é chamado com o caminho do anexo e o erro original é lançado.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere a forma de gravar anexos em attachment-service.ts.
- Não mude o caminho calculado (notes.plan) nem a regra de colisão.
- Não apague nada de forma definitiva.

SE ALGO NÃO BATER
- Se createNote ou noteResult estiverem diferentes do descrito, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (8.1 a 8.4), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 9: Tools expostas e instruções curtas [Haiku 5.5 | esforço: médio]

**Objetivo:** o módulo expõe só create_note_from_template e create_template como tools MCP; list_templates, get_template_schema e preview_template continuam como rotas REST; as instruções do módulo ficam curtas e apontam para o índice (itens 11 e 13).
**Depende de:** Etapa 8
**Paralelizável com:** Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts` (buildTools e MODULE_INSTRUCTIONS)
- Alterar testes em `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools` (localize com Glob)
- Não tocar: src\tools\template-index.ts (o índice continua igual nesta etapa)

**Regras de implementação**
1. buildTools passa a devolver exatamente duas tools: create_note_from_template e create_template. Remover de buildTools as definições de list_templates, get_template_schema e preview_template. Não apagar as funções de resultado que as rotas usam (listResult, previewResult, etc.).
2. buildRoutes continua com GET /templates, GET /templates/:id e POST /render, sem mudança de comportamento.
3. MODULE_INSTRUCTIONS vira duas frases curtas, em inglês, no mesmo estilo do arquivo, por exemplo: "Notes come from Markdown templates in the vault: find one with tools_find (kind template) and fill it with its tool id, or create a new template with create_template." (não mais de 300 caracteres no total).
4. Procure no repositório (src e tests) qualquer referência aos nomes list_templates, get_template_schema e preview_template em strings de tools. Ajuste só o que for referência de tool; não mexa nas rotas.

**Passos**
- **9.1 Tools:** reduzir buildTools a duas tools.
  - Verificação: npm run typecheck → sem erros.
- **9.2 Instruções:** trocar MODULE_INSTRUCTIONS pelo texto curto da regra 3.
  - Verificação: npm run typecheck → sem erros.
- **9.3 Testes:** ajustar testes que esperavam as cinco tools ou o texto antigo de instruções; acrescentar testes dos BDD abaixo.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado buildTools(...), Quando os nomes são listados, Então são exatamente create_note_from_template e create_template.
- Dado buildRoutes(...), Quando as rotas são listadas, Então GET /templates, GET /templates/:id e POST /render continuam existindo.
- Dado MODULE_INSTRUCTIONS, Quando medido, Então tem no máximo 300 caracteres e menciona tools_find.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai reduzir as tools MCP expostas por um plugin do Obsidian em TypeScript e encurtar as instruções do módulo. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- src\tools\templates-module.ts registra o módulo no AI Ecosystem: buildTools (tools MCP), buildRoutes (rotas REST) e MODULE_INSTRUCTIONS (texto enviado a cada sessão). Hoje buildTools tem cinco tools: list_templates, get_template_schema, create_note_from_template, preview_template e create_template.
- Os moldes também aparecem indexados por src\tools\template-index.ts (uma entrada por molde, usada por tools_find com kind template). Não altere o índice nesta etapa.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve os itens 11 e 13:
  - Item 11: list_templates, get_template_schema e preview_template duplicam o índice (tools_find com kind template cobre a listagem e o schema). Devem virar só rotas REST. Ficam como tools: create_note_from_template e create_template.
  - Item 13: as instruções do módulo têm cerca de 800 caracteres, repetem o CLAUDE.md e citam tools que não estão expostas. Devem ser duas frases apontando para tools_find com kind template.
- Etapas anteriores (feitas): create_note_from_template ganhou dry_run e overwrite; a resposta é {path, renamed}. Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Não altere as rotas REST nem o índice.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts
- Alterar testes: arquivos em C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools (localize com Glob)
- Não tocar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts

SUB-TÓPICO 9.1: tools
1. Em buildTools, deixar o array com exatamente duas definições: create_note_from_template e create_template, na mesma forma atual (nome, descrição, inputSchema, annotations, handler).
2. Remover as definições de list_templates, get_template_schema e preview_template de buildTools.
3. Não apagar funções auxiliares (listResult, previewResult, etc.) que as rotas usam. Se alguma função ficar sem uso, remova-a só se o compilador ou o lint apontar que não é usada; caso contrário mantenha.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 9.2: instruções
1. Trocar o valor de MODULE_INSTRUCTIONS por duas frases em inglês, com no máximo 300 caracteres no total, que digam: moldes ficam na pasta de moldes do cofre; achar um molde com tools_find (kind template) e preencher com a tool dele; criar molde novo com create_template. Use o mesmo estilo de texto do arquivo.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 9.3: testes
1. Procurar em tests\tools os testes que esperam as cinco tools ou o texto antigo de MODULE_INSTRUCTIONS, e atualizá-los.
2. Acrescentar testes: buildTools devolve exatamente create_note_from_template e create_template; buildRoutes ainda tem GET /templates, GET /templates/:id e POST /render; MODULE_INSTRUCTIONS tem até 300 caracteres e menciona tools_find.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado buildTools(...), Quando os nomes são listados, Então são exatamente create_note_from_template e create_template.
- Dado buildRoutes(...), Quando as rotas são listadas, Então GET /templates, GET /templates/:id e POST /render continuam existindo.
- Dado MODULE_INSTRUCTIONS, Quando medido, Então tem até 300 caracteres e menciona tools_find.

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não altere template-index.ts.
- Não mude o comportamento das rotas.
- Não remova create_note_from_template nem create_template.

SE ALGO NÃO BATER
- Se buildTools tiver nomes diferentes dos citados, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (9.1 a 9.3), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 10: Aprovação dos moldes e saída compacta [Haiku 5.5 | esforço: médio]

**Objetivo:** moldes com regra overwrite deixam de exigir aprovação, mantendo a marca de destrutivo; o índice declara data_file; e a saída das tools vem compacta (itens 12 e 15).
**Depende de:** Etapa 9
**Paralelizável com:** Etapa 4

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts` (buildTemplateIndexEntries: remover aprovacao; inputSchema com data_file)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts` (jsonResultOf: saída sem indentação)
- Alterar testes em `C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools` (localize com Glob)
- Não tocar: os demais arquivos.

**Regras de implementação**
1. Em buildTemplateIndexEntries, remover a linha que põe `entry.aprovacao = "obrigatoria"` para regra overwrite. Manter `annotations.destructiveHint` como está (true quando overwrite).
2. Em buildTemplateIndexEntries, o inputSchema de cada molde ganha a propriedade `data_file` (type string, description em inglês: "Optional vault-relative path of a JSON file with the data. Data keys win over the file.").
3. Em jsonResultOf, serializar com JSON.stringify(clean) sem espaços (sem indentação). Manter structuredContent como está.
4. O preview_template saiu das tools na etapa 9. A parte do item 15 que dizia que o preview estava marcado como cofre fica resolvida com essa remoção; não criar nada novo para isso. Os moldes com preview: true continuam com efeito "cofre" porque podem criar a nota.

**Passos**
- **10.1 Índice:** em template-index.ts, remover o aprovacao da regra overwrite e acrescentar data_file ao inputSchema de cada entrada.
  - Verificação: npm run typecheck → sem erros.
- **10.2 Saída compacta:** em templates-module.ts, jsonResultOf passa a serializar sem indentação.
  - Verificação: npm run typecheck → sem erros.
- **10.3 Testes:** ajustar o teste de aprovação e o de saída; acrescentar testes dos BDD abaixo.
  - Verificação: npm test → todos passam.

**BDD (estado esperado ao concluir)**
- Dado uma entrada de molde com regra overwrite, Quando buildTemplateIndexEntries roda, Então a entrada não tem aprovacao e annotations.destructiveHint é true.
- Dado uma entrada de molde, Quando inspecionada, Então inputSchema.properties tem data_file.
- Dado uma resposta de tool, Quando o texto de content é lido, Então é JSON sem quebras de linha nem indentação.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm test` → todos passam.
- `npm run lint` → sem erros.

**Prompt para o subagente**
```text
Você vai ajustar o índice de moldes e a saída das tools de um plugin do Obsidian em TypeScript. Execute só o que está descrito, na ordem dos sub-tópicos. Se algo não bater com o descrito, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd).
- src\tools\template-index.ts gera uma entrada do índice do AI Ecosystem por molde (buildTemplateIndexEntries). Hoje, quando a regra de colisão é overwrite, a entrada recebe aprovacao = "obrigatoria", então toda criação pede confirmação, mesmo sendo o uso normal desses moldes.
- O inputSchema dessas entradas não declara data_file, embora o runner aceite data_file.
- src\tools\templates-module.ts, função jsonResultOf, serializa o resultado com JSON.stringify(clean, null, 2), com indentação, o que gasta tokens.
- Objetivo geral da demanda: resolver 15 itens de auditoria. Esta etapa resolve os itens 12 e 15:
  - Item 12: dispensar aprovação obrigatória nos moldes feitos para sobrescrever.
  - Item 15: saída compacta e data_file declarado no schema. (A parte do preview marcado como cofre já foi resolvida na etapa 9, porque preview_template saiu das tools.)
- Etapas anteriores (feitas): as tools foram reduzidas a duas na etapa 9. Não desfaça isso.
- Idioma: código e comentários em inglês.
- Comandos, a partir de C:\Users\Trabalho\Documents\obsidian-ai-templates: npm run typecheck, npm test, npm run lint.

REGRAS GLOBAIS
1. Não adicione dependências. Não altere package.json, package-lock.json, manifest.json, versions.json.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Não altere arquivos fora da lista abaixo.
4. Cite caminhos sempre absolutos nos relatórios.

ARQUIVOS
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\template-index.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-templates\src\tools\templates-module.ts (somente jsonResultOf)
- Alterar testes: arquivos em C:\Users\Trabalho\Documents\obsidian-ai-templates\tests\tools (localize com Glob)

SUB-TÓPICO 10.1: índice
1. Em buildTemplateIndexEntries, remover a linha que atribui entry.aprovacao = "obrigatoria" para regra overwrite. Manter annotations.destructiveHint = (rule === "overwrite") como está.
2. No inputSchema de cada entrada de molde (objeto com type object e properties: data, target_path, preview), acrescentar a propriedade data_file: { type: "string", description: "Optional vault-relative path of a JSON file with the data. Data keys win over the file." }.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 10.2: saída compacta
1. Em templates-module.ts, função jsonResultOf: trocar JSON.stringify(clean, null, 2) por JSON.stringify(clean). Não mudar structuredContent.
- Verificação: npm run typecheck → sem erros.

SUB-TÓPICO 10.3: testes
1. Ajustar o teste que esperava aprovacao em moldes de regra overwrite (agora não deve haver aprovacao).
2. Acrescentar os testes dos BDD abaixo.
- Verificação: npm test → todos passam.

CRITÉRIOS (BDD)
- Dado uma entrada de molde com regra overwrite, Quando buildTemplateIndexEntries roda, Então a entrada não tem aprovacao e annotations.destructiveHint é true.
- Dado uma entrada de molde, Quando inspecionada, Então inputSchema.properties tem data_file.
- Dado uma resposta de tool, Quando o texto de content é lido, Então é JSON sem indentação (não contém quebra de linha).

VERIFICAÇÃO FINAL
- npm run typecheck → sem erros.
- npm test → todos passam.
- npm run lint → sem erros.

NÃO FAÇA
- Não remova annotations.destructiveHint.
- Não altere structuredContent.
- Não mude outros campos do índice.

SE ALGO NÃO BATER
- Se buildTemplateIndexEntries ou jsonResultOf estiverem diferentes do descrito, pare e relate.

RELATÓRIO FINAL
- Arquivos alterados com caminho absoluto.
- Para cada sub-tópico (10.1 a 10.3), PASSOU ou FALHOU.
- Saída real dos três comandos.
- Desvios e dúvidas.
```

## Etapa 11: Verificação geral [Haiku 5.5 | esforço: alto]

**Objetivo:** confirmar que as dez etapas anteriores entregaram os 15 itens, que o projeto compila, passa no lint e nos testes, e que o build gera o bundle sem erro. Não corrige código: se algo falhar, para e relata.
**Depende de:** Etapas 1 a 10
**Paralelizável com:** nenhuma

**Arquivos**
- Ler: todos os arquivos alterados nas etapas 1 a 10 (liste-os com git não é necessário; use a lista que cada etapa informou no relatório, se disponível, ou a busca por nomes da seção Arquivos).
- Alterar: nenhum arquivo de código. O build gera `C:\Users\Trabalho\Documents\obsidian-ai-templates\main.js` e `C:\Users\Trabalho\Documents\obsidian-ai-templates\styles.css`; isso é esperado.
- Não tocar: .deploy-target, package.json, manifest.json.

**Regras de implementação**
1. Não corrija código nesta etapa. Se uma verificação falhar, registre o erro e pare.
2. Não rode npm run deploy. Não faça commit, push ou merge.
3. Para cada um dos 15 itens, cite a evidência (arquivo e função) da mudança ou o motivo de não estar coberto.

**Passos**
- **11.1 Compilação e lint:** rodar typecheck e lint.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros; `npm run lint` → sem erros.
- **11.2 Testes:** rodar a suíte.
  - Verificação do sub-tópico: `npm test` → todos passam; registre o número de testes.
- **11.3 Build:** rodar o build de produção.
  - Verificação do sub-tópico: `npm run build` → termina sem erro e gera main.js e styles.css.
- **11.4 Conferência dos 15 itens:** usar buscas por texto para confirmar as mudanças-chave:
  - "Call get_template_schema" não aparece em src.
  - "note-merge", "planFor", "WriteMode", "appendBlock" não aparecem em src, exceto a mensagem de aviso do parser.
  - "aprovacao" não é atribuída para regra overwrite em template-index.ts.
  - "JSON.stringify(clean, null, 2)" não aparece em templates-module.ts.
  - list_templates, get_template_schema e preview_template não aparecem como nome de tool em buildTools.
  - Relate cada item de 1 a 15 com PASSOU ou NÃO VERIFICADO.

**BDD (estado esperado ao concluir)**
- Dado o repositório após as etapas 1 a 10, Quando `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` rodam, Então todos terminam sem erro.
- Dado o código de src, Quando as buscas da sub-etapa 11.4 rodam, Então cada uma confirma o que está descrito.
- Dado os 15 itens, Quando conferidos, Então cada um tem evidência de código ou está marcado como NÃO VERIFICADO com motivo.

**Verificação** (a partir de `C:\Users\Trabalho\Documents\obsidian-ai-templates`)
- `npm run typecheck` → sem erros.
- `npm run lint` → sem erros.
- `npm test` → todos passam.
- `npm run build` → sem erro e main.js gerado.

**Prompt para o subagente**
```text
Você vai fazer a verificação final de um plugin do Obsidian em TypeScript depois de dez etapas de alteração. Você não corrige código: só roda os comandos, confere as mudanças e relata. Se algo falhar, pare e relate.

CONTEXTO DO PROJETO
- Raiz do projeto: C:\Users\Trabalho\Documents\obsidian-ai-templates (plugin AI Templates 1.2.0; TypeScript; vitest; eslint-plugin-obsidianmd; esbuild).
- Demanda: implementar 15 itens de auditoria do módulo. As etapas 1 a 10 já alteraram o código: schema e erro (1 e 5), campos lista e objeto (6), molde nota_livre (2 parte módulo), instalação e create_template (3 e 4), target_path (7), remoção de append e upsert (8), create_note com dry_run e resposta mínima (9, 10, 14), tools e instruções (11 e 13), aprovação e saída compacta (12 e 15). O item 2 parte do hook foi feito em outro repositório (C:\Users\Trabalho\Documents\obsidian-ai-ecosystem) e não é verificado aqui.
- Idioma: código e comentários em inglês.

REGRAS GLOBAIS
1. Não corrija código. Não altere arquivo de código.
2. Não rode npm run deploy. Não crie nem altere .deploy-target. Não faça commit, push ou merge.
3. Cite caminhos sempre absolutos.

ARQUIVOS
- Não alterar nenhum arquivo de código. O build gera main.js e styles.css na raiz do módulo; isso é esperado.

SUB-TÓPICO 11.1: compilação e lint
1. A partir de C:\Users\Trabalho\Documents\obsidian-ai-templates, rodar: npm run typecheck
2. Rodar: npm run lint
- Verificação: ambos sem erros. Se algum falhar, pare e relate a saída.

SUB-TÓPICO 11.2: testes
1. Rodar: npm test
- Verificação: todos passam. Relatar o total de testes e o número de falhas.

SUB-TÓPICO 11.3: build
1. Rodar: npm run build
- Verificação: termina sem erro e gera main.js e styles.css na raiz.

SUB-TÓPICO 11.4: conferência dos 15 itens
Rode as buscas abaixo em C:\Users\Trabalho\Documents\obsidian-ai-templates\src (use a busca de conteúdo do AI Ecosystem, mcp__environment-variables__search, com pasta absoluta; se indisponível, Grep com caminho absoluto):
1. "Call get_template_schema" → esperado: nenhuma ocorrência.
2. "note-merge", "planFor", "WriteMode", "appendBlock" → esperado: nenhuma ocorrência, exceto a mensagem de compatibilidade em template-parser.ts.
3. "aprovacao" → esperado: nenhuma atribuição para regra overwrite em template-index.ts.
4. "JSON.stringify(clean, null, 2)" → esperado: nenhuma ocorrência.
5. "list_templates", "get_template_schema", "preview_template" dentro de buildTools em templates-module.ts → esperado: não aparecem como nome de tool.
6. Confirme em template-service.ts a presença de dryRun, da exigência de overwrite e da limpeza de anexos com trash.
7. Confirme em path-guard.ts a recusa de segmentos com ponto.
8. Confirme em template-creator.ts a recusa de nota comum e o campo replaced.
9. Confirme em main.ts o uso de shouldInstallStarter.
- Relate, para cada um dos 15 itens, PASSOU ou NÃO VERIFICADO, com o arquivo e a função como evidência.

CRITÉRIOS (BDD)
- Dado o repositório após as etapas 1 a 10, Quando npm run typecheck, npm run lint, npm test e npm run build rodam, Então todos terminam sem erro.
- Dado o código de src, Quando as buscas do 11.4 rodam, Então cada uma confirma o que está descrito.

NÃO FAÇA
- Não corrija código.
- Não rode deploy.

SE ALGO NÃO BATER
- Se qualquer comando falhar, pare, cole a saída de erro e não tente corrigir.

RELATÓRIO FINAL
- Para cada comando (typecheck, lint, test, build), a saída real (últimas linhas com contagens) e PASSOU ou FALHOU.
- Tabela dos 15 itens com PASSOU ou NÃO VERIFICADO e a evidência.
- Desvios e dúvidas.
```

## 6. Critérios de aceite finais (BDD)
- Dado o módulo após as etapas 1 a 10, Quando `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` rodam em `C:\Users\Trabalho\Documents\obsidian-ai-templates`, Então todos terminam sem erro.
- Dado um agente que chama create_note_from_template sem campo obrigatório, Quando recebe o erro, Então o erro traz os campos obrigatórios e um exemplo, sem mandar chamar get_template_schema (itens 1 e 5).
- Dado um campo list declarado com example, Quando o schema é lido, Então o exemplo usa esse formato (item 6).
- Dado um Write de arquivo novo em alvo `*.md` de molde, Quando o hook do AI Ecosystem avalia, Então é aviso, não bloqueio (item 2, repositório externo).
- Dado a pasta de moldes com notas, Quando o plugin carrega, Então não instala os starters automaticamente (item 3).
- Dado create_template sobre nota comum, Quando roda, Então recusa e o arquivo fica igual; sobre molde existente, devolve replaced true (item 4).
- Dado target_path dentro de pasta oculta, Quando roda, Então é recusado; sobre nota existente, exige overwrite true (item 7).
- Dado o código, Quando buscado, Então note-merge e os modos append e upsert não existem mais (item 8).
- Dado create_note_from_template com dry_run, Quando roda, Então não grava nada; sem dry_run, a resposta é {path, renamed} (itens 9 e 10).
- Dado falha na gravação da nota após salvar anexo, Quando roda, Então o anexo vai para a lixeira (item 14).
- Dado buildTools, Quando listado, Então tem create_note_from_template e create_template; as instruções têm até 300 caracteres (itens 11 e 13).
- Dado um molde de regra overwrite, Quando indexado, Então não tem aprovacao obrigatória; a saída é compacta e o índice declara data_file (itens 12 e 15).

## 7. Ações do usuário
Estas ações não são etapas de código. Só o usuário pode fazê-las.
- **Gravar installStarterPack: false no data.json do plugin AI Templates no cofre**, antes do deploy (item 3). Caminho provável: `C:\Users\Trabalho\Documents\Cofre\.obsidian\plugins\<id do plugin>\data.json`. Confirmar o id e o caminho antes de editar, porque o cofre não é alterado pelo plano.
- **Fazer o deploy do módulo** (`npm run deploy` no repositório, com `.deploy-target` do usuário) e recarregar o plugin no Obsidian, depois das etapas 1 a 11.
- **Copiar o hook atualizado do AI Ecosystem para o cofre** (`C:\Users\Trabalho\Documents\Cofre\.claude\ai-ecosystem\hooks\`), ou fazer o deploy do AI Ecosystem, depois da etapa 4 (item 2).
- **Apagar os dois moldes de uso único** criados para contornar o bloqueio do hook, quando a regra nova estiver instalada (item 2). O usuário precisa dizer quais são.
- **Revisar a regra de overwrite com target_path** (item 7) antes do deploy, se a interpretação da etapa 6 não corresponder ao que ele quer (ver dúvidas).
