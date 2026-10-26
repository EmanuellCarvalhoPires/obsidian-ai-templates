// Interface strings in English and Portuguese. Picks the language of the Obsidian interface.
import { getLanguage } from "obsidian";

export type Lang = "en" | "pt";

export interface StringTable {
  en: Record<string, string>;
  pt: Record<string, string>;
}

const strings: StringTable = {
  en: {
    // Core / Ribbon / Status bar / Commands
    "core.ribbon.manager": "AI Templates manager",
    "core.cmd.openManager": "Open template manager and tester",
    "core.cmd.reload": "Reload templates",
    "core.status.connected": "AI Templates ({count})",
    "core.status.waiting": "AI Templates: waiting",
    "core.status.disconnected": "AI Templates: offline",
    "core.status.missing": "AI Templates: no AI Ecosystem",
    "core.status.incompatible": "AI Templates: incompatible",
    "core.status.aria": "Open AI Templates manager",
    "core.notice.reloaded": "Reloaded {count} template(s).",
    "core.notice.reloadedProblems": "Reloaded {count} template(s) ({problems} problem(s)).",
    "core.notice.saveFailed": "Could not save the AI Templates settings.",
    "core.notice.starterCreated": "Created starter template at {path}.",
    "core.cmd.reinstallStarter": "Reinstall starter templates",
    "core.notice.starterPackInstalled": "Installed {count} starter template(s) in {folder}.",
    "core.notice.starterPackNothing": "All starter templates are already in {folder}.",
    "core.notice.starterPackFailed": "Could not install the starter templates.",

    // Dependency modal
    "dependency.title": "AI Ecosystem is required",
    "dependency.body":
      "AI Templates needs the AI Ecosystem plugin. It provides the single local server and MCP endpoint that AI agents use to list, preview and render your templates.",
    "dependency.standby":
      "AI Templates stays in standby until the AI Ecosystem is installed and enabled, and connects automatically as soon as it starts.",
    "dependency.install": "Install and enable AI Ecosystem",
    "dependency.openPage": "Open plugin page",
    "dependency.installed": "AI Ecosystem installed and enabled.",
    "dependency.failed": "Could not install automatically. Opening the plugin page.",

    // Settings tab - Ecosystem connection
    "settings.ecosystem.heading": "AI Ecosystem connection",
    "settings.ecosystem.connected": "Connected to AI Ecosystem",
    "settings.ecosystem.connectedDesc": "MCP tools, HTTP routes and the templates service are registered.",
    "settings.ecosystem.waiting": "Waiting for AI Ecosystem",
    "settings.ecosystem.waitingDesc": "AI Ecosystem is installed and starting. AI Templates will register automatically.",
    "settings.ecosystem.disconnected": "Disconnected from AI Ecosystem",
    "settings.ecosystem.disconnectedDesc": "AI Ecosystem was unloaded or disabled. AI Templates will reconnect when it returns.",
    "settings.ecosystem.missing": "AI Ecosystem is not installed or not enabled",
    "settings.ecosystem.missingDesc": "Install or enable the AI Ecosystem plugin to expose templates to AI agents.",
    "settings.ecosystem.incompatible": "Incompatible with the installed AI Ecosystem",
    "settings.ecosystem.incompatibleDesc": "{reason}",
    "settings.ecosystem.install": "Install and enable",
    "settings.ecosystem.enable": "Enable AI Ecosystem",
    "settings.ecosystem.openManager": "Open template manager",
    "settings.ecosystem.openManagerDesc": "Inspect loaded templates, create a starter template and test rendering with live JSON.",
    "settings.ecosystem.openManagerBtn": "Open manager",

    // Settings tab - Templates and rendering
    "settings.general.heading": "Templates and rendering",
    "settings.general.folder": "Templates folder",
    "settings.general.folderDesc": "Vault-relative folder where Markdown template notes are stored.",
    "settings.general.folderPlaceholder": "Templates/AI",
    "settings.general.collision": "Default collision rule",
    "settings.general.collisionDesc": "What to do when the target note already exists and the template does not set collision_rule.",
    "settings.general.collision.incremental": "Incremental (Note 1.md, Note 2.md...)",
    "settings.general.collision.overwrite": "Overwrite existing note",
    "settings.general.collision.error": "Return an error",
    "settings.general.classicLinks": "Use classic Markdown links for images",
    "settings.general.classicLinksDesc": "Insert ![alt](path) instead of ![[file|size]] wikilink embeds.",
    "settings.general.starterPack": "Install starter templates",
    "settings.general.starterPackDesc":
      "Adds a kit of generic templates (meeting, daily note, weekly review, person, decision, process, AI briefing) to the templates folder. Existing notes are never overwritten, and a template you delete is not created again.",
    "settings.general.starterReinstall": "Reinstall starter templates",
    "settings.general.starterReinstallDesc": "Restores the starter templates that are missing from the templates folder, even ones you deleted.",
    "settings.general.starterReinstallBtn": "Reinstall",
    "settings.general.base64Limit": "Maximum Base64 image size (MB)",
    "settings.general.base64LimitDesc": "Largest Base64 image payload accepted from an agent (0.1 to 50 MB). Local file paths are always preferred.",

    // Settings tab - Allowed local image folders
    "settings.folders.heading": "Allowed local image folders",
    "settings.folders.desc":
      "Absolute disk folders from which AI agents may attach local image files. Use {tmpdir} for the system temporary directory.",
    "settings.folders.empty": "No folders allowed. Local file paths will be refused until you add a folder.",
    "settings.folders.add": "Add folder",
    "settings.folders.addPlaceholder": "{tmpdir}/screenshots or /absolute/path",
    "settings.folders.remove": "Remove folder",
    "settings.folders.reset": "Restore defaults",
    "settings.folders.resetDesc": "Restores {tmpdir} and {tmpdir}/claude.",
    "settings.folders.duplicate": "This folder is already in the list.",
    "settings.folders.invalid": "Enter a non-empty folder path or {tmpdir}.",

    // Settings tab - Loaded templates status
    "settings.status.heading": "Loaded templates",
    "settings.status.summary": "{count} valid template(s) loaded from {folder}.",
    "settings.status.reload": "Reload",
    "settings.status.none": "No template notes found in this folder yet.",
    "settings.status.noProblems": "No errors or warnings found in template notes.",
    "settings.status.problemsCount": "{count} problem(s) found in template notes:",
    "settings.status.levelError": "Error",
    "settings.status.levelWarning": "Warning",

    // Template manager modal
    "modal.title": "AI Templates manager",
    "modal.reload": "Reload",
    "modal.createStarter": "Create starter template",
    "modal.openNote": "Open template note",
    "modal.templatesHeading": "Templates ({count})",
    "modal.empty": "No templates found in {folder}. Create a starter template to try the engine.",
    "modal.problemsHeading": "Template note issues ({count})",
    "modal.meta.id": "Template ID",
    "modal.meta.targetPath": "Target path",
    "modal.meta.targetPathNone": "Provided by caller",
    "modal.meta.collisionRule": "Collision rule",
    "modal.meta.sourcePath": "Note path",
    "modal.meta.fields": "Declared fields ({count})",
    "modal.meta.noFields": "No fields declared in frontmatter.",
    "modal.meta.required": "required",
    "modal.meta.optional": "optional",
    "modal.meta.columns": "columns: {columns}",
    "modal.tester.heading": "Interactive tester",
    "modal.tester.channel": "Render channel",
    "modal.tester.channelObsidian": "Obsidian (Markdown)",
    "modal.tester.channelTelegram": "Telegram (HTML)",
    "modal.tester.targetPath": "Target path override (optional)",
    "modal.tester.targetPathPlaceholder": "Leave empty to use the template target_path",
    "modal.tester.jsonLabel": "Input data (JSON)",
    "modal.tester.fillExample": "Reset example JSON",
    "modal.tester.renderBtn": "Render preview",
    "modal.tester.resolvedPath": "Resolved target path: {path}",
    "modal.tester.noResolvedPath": "Resolved target path: (none)",
    "modal.tester.warnings": "Warnings ({count})",
    "modal.tester.outputHeading": "Rendered output",
    "modal.tester.outputEmpty": "Click Render preview to test this template.",
  },
  pt: {
    // Core / Ribbon / Status bar / Commands
    "core.ribbon.manager": "Gerenciador do AI Templates",
    "core.cmd.openManager": "Abrir gerenciador e testador de templates",
    "core.cmd.reload": "Recarregar templates",
    "core.status.connected": "AI Templates ({count})",
    "core.status.waiting": "AI Templates: aguardando",
    "core.status.disconnected": "AI Templates: desconectado",
    "core.status.missing": "AI Templates: sem AI Ecosystem",
    "core.status.incompatible": "AI Templates: incompatível",
    "core.status.aria": "Abrir gerenciador do AI Templates",
    "core.notice.reloaded": "{count} template(s) recarregado(s).",
    "core.notice.reloadedProblems": "{count} template(s) recarregado(s) ({problems} problema(s)).",
    "core.notice.saveFailed": "Não foi possível salvar as configurações do AI Templates.",
    "core.notice.starterCreated": "Template de exemplo criado em {path}.",
    "core.cmd.reinstallStarter": "Reinstalar templates iniciais",
    "core.notice.starterPackInstalled": "{count} template(s) inicial(is) instalado(s) em {folder}.",
    "core.notice.starterPackNothing": "Todos os templates iniciais já estão em {folder}.",
    "core.notice.starterPackFailed": "Não foi possível instalar os templates iniciais.",

    // Dependency modal
    "dependency.title": "O plugin AI Ecosystem é necessário",
    "dependency.body":
      "O AI Templates precisa do plugin AI Ecosystem. Ele fornece o servidor local único e o endpoint MCP que os agentes de IA usam para listar, pré-visualizar e renderizar seus templates.",
    "dependency.standby":
      "O AI Templates fica em espera até que o AI Ecosystem seja instalado e ativado, e conecta automaticamente assim que ele inicia.",
    "dependency.install": "Instalar e ativar o AI Ecosystem",
    "dependency.openPage": "Abrir página do plugin",
    "dependency.installed": "AI Ecosystem instalado e ativado.",
    "dependency.failed": "Não foi possível instalar automaticamente. Abrindo a página do plugin.",

    // Settings tab - Ecosystem connection
    "settings.ecosystem.heading": "Conexão com o AI Ecosystem",
    "settings.ecosystem.connected": "Conectado ao AI Ecosystem",
    "settings.ecosystem.connectedDesc": "Tools MCP, rotas HTTP e o serviço templates estão registrados.",
    "settings.ecosystem.waiting": "Aguardando o AI Ecosystem",
    "settings.ecosystem.waitingDesc": "O AI Ecosystem está instalado e iniciando. O AI Templates será registrado automaticamente.",
    "settings.ecosystem.disconnected": "Desconectado do AI Ecosystem",
    "settings.ecosystem.disconnectedDesc": "O AI Ecosystem foi descarregado ou desativado. O AI Templates reconectará quando ele voltar.",
    "settings.ecosystem.missing": "O AI Ecosystem não está instalado ou ativado",
    "settings.ecosystem.missingDesc": "Instale ou ative o plugin AI Ecosystem para expor os templates aos agentes de IA.",
    "settings.ecosystem.incompatible": "Incompatível com o AI Ecosystem instalado",
    "settings.ecosystem.incompatibleDesc": "{reason}",
    "settings.ecosystem.install": "Instalar e ativar",
    "settings.ecosystem.enable": "Ativar AI Ecosystem",
    "settings.ecosystem.openManager": "Abrir gerenciador de templates",
    "settings.ecosystem.openManagerDesc": "Inspecione os templates carregados, crie um template de exemplo e teste a renderização com JSON ao vivo.",
    "settings.ecosystem.openManagerBtn": "Abrir gerenciador",

    // Settings tab - Templates and rendering
    "settings.general.heading": "Templates e renderização",
    "settings.general.folder": "Pasta de templates",
    "settings.general.folderDesc": "Pasta relativa ao cofre onde ficam as notas Markdown de template.",
    "settings.general.folderPlaceholder": "Templates/AI",
    "settings.general.collision": "Regra de colisão padrão",
    "settings.general.collisionDesc": "O que fazer quando a nota de destino já existir e o template não definir collision_rule.",
    "settings.general.collision.incremental": "Incremental (Nota 1.md, Nota 2.md...)",
    "settings.general.collision.overwrite": "Sobrescrever a nota existente",
    "settings.general.collision.error": "Retornar um erro",
    "settings.general.classicLinks": "Usar links Markdown clássicos para imagens",
    "settings.general.classicLinksDesc": "Insere ![alt](caminho) em vez de embeds wikilink ![[arquivo|tamanho]].",
    "settings.general.starterPack": "Instalar templates iniciais",
    "settings.general.starterPackDesc":
      "Adiciona à pasta de templates um kit de templates genéricos (reunião, nota diária, revisão semanal, pessoa, decisão, processo, briefing para IA). Notas existentes nunca são sobrescritas, e um template que você apagar não é criado de novo.",
    "settings.general.starterReinstall": "Reinstalar templates iniciais",
    "settings.general.starterReinstallDesc": "Restaura os templates iniciais que faltam na pasta de templates, inclusive os que você apagou.",
    "settings.general.starterReinstallBtn": "Reinstalar",
    "settings.general.base64Limit": "Tamanho máximo de imagem em Base64 (MB)",
    "settings.general.base64LimitDesc": "Maior imagem em Base64 aceita de um agente (0.1 a 50 MB). Caminhos de arquivos locais são sempre preferidos.",

    // Settings tab - Allowed local image folders
    "settings.folders.heading": "Pastas permitidas para imagens locais",
    "settings.folders.desc":
      "Pastas absolutas do disco das quais agentes de IA podem anexar arquivos locais de imagem. Use {tmpdir} para a pasta temporária do sistema.",
    "settings.folders.empty": "Nenhuma pasta permitida. Caminhos de arquivos locais serão recusados até você adicionar uma pasta.",
    "settings.folders.add": "Adicionar pasta",
    "settings.folders.addPlaceholder": "{tmpdir}/screenshots ou /caminho/absoluto",
    "settings.folders.remove": "Remover pasta",
    "settings.folders.reset": "Restaurar padrões",
    "settings.folders.resetDesc": "Restaura {tmpdir} e {tmpdir}/claude.",
    "settings.folders.duplicate": "Esta pasta já está na lista.",
    "settings.folders.invalid": "Informe um caminho de pasta não vazio ou {tmpdir}.",

    // Settings tab - Loaded templates status
    "settings.status.heading": "Templates carregados",
    "settings.status.summary": "{count} template(s) válido(s) carregado(s) de {folder}.",
    "settings.status.reload": "Recarregar",
    "settings.status.none": "Nenhuma nota de template encontrada nesta pasta ainda.",
    "settings.status.noProblems": "Nenhum erro ou aviso encontrado nas notas de template.",
    "settings.status.problemsCount": "{count} problema(s) encontrado(s) nas notas de template:",
    "settings.status.levelError": "Erro",
    "settings.status.levelWarning": "Aviso",

    // Template manager modal
    "modal.title": "Gerenciador do AI Templates",
    "modal.reload": "Recarregar",
    "modal.createStarter": "Criar template de exemplo",
    "modal.openNote": "Abrir nota do template",
    "modal.templatesHeading": "Templates ({count})",
    "modal.empty": "Nenhum template encontrado em {folder}. Crie um template de exemplo para testar o motor.",
    "modal.problemsHeading": "Problemas nas notas de template ({count})",
    "modal.meta.id": "ID do template",
    "modal.meta.targetPath": "Caminho de destino",
    "modal.meta.targetPathNone": "Informado na chamada",
    "modal.meta.collisionRule": "Regra de colisão",
    "modal.meta.sourcePath": "Caminho da nota",
    "modal.meta.fields": "Campos declarados ({count})",
    "modal.meta.noFields": "Nenhum campo declarado no frontmatter.",
    "modal.meta.required": "obrigatório",
    "modal.meta.optional": "opcional",
    "modal.meta.columns": "colunas: {columns}",
    "modal.tester.heading": "Testador interativo",
    "modal.tester.channel": "Canal de renderização",
    "modal.tester.channelObsidian": "Obsidian (Markdown)",
    "modal.tester.channelTelegram": "Telegram (HTML)",
    "modal.tester.targetPath": "Sobrescrever target_path (opcional)",
    "modal.tester.targetPathPlaceholder": "Deixe vazio para usar o target_path do template",
    "modal.tester.jsonLabel": "Dados de entrada (JSON)",
    "modal.tester.fillExample": "Restaurar JSON de exemplo",
    "modal.tester.renderBtn": "Renderizar prévia",
    "modal.tester.resolvedPath": "Caminho de destino resolvido: {path}",
    "modal.tester.noResolvedPath": "Caminho de destino resolvido: (nenhum)",
    "modal.tester.warnings": "Avisos ({count})",
    "modal.tester.outputHeading": "Resultado renderizado",
    "modal.tester.outputEmpty": "Clique em Renderizar prévia para testar este template.",
  },
};

let forced: Lang | undefined;

/** For tests. */
export function setLanguage(lang: Lang | undefined): void {
  forced = lang;
}

export function currentLanguage(): Lang {
  if (forced) return forced;
  try {
    return getLanguage().toLowerCase().startsWith("pt") ? "pt" : "en";
  } catch {
    return "en";
  }
}

/** Translates a key, replacing {name} with vars.name. Falls back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = currentLanguage();
  let text = strings[lang][key] ?? strings.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

/** All keys, for tests that check both languages have the same keys. */
export function allStrings(): StringTable {
  return strings;
}
