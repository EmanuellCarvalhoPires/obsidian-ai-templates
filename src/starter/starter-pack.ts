// Starter kit: generic templates the plugin installs by itself in the templates folder, so a
// new user has something to use at once. Every template exists in English and Portuguese with
// the same template_id (and the same file name); the language is picked at install time.
import { normalizePath } from "obsidian";
import type { Lang } from "../i18n";
import { NoteCreator } from "../storage/note-creator";
import type { VaultPort } from "../storage/vault-port";

export interface StarterTemplate {
  /** Stable template_id; the note is saved as `<templates folder>/<id>.md`. */
  id: string;
  /** Full text of the template note (frontmatter and body), per language. */
  content: Record<Lang, string>;
}

const NOTA_REUNIAO_PT = `---
template_id: nota_reuniao
description: "Nota de reunião com participantes, pauta, decisões, tabela de ações (ação, responsável, prazo) e próximos passos."
target_path: "Reuniões/{{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}-{{ titulo | slug }}.md"
collision_rule: incremental
fields:
  titulo:
    type: string
    required: true
    description: "Título curto da reunião, por exemplo 'Alinhamento do projeto Alfa'."
  data:
    type: date
    required: false
    description: "Data da reunião (AAAA-MM-DD). Se vazia, usa o dia de hoje."
  participantes:
    type: list
    required: false
    description: "Nomes dos participantes, um por item."
  pauta:
    type: list
    required: false
    description: "Assuntos tratados, um por item."
  decisoes:
    type: list
    required: false
    description: "Decisões tomadas, uma por item, em frases completas."
  acoes:
    type: table
    required: false
    columns: [Ação, Responsável, Prazo]
    description: "Ações combinadas: o que fazer, quem faz e até quando (data ou texto livre)."
  proximos_passos:
    type: string
    required: false
    description: "Resumo curto do que acontece depois da reunião, incluindo a data da próxima, se houver."
  notas:
    type: string
    required: false
    description: "Anotações livres, contexto e detalhes que não cabem nos outros campos."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - reuniao
data: {{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ titulo }}

- **Data:** {{ data | default: 'now' | date_fmt: 'DD/MM/YYYY' }}
{%- if participantes.size > 0 %}
- **Participantes:** {{ participantes | join: ", " }}
{%- endif %}
{%- if pauta.size > 0 %}

## Pauta

{{ pauta | bullet_list }}
{%- endif %}
{%- if decisoes.size > 0 %}

## Decisões

{{ decisoes | bullet_list }}
{%- endif %}
{%- if acoes %}

## Ações

{{ acoes | markdown_table }}
{%- endif %}
{%- if proximos_passos %}

## Próximos passos

{{ proximos_passos }}
{%- endif %}
{%- if notas %}

## Notas

{{ notas }}
{%- endif %}
`;

const NOTA_REUNIAO_EN = `---
template_id: nota_reuniao
description: "Meeting note with attendees, agenda, decisions, an action table (action, owner, due date) and next steps."
target_path: "Meetings/{{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}-{{ title | slug }}.md"
collision_rule: incremental
fields:
  title:
    type: string
    required: true
    description: "Short meeting title, for example 'Project Alfa sync'."
  date:
    type: date
    required: false
    description: "Meeting date (YYYY-MM-DD). Defaults to today."
  attendees:
    type: list
    required: false
    description: "Names of the people who attended, one per item."
  agenda:
    type: list
    required: false
    description: "Topics discussed, one per item."
  decisions:
    type: list
    required: false
    description: "Decisions made, one per item, as complete sentences."
  actions:
    type: table
    required: false
    columns: [Action, Owner, Due]
    description: "Agreed actions: what to do, who does it and by when (a date or free text)."
  next_steps:
    type: string
    required: false
    description: "Short summary of what happens after the meeting, including the next meeting date if any."
  notes:
    type: string
    required: false
    description: "Free notes, context and details that do not fit the other fields."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - meeting
date: {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ title }}

- **Date:** {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if attendees.size > 0 %}
- **Attendees:** {{ attendees | join: ", " }}
{%- endif %}
{%- if agenda.size > 0 %}

## Agenda

{{ agenda | bullet_list }}
{%- endif %}
{%- if decisions.size > 0 %}

## Decisions

{{ decisions | bullet_list }}
{%- endif %}
{%- if actions %}

## Actions

{{ actions | markdown_table }}
{%- endif %}
{%- if next_steps %}

## Next steps

{{ next_steps }}
{%- endif %}
{%- if notes %}

## Notes

{{ notes }}
{%- endif %}
`;

const NOTA_DIARIA_PT = `---
template_id: nota_diaria
description: "Nota diária com foco do dia, agenda (hora e compromisso), tarefas como checklist, registro do dia e, opcionalmente, gratidão e aprendizado."
target_path: "Diário/{{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}.md"
collision_rule: incremental
fields:
  data:
    type: date
    required: false
    description: "Dia da nota (AAAA-MM-DD). Se vazio, usa o dia de hoje."
  foco_do_dia:
    type: list
    required: false
    description: "As 1 a 3 coisas mais importantes do dia, uma por item."
  agenda:
    type: table
    required: false
    columns: [Hora, Compromisso]
    description: "Compromissos com horário, por exemplo 09:00 e 'Reunião com o time'."
  tarefas:
    type: list
    required: false
    description: "Tarefas do dia, uma por item. Cada uma vira um checkbox aberto (- [ ])."
  registro:
    type: string
    required: false
    description: "Texto livre sobre como o dia foi: o que aconteceu, ideias, ocorrências."
  gratidao:
    type: string
    required: false
    description: "Opcional: algo pelo qual você é grato hoje."
  aprendizado:
    type: string
    required: false
    description: "Opcional: o que você aprendeu hoje."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - diaria
data: {{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ data | default: 'now' | date_fmt: 'DD/MM/YYYY' }}
{%- if foco_do_dia.size > 0 %}

## Foco do dia

{{ foco_do_dia | bullet_list }}
{%- endif %}
{%- if agenda %}

## Agenda

{{ agenda | markdown_table }}
{%- endif %}
{%- if tarefas.size > 0 %}

## Tarefas
{% for tarefa in tarefas %}
- [ ] {{ tarefa }}{% endfor %}
{%- endif %}
{%- if registro %}

## Registro

{{ registro }}
{%- endif %}
{%- if gratidao %}

## Gratidão

{{ gratidao }}
{%- endif %}
{%- if aprendizado %}

## Aprendizado

{{ aprendizado }}
{%- endif %}
`;

const NOTA_DIARIA_EN = `---
template_id: nota_diaria
description: "Daily note with the day's focus, a schedule (time and commitment), tasks as a checklist, a journal entry and, optionally, gratitude and learning."
target_path: "Daily/{{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}.md"
collision_rule: incremental
fields:
  date:
    type: date
    required: false
    description: "Day of the note (YYYY-MM-DD). Defaults to today."
  focus:
    type: list
    required: false
    description: "The 1 to 3 most important things of the day, one per item."
  schedule:
    type: table
    required: false
    columns: [Time, Commitment]
    description: "Commitments with a time, for example 09:00 and 'Team sync'."
  tasks:
    type: list
    required: false
    description: "Tasks for the day, one per item. Each one becomes an open checkbox (- [ ])."
  journal:
    type: string
    required: false
    description: "Free text about the day: what happened, ideas, events."
  gratitude:
    type: string
    required: false
    description: "Optional: something you are grateful for today."
  learning:
    type: string
    required: false
    description: "Optional: what you learned today."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - daily
date: {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if focus.size > 0 %}

## Focus

{{ focus | bullet_list }}
{%- endif %}
{%- if schedule %}

## Schedule

{{ schedule | markdown_table }}
{%- endif %}
{%- if tasks.size > 0 %}

## Tasks
{% for task in tasks %}
- [ ] {{ task }}{% endfor %}
{%- endif %}
{%- if journal %}

## Journal

{{ journal }}
{%- endif %}
{%- if gratitude %}

## Gratitude

{{ gratitude }}
{%- endif %}
{%- if learning %}

## Learning

{{ learning }}
{%- endif %}
`;

const REVISAO_SEMANAL_PT = `---
template_id: revisao_semanal
description: "Revisão semanal com conquistas, pendências, bloqueios, aprendizados, prioridades da próxima semana e, opcionalmente, uma nota de energia."
target_path: "Revisões semanais/{% now 'YYYY-MM-DD' %}-{{ semana | slug }}.md"
collision_rule: incremental
fields:
  semana:
    type: string
    required: true
    description: "Identificação da semana, por exemplo 'Semana 44 de 2026' ou '26/10 a 01/11'."
  conquistas:
    type: list
    required: false
    description: "O que foi concluído ou avançou na semana, um por item."
  pendencias:
    type: list
    required: false
    description: "O que ficou por fazer, um por item."
  bloqueios:
    type: string
    required: false
    description: "O que travou o trabalho e por quê. Texto livre."
  aprendizados:
    type: string
    required: false
    description: "O que a semana ensinou: o que repetir, o que mudar."
  prioridades_proxima_semana:
    type: list
    required: false
    description: "Prioridades para a semana seguinte, em ordem de importância, um por item."
  nota_de_energia:
    type: string
    required: false
    description: "Opcional: como foi a sua energia e disposição na semana, e o que a afetou."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - revisao-semanal
data: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# Revisão semanal: {{ semana }}
{%- if conquistas.size > 0 %}

## Conquistas

{{ conquistas | bullet_list }}
{%- endif %}
{%- if pendencias.size > 0 %}

## Pendências

{{ pendencias | bullet_list }}
{%- endif %}
{%- if bloqueios %}

## Bloqueios

{{ bloqueios }}
{%- endif %}
{%- if aprendizados %}

## Aprendizados

{{ aprendizados }}
{%- endif %}
{%- if prioridades_proxima_semana.size > 0 %}

## Prioridades da próxima semana
{% for prioridade in prioridades_proxima_semana %}
{{ forloop.index }}. {{ prioridade }}{% endfor %}
{%- endif %}
{%- if nota_de_energia %}

## Nota de energia

{{ nota_de_energia }}
{%- endif %}
`;

const REVISAO_SEMANAL_EN = `---
template_id: revisao_semanal
description: "Weekly review with achievements, open items, blockers, lessons learned, next week's priorities and, optionally, an energy note."
target_path: "Weekly Reviews/{% now 'YYYY-MM-DD' %}-{{ week | slug }}.md"
collision_rule: incremental
fields:
  week:
    type: string
    required: true
    description: "Label of the week, for example 'Week 44 of 2026' or 'Oct 26 to Nov 1'."
  achievements:
    type: list
    required: false
    description: "What was finished or moved forward this week, one per item."
  open_items:
    type: list
    required: false
    description: "What was left undone, one per item."
  blockers:
    type: string
    required: false
    description: "What blocked the work and why. Free text."
  lessons:
    type: string
    required: false
    description: "What the week taught you: what to repeat, what to change."
  next_week_priorities:
    type: list
    required: false
    description: "Priorities for next week in order of importance, one per item."
  energy_note:
    type: string
    required: false
    description: "Optional: how your energy and mood were this week, and what affected them."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - weekly-review
date: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# Weekly review: {{ week }}
{%- if achievements.size > 0 %}

## Achievements

{{ achievements | bullet_list }}
{%- endif %}
{%- if open_items.size > 0 %}

## Open items

{{ open_items | bullet_list }}
{%- endif %}
{%- if blockers %}

## Blockers

{{ blockers }}
{%- endif %}
{%- if lessons %}

## Lessons learned

{{ lessons }}
{%- endif %}
{%- if next_week_priorities.size > 0 %}

## Next week's priorities
{% for priority in next_week_priorities %}
{{ forloop.index }}. {{ priority }}{% endfor %}
{%- endif %}
{%- if energy_note %}

## Energy note

{{ energy_note }}
{%- endif %}
`;

const NOTA_PESSOA_PT = `---
template_id: nota_pessoa
description: "Ficha de uma pessoa de contato: empresa, cargo, e-mail, telefone, canal preferido, como se conheceram, último contato e assuntos pendentes."
target_path: "Pessoas/{{ nome | safe_filename }}.md"
collision_rule: incremental
fields:
  nome:
    type: string
    required: true
    description: "Nome completo da pessoa, por exemplo 'Maria Exemplo'. Vira o nome do arquivo."
  empresa:
    type: string
    required: false
    description: "Empresa ou organização, por exemplo 'Acme'."
  cargo:
    type: string
    required: false
    description: "Cargo ou papel da pessoa."
  email:
    type: string
    required: false
    description: "Endereço de e-mail."
  telefone:
    type: string
    required: false
    description: "Telefone, com DDD."
  canal_preferido:
    type: string
    required: false
    description: "Canal de contato preferido, por exemplo 'WhatsApp' ou 'e-mail'."
  como_conheci:
    type: string
    required: false
    description: "Onde, quando e por quem vocês se conheceram."
  ultimo_contato:
    type: date
    required: false
    description: "Data do último contato (AAAA-MM-DD)."
  assuntos_pendentes:
    type: list
    required: false
    description: "Assuntos em aberto com a pessoa, um por item."
  notas:
    type: string
    required: false
    description: "Anotações livres: preferências, contexto, lembretes."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - pessoa
{%- if ultimo_contato %}
ultimo_contato: {{ ultimo_contato | date_fmt: 'YYYY-MM-DD' }}
{%- endif %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ nome }}
{%- if empresa %}

- **Empresa:** {{ empresa }}
{%- endif %}
{%- if cargo %}
- **Cargo:** {{ cargo }}
{%- endif %}
{%- if email %}
- **E-mail:** {{ email }}
{%- endif %}
{%- if telefone %}
- **Telefone:** {{ telefone }}
{%- endif %}
{%- if canal_preferido %}
- **Canal preferido:** {{ canal_preferido }}
{%- endif %}
{%- if ultimo_contato %}
- **Último contato:** {{ ultimo_contato | date_fmt: 'DD/MM/YYYY' }}
{%- endif %}
{%- if como_conheci %}

## Como conheci

{{ como_conheci }}
{%- endif %}
{%- if assuntos_pendentes.size > 0 %}

## Assuntos pendentes

{{ assuntos_pendentes | bullet_list }}
{%- endif %}
{%- if notas %}

## Notas

{{ notas }}
{%- endif %}
`;

const NOTA_PESSOA_EN = `---
template_id: nota_pessoa
description: "Contact card for a person: company, role, email, phone, preferred channel, how you met, last contact and open topics."
target_path: "People/{{ name | safe_filename }}.md"
collision_rule: incremental
fields:
  name:
    type: string
    required: true
    description: "Full name of the person, for example 'Maria Example'. Becomes the file name."
  company:
    type: string
    required: false
    description: "Company or organization, for example 'Acme'."
  role:
    type: string
    required: false
    description: "Job title or role of the person."
  email:
    type: string
    required: false
    description: "Email address."
  phone:
    type: string
    required: false
    description: "Phone number, with country code."
  preferred_channel:
    type: string
    required: false
    description: "Preferred contact channel, for example 'WhatsApp' or 'email'."
  how_we_met:
    type: string
    required: false
    description: "Where, when and through whom you met."
  last_contact:
    type: date
    required: false
    description: "Date of the last contact (YYYY-MM-DD)."
  open_topics:
    type: list
    required: false
    description: "Open topics with this person, one per item."
  notes:
    type: string
    required: false
    description: "Free notes: preferences, context, reminders."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - person
{%- if last_contact %}
last_contact: {{ last_contact | date_fmt: 'YYYY-MM-DD' }}
{%- endif %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ name }}
{%- if company %}

- **Company:** {{ company }}
{%- endif %}
{%- if role %}
- **Role:** {{ role }}
{%- endif %}
{%- if email %}
- **Email:** {{ email }}
{%- endif %}
{%- if phone %}
- **Phone:** {{ phone }}
{%- endif %}
{%- if preferred_channel %}
- **Preferred channel:** {{ preferred_channel }}
{%- endif %}
{%- if last_contact %}
- **Last contact:** {{ last_contact | date_fmt: 'YYYY-MM-DD' }}
{%- endif %}
{%- if how_we_met %}

## How we met

{{ how_we_met }}
{%- endif %}
{%- if open_topics.size > 0 %}

## Open topics

{{ open_topics | bullet_list }}
{%- endif %}
{%- if notes %}

## Notes

{{ notes }}
{%- endif %}
`;

const REGISTRO_DECISAO_PT = `---
template_id: registro_decisao
description: "Registro de decisão (ADR simples): contexto, decisão, alternativas consideradas (opção, prós, contras), consequências, decisores e status."
target_path: "Decisões/{{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}-{{ titulo | slug }}.md"
collision_rule: incremental
fields:
  titulo:
    type: string
    required: true
    description: "Título curto da decisão, no formato 'Usar X para Y'."
  status:
    type: string
    required: false
    default: Proposta
    description: "Situação da decisão: Proposta, Aceita ou Substituída."
  contexto:
    type: string
    required: true
    description: "O problema ou a situação que exigiu a decisão, com as forças em jogo."
  decisao:
    type: string
    required: true
    description: "O que foi decidido, em voz ativa ('Vamos usar...')."
  alternativas:
    type: table
    required: false
    columns: [Opção, Prós, Contras]
    description: "Alternativas consideradas, inclusive a escolhida, com prós e contras de cada uma."
  consequencias:
    type: string
    required: false
    description: "O que muda por causa da decisão: ganhos, custos e riscos aceitos."
  data:
    type: date
    required: false
    description: "Data da decisão (AAAA-MM-DD). Se vazia, usa o dia de hoje."
  decisores:
    type: list
    required: false
    description: "Quem participou da decisão, um nome por item."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - decisao
data: {{ data | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ titulo }}

- **Status:** {{ status | default: 'Proposta' }}
- **Data:** {{ data | default: 'now' | date_fmt: 'DD/MM/YYYY' }}
{%- if decisores.size > 0 %}
- **Decisores:** {{ decisores | join: ", " }}
{%- endif %}

## Contexto

{{ contexto }}

## Decisão

{{ decisao }}
{%- if alternativas %}

## Alternativas consideradas

{{ alternativas | markdown_table }}
{%- endif %}
{%- if consequencias %}

## Consequências

{{ consequencias }}
{%- endif %}
`;

const REGISTRO_DECISAO_EN = `---
template_id: registro_decisao
description: "Decision record (simple ADR): context, decision, alternatives considered (option, pros, cons), consequences, decision makers and status."
target_path: "Decisions/{{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}-{{ title | slug }}.md"
collision_rule: incremental
fields:
  title:
    type: string
    required: true
    description: "Short title of the decision, such as 'Use X for Y'."
  status:
    type: string
    required: false
    default: Proposed
    description: "State of the decision: Proposed, Accepted or Superseded."
  context:
    type: string
    required: true
    description: "The problem or situation that called for the decision, with the forces at play."
  decision:
    type: string
    required: true
    description: "What was decided, in active voice ('We will use...')."
  alternatives:
    type: table
    required: false
    columns: [Option, Pros, Cons]
    description: "Alternatives considered, including the chosen one, with the pros and cons of each."
  consequences:
    type: string
    required: false
    description: "What changes because of the decision: gains, costs and accepted risks."
  date:
    type: date
    required: false
    description: "Date of the decision (YYYY-MM-DD). Defaults to today."
  decision_makers:
    type: list
    required: false
    description: "Who took part in the decision, one name per item."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - decision
date: {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ title }}

- **Status:** {{ status | default: 'Proposed' }}
- **Date:** {{ date | default: 'now' | date_fmt: 'YYYY-MM-DD' }}
{%- if decision_makers.size > 0 %}
- **Decision makers:** {{ decision_makers | join: ", " }}
{%- endif %}

## Context

{{ context }}

## Decision

{{ decision }}
{%- if alternatives %}

## Alternatives considered

{{ alternatives | markdown_table }}
{%- endif %}
{%- if consequences %}

## Consequences

{{ consequences }}
{%- endif %}
`;

const RECEITA_PROCESSO_PT = `---
template_id: receita_processo
description: "Receita de processo passo a passo (objetivo, quando usar, pré-requisitos, passos numerados, verificação, problemas comuns), escrita para virar skill ou fluxo automatizado."
target_path: "Processos/{{ nome | slug }}.md"
collision_rule: incremental
fields:
  nome:
    type: string
    required: true
    description: "Nome do processo, começando com um verbo, por exemplo 'Publicar o relatório mensal'."
  objetivo:
    type: string
    required: true
    description: "O resultado que o processo entrega, em uma ou duas frases."
  quando_usar:
    type: string
    required: false
    description: "Situações em que o processo deve ser executado, e quando não deve. Serve de gatilho para IA e pessoas."
  pre_requisitos:
    type: list
    required: false
    description: "O que precisa existir antes de começar (acessos, arquivos, informações), um por item."
  passos:
    type: list
    required: true
    description: "Passos na ordem de execução, um por item, cada um uma ação clara e verificável."
  verificacao:
    type: string
    required: false
    description: "Como confirmar que o processo deu certo: o que conferir ao final."
  problemas_comuns:
    type: table
    required: false
    columns: [Problema, Causa provável, Solução]
    description: "Falhas frequentes, a causa provável e como resolver cada uma."
  responsavel:
    type: string
    required: false
    description: "Pessoa ou time dono do processo, por exemplo 'Time Alfa'."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - processo
  - receita
data: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ nome }}
{%- if responsavel %}

**Responsável:** {{ responsavel }}
{%- endif %}

## Objetivo

{{ objetivo }}
{%- if quando_usar %}

## Quando usar

{{ quando_usar }}
{%- endif %}
{%- if pre_requisitos.size > 0 %}

## Pré-requisitos

{{ pre_requisitos | bullet_list }}
{%- endif %}

## Passos
{% for passo in passos %}
{{ forloop.index }}. {{ passo }}{% endfor %}
{%- if verificacao %}

## Verificação

{{ verificacao }}
{%- endif %}
{%- if problemas_comuns %}

## Problemas comuns

{{ problemas_comuns | markdown_table }}
{%- endif %}
`;

const RECEITA_PROCESSO_EN = `---
template_id: receita_processo
description: "Step-by-step process recipe (goal, when to use, prerequisites, numbered steps, verification, common problems), written so it can later become a skill or automated flow."
target_path: "Processes/{{ name | slug }}.md"
collision_rule: incremental
fields:
  name:
    type: string
    required: true
    description: "Name of the process, starting with a verb, for example 'Publish the monthly report'."
  goal:
    type: string
    required: true
    description: "The result the process delivers, in one or two sentences."
  when_to_use:
    type: string
    required: false
    description: "Situations in which to run the process, and when not to. Works as the trigger for AI and people."
  prerequisites:
    type: list
    required: false
    description: "What must exist before starting (access, files, information), one per item."
  steps:
    type: list
    required: true
    description: "Steps in execution order, one per item, each a clear and checkable action."
  verification:
    type: string
    required: false
    description: "How to confirm the process worked: what to check at the end."
  common_problems:
    type: table
    required: false
    columns: [Problem, Likely cause, Fix]
    description: "Frequent failures, the likely cause and how to fix each one."
  owner:
    type: string
    required: false
    description: "Person or team that owns the process, for example 'Team Alfa'."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - process
  - recipe
date: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# {{ name }}
{%- if owner %}

**Owner:** {{ owner }}
{%- endif %}

## Goal

{{ goal }}
{%- if when_to_use %}

## When to use

{{ when_to_use }}
{%- endif %}
{%- if prerequisites.size > 0 %}

## Prerequisites

{{ prerequisites | bullet_list }}
{%- endif %}

## Steps
{% for step in steps %}
{{ forloop.index }}. {{ step }}{% endfor %}
{%- if verification %}

## Verification

{{ verification }}
{%- endif %}
{%- if common_problems %}

## Common problems

{{ common_problems | markdown_table }}
{%- endif %}
`;

const BRIEFING_IA_PT = `---
template_id: briefing_ia
description: "Briefing para colar numa conversa nova com a IA: tema, objetivo, contexto, o que já foi tentado, restrições, entregável esperado e material de apoio."
target_path: "Briefings/{% now 'YYYY-MM-DD' %}-{{ tema | slug }}.md"
collision_rule: incremental
fields:
  tema:
    type: string
    required: true
    description: "Assunto do briefing em poucas palavras, por exemplo 'Proposta comercial para a Acme'."
  objetivo:
    type: string
    required: true
    description: "O que você quer alcançar com a ajuda da IA, em uma ou duas frases."
  contexto:
    type: string
    required: false
    description: "Contexto necessário para quem não viu nada até aqui: situação, pessoas, histórico relevante."
  o_que_ja_foi_tentado:
    type: string
    required: false
    description: "O que já foi tentado ou descartado, e por quê, para a IA não repetir."
  restricoes:
    type: list
    required: false
    description: "Limites a respeitar (prazo, tom, tecnologia, orçamento, o que não fazer), um por item."
  entregavel_esperado:
    type: string
    required: true
    description: "O que a IA deve entregar e em que formato (tamanho, estrutura, idioma)."
  material_de_apoio:
    type: list
    required: false
    description: "Links, caminhos de arquivos ou notas de apoio, um por item."
  up:
    type: string
    required: false
    description: "Nome da nota-pai (propriedade up), por exemplo um MOC. Deixe vazio para não criar a propriedade."
---

---
tags:
  - briefing
  - ia
data: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# Briefing: {{ tema }}

Leia este briefing por inteiro antes de responder. Se algo essencial estiver faltando, pergunte antes de começar.

## Objetivo

{{ objetivo }}
{%- if contexto %}

## Contexto

{{ contexto }}
{%- endif %}
{%- if o_que_ja_foi_tentado %}

## O que já foi tentado

{{ o_que_ja_foi_tentado }}
{%- endif %}
{%- if restricoes.size > 0 %}

## Restrições

{{ restricoes | bullet_list }}
{%- endif %}

## Entregável esperado

{{ entregavel_esperado }}
{%- if material_de_apoio.size > 0 %}

## Material de apoio

{{ material_de_apoio | bullet_list }}
{%- endif %}
`;

const BRIEFING_IA_EN = `---
template_id: briefing_ia
description: "Briefing to paste into a new AI conversation: topic, goal, context, what was already tried, constraints, expected deliverable and reference material."
target_path: "AI Briefings/{% now 'YYYY-MM-DD' %}-{{ topic | slug }}.md"
collision_rule: incremental
fields:
  topic:
    type: string
    required: true
    description: "Subject of the briefing in a few words, for example 'Sales proposal for Acme'."
  goal:
    type: string
    required: true
    description: "What you want to achieve with the AI's help, in one or two sentences."
  context:
    type: string
    required: false
    description: "Context for someone who has seen nothing so far: situation, people, relevant history."
  already_tried:
    type: string
    required: false
    description: "What was already tried or ruled out, and why, so the AI does not repeat it."
  constraints:
    type: list
    required: false
    description: "Limits to respect (deadline, tone, technology, budget, what not to do), one per item."
  expected_deliverable:
    type: string
    required: true
    description: "What the AI must deliver and in which format (length, structure, language)."
  reference_material:
    type: list
    required: false
    description: "Links, file paths or notes to consult, one per item."
  up:
    type: string
    required: false
    description: "Name of the parent note (up property), for example a MOC. Leave empty to skip the property."
---

---
tags:
  - briefing
  - ai
date: {% now 'YYYY-MM-DD' %}
{%- if up %}
up: "{{ up | wikilink }}"
{%- endif %}
---

# Briefing: {{ topic }}

Read this briefing in full before answering. If something essential is missing, ask before you start.

## Goal

{{ goal }}
{%- if context %}

## Context

{{ context }}
{%- endif %}
{%- if already_tried %}

## What was already tried

{{ already_tried }}
{%- endif %}
{%- if constraints.size > 0 %}

## Constraints

{{ constraints | bullet_list }}
{%- endif %}

## Expected deliverable

{{ expected_deliverable }}
{%- if reference_material.size > 0 %}

## Reference material

{{ reference_material | bullet_list }}
{%- endif %}
`;

/** The starter kit. Ids and file names are stable: new ids added in a later version are installed on the next load. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  { id: "nota_reuniao", content: { pt: NOTA_REUNIAO_PT, en: NOTA_REUNIAO_EN } },
  { id: "nota_diaria", content: { pt: NOTA_DIARIA_PT, en: NOTA_DIARIA_EN } },
  { id: "revisao_semanal", content: { pt: REVISAO_SEMANAL_PT, en: REVISAO_SEMANAL_EN } },
  { id: "nota_pessoa", content: { pt: NOTA_PESSOA_PT, en: NOTA_PESSOA_EN } },
  { id: "registro_decisao", content: { pt: REGISTRO_DECISAO_PT, en: REGISTRO_DECISAO_EN } },
  { id: "receita_processo", content: { pt: RECEITA_PROCESSO_PT, en: RECEITA_PROCESSO_EN } },
  { id: "briefing_ia", content: { pt: BRIEFING_IA_PT, en: BRIEFING_IA_EN } },
];

export const STARTER_TEMPLATE_IDS: readonly string[] = STARTER_TEMPLATES.map((tpl) => tpl.id);

export interface InstallStarterPackOptions {
  vault: VaultPort;
  /** Templates folder (vault-relative). */
  folder: string;
  /** Ids installed in an earlier run: they are not created again, even if the file is gone. */
  installedIds: readonly string[];
  locale: Lang;
}

const TEMPLATE_ID_LINE = /^template_id:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m;
const FRONTMATTER_HEAD = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---/;

/** template_id of every template note already in the folder, whatever its file name. */
async function existingTemplateIds(vault: VaultPort, folder: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const path of vault.listMarkdown(folder)) {
    try {
      const head = FRONTMATTER_HEAD.exec(await vault.readText(path));
      const id = head ? TEMPLATE_ID_LINE.exec(head[1] ?? "")?.[1] : undefined;
      if (id) ids.add(id);
    } catch {
      // An unreadable note cannot be a reason to skip or to write the starter template.
    }
  }
  return ids;
}

/**
 * Writes the starter templates that are not installed yet, in the language `locale`. Never
 * overwrites: a template whose file exists, or whose template_id is already used by another note
 * of the folder, is left alone. Returns the ids it wrote.
 */
export async function installStarterPack(options: InstallStarterPackOptions): Promise<string[]> {
  const { vault, locale } = options;
  const folder = normalizePath(options.folder.trim());
  const dir = folder === "/" ? "" : folder;
  const pending = STARTER_TEMPLATES.filter((tpl) => !options.installedIds.includes(tpl.id));
  if (pending.length === 0) return [];

  const used = await existingTemplateIds(vault, dir);
  const notes = new NoteCreator(vault);
  const installed: string[] = [];
  for (const tpl of pending) {
    const path = `${dir === "" ? "" : `${dir}/`}${tpl.id}.md`;
    if (vault.kind(path) !== undefined || used.has(tpl.id)) continue;
    await notes.ensureFolder(dir);
    await vault.createText(path, tpl.content[locale]);
    installed.push(tpl.id);
  }
  return installed;
}
