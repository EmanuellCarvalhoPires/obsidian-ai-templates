// What AI Templates registers in the AI Ecosystem: MCP tools, REST routes and instructions
// (plan section 7). Handlers only translate arguments and results; the work is in TemplateService.
import type { HubCallContext, HubRequest, HubResponse, HubRoute, HubTool, HubToolResult } from "../ecosystem/types";
import { HTTP_STATUS_BY_CODE, UserError, errorMessage } from "../errors";
import type { TemplateService } from "../templates/template-service";
import type { TemplateLoader } from "../templates/template-loader";

export const MODULE_ID = "ai-templates";

export const MODULE_INSTRUCTIONS =
  "AI Templates fills Markdown templates stored in the vault. Call list_templates, then get_template_schema to see the fields and an example, " +
  "then create_note_from_template (or preview_template to check the result without saving). Tables go as { headers, rows } and the plugin aligns and escapes them, so never build Markdown tables by hand. " +
  "For images send the absolute path of a local file (cheap) or the name of a file already in the vault; base64 costs many tokens and has a size limit. " +
  "Errors name the exact problem: fix the input and call again.";

type Args = Record<string, unknown>;

function jsonResult(structured: Record<string, unknown>): HubToolResult {
  return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
}

function errorResult(err: unknown): HubToolResult {
  const message = err instanceof UserError ? err.message : `Unexpected error: ${errorMessage(err)}`;
  if (!(err instanceof UserError)) console.debug("[AI Templates] Tool failed", err);
  return { content: [{ type: "text", text: message }], isError: true };
}

function errorResponse(err: unknown): HubResponse {
  if (err instanceof UserError) return { status: HTTP_STATUS_BY_CODE[err.code], body: { error: err.message } };
  console.debug("[AI Templates] Route failed", err);
  return { status: 500, body: { error: `Unexpected error: ${errorMessage(err)}` } };
}

function asRecord(value: unknown): Args {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Args) : {};
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

async function listResult(loader: TemplateLoader, service: TemplateService): Promise<Record<string, unknown>> {
  const templates = await service.listTemplates();
  const { problems } = await loader.load();
  const out: Record<string, unknown> = { templates };
  if (problems.length > 0) {
    out.problems = problems.map((p) => ({ level: p.level, template_id: p.templateId, note: p.path, message: p.message }));
  }
  return out;
}

function noteResult(result: Awaited<ReturnType<TemplateService["createNote"]>>): Record<string, unknown> {
  return {
    success: true,
    file_path: result.filePath,
    requested_path: result.requestedPath,
    renamed: result.renamed,
    overwritten: result.overwritten,
    attachments: result.attachments.map((a) => ({ field: a.field, path: a.vaultPath, source: a.source, bytes: a.bytes })),
    warnings: result.warnings,
  };
}

function previewResult(result: Awaited<ReturnType<TemplateService["preview"]>>): Record<string, unknown> {
  return { markdown: result.markdown, target_path: result.targetPath, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const DATA_PROPERTY = {
  type: "object",
  description:
    'Values of the template fields, keyed by field name (see get_template_schema). Tables: { "headers": [...], "rows": [[...]] } or a list of objects. Images: absolute path of a local file (preferred), name of a file already in the vault, or base64 (many tokens).',
  additionalProperties: true,
};

const FIELD_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["string", "number", "boolean", "date", "table", "image", "list", "object"] },
    required: { type: "boolean", description: "Default false." },
    description: { type: "string", description: "Shown to agents that fill the template." },
    columns: { type: "array", items: { type: "string" }, description: "Column order of a table field." },
    default: { description: "Value used when the field is missing." },
  },
  required: ["type"],
  additionalProperties: false,
};

export function buildTools(service: TemplateService, loader: TemplateLoader): HubTool[] {
  const run = async (fn: () => Promise<HubToolResult>): Promise<HubToolResult> => {
    try {
      return await fn();
    } catch (err) {
      return errorResult(err);
    }
  };

  return [
    {
      name: "list_templates",
      title: "List templates",
      description:
        "Lists the Markdown templates available in the vault (id and description). Call this first to pick a template, then call get_template_schema. " +
        "If a template you expect is missing, the response lists problems found in the template notes.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: (_args: Args, _ctx: HubCallContext) => run(async () => jsonResult(await listResult(loader, service))),
    },
    {
      name: "get_template_schema",
      title: "Get template schema",
      description:
        "Returns the fields of a template (type, required, description, table columns), the target_path and collision rule, usage notes and a JSON example of the data argument. " +
        "Fill the example and pass it to create_note_from_template or preview_template.",
      inputSchema: {
        type: "object",
        properties: { template_id: { type: "string", description: "Id from list_templates." } },
        required: ["template_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: (args: Args) =>
        run(async () => {
          const schema = await service.getSchema(String(args.template_id ?? ""));
          return jsonResult(schema as unknown as Record<string, unknown>);
        }),
    },
    {
      name: "create_note_from_template",
      title: "Create note from template",
      description:
        "Fills a template with data and saves the note in the vault. Tables are aligned and escaped for you; images are saved in the vault's attachment folder and embedded. " +
        "The note goes to the template's target_path unless you send target_path. If the file exists, the template's collision rule decides (incremental adds a number, overwrite replaces, error refuses). " +
        "Images: send the absolute path of a local file instead of base64 whenever you can, because base64 costs many tokens. " +
        "For long data you can write a JSON file into the vault and send data_file (data keys win over the file).",
      inputSchema: {
        type: "object",
        properties: {
          template_id: { type: "string", description: "Id from list_templates." },
          data: DATA_PROPERTY,
          data_file: { type: "string", description: "Optional vault-relative path of a JSON file with the data." },
          target_path: {
            type: "string",
            description: "Optional vault-relative path of the note (.md). Overrides the template's target_path. Can use {{ field }} values.",
          },
        },
        required: ["template_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: (args: Args) =>
        run(async () =>
          jsonResult(
            noteResult(
              await service.createNote({
                templateId: args.template_id,
                data: args.data,
                dataFile: args.data_file,
                targetPath: args.target_path,
              }),
            ),
          ),
        ),
    },
    {
      name: "preview_template",
      title: "Preview template",
      description:
        "Renders a template with data and returns the Markdown without saving anything (images are checked but not written). " +
        'Use it to check a result before create_note_from_template. channel "telegram" renders for the Telegram AI Gateway (HTML, tables as monospace blocks).',
      inputSchema: {
        type: "object",
        properties: {
          template_id: { type: "string", description: "Id from list_templates." },
          data: DATA_PROPERTY,
          data_file: { type: "string", description: "Optional vault-relative path of a JSON file with the data." },
          target_path: { type: "string", description: "Optional target_path, to see where the note would go." },
          channel: { type: "string", enum: ["obsidian", "telegram"], description: 'Default "obsidian".' },
        },
        required: ["template_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      handler: (args: Args) =>
        run(async () =>
          jsonResult(
            previewResult(
              await service.preview({
                templateId: args.template_id,
                data: args.data,
                dataFile: args.data_file,
                targetPath: args.target_path,
                channel: args.channel,
              }),
            ),
          ),
        ),
    },
    {
      name: "create_template",
      title: "Create template",
      description:
        "Creates (or replaces, when the id exists) a template note in the templates folder, after checking it: the body must compile and every {{ variable }} it reads must be declared in fields. " +
        "The body is Liquid, not Handlebars: {{ titulo }}, {% if observacoes %}...{% else %}...{% endif %}, {% for item in itens %}...{% endfor %}. " +
        "Filters: markdown_table (for table fields), obsidian_image: 500 (for image fields), date_fmt: \"DD/MM/YYYY HH:mm\", slug, safe_filename, md_escape, wikilink, bullet_list; tag {% now \"YYYY-MM-DD\" %}; built-in variables today and now_iso. " +
        "Example: { \"template_id\": \"daily_log\", \"description\": \"Daily log with a task table\", \"target_path\": \"Logs/{% now 'YYYY-MM-DD' %}-{{ titulo | slug }}.md\", " +
        "\"fields\": { \"titulo\": { \"type\": \"string\", \"required\": true }, \"tarefas\": { \"type\": \"table\", \"columns\": [\"Ticket\", \"Status\"] } }, " +
        "\"markdown_body\": \"# {{ titulo }}\\n\\n{{ tarefas | markdown_table }}\\n\" }.",
      inputSchema: {
        type: "object",
        properties: {
          template_id: { type: "string", description: "Letters, digits, _ and -; up to 64 characters. Also the note name." },
          description: { type: "string", description: "What the template is for. Agents pick templates by it." },
          target_path: { type: "string", description: "Vault-relative path of the generated notes (.md). Liquid expressions allowed, for example Logs/{{ titulo | slug }}.md." },
          fields: {
            type: "object",
            description: "Map of field name to { type, required, description, columns, default }.",
            additionalProperties: FIELD_SCHEMA,
          },
          markdown_body: { type: "string", description: "The template body, in Liquid." },
          collision_rule: { type: "string", enum: ["incremental", "overwrite", "error"], description: "What to do when the target note exists. Default: the plugin setting." },
        },
        required: ["template_id", "description", "target_path", "fields", "markdown_body"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: (args: Args) =>
        run(async () => {
          const created = await service.createTemplate({
            templateId: args.template_id,
            description: args.description,
            targetPath: args.target_path,
            fields: args.fields,
            markdownBody: args.markdown_body,
            collisionRule: args.collision_rule,
          });
          return jsonResult({
            success: true,
            template_id: created.templateId,
            note: created.path,
            created: created.created,
            variables: created.variables,
            warnings: created.warnings,
          });
        }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function buildRoutes(service: TemplateService, loader: TemplateLoader): HubRoute[] {
  const guard = async (fn: () => Promise<HubResponse>): Promise<HubResponse> => {
    try {
      return await fn();
    } catch (err) {
      return errorResponse(err);
    }
  };

  return [
    {
      method: "GET",
      path: "/templates",
      description: "Lists the templates (id and description) and the problems found in template notes.",
      handler: () => guard(async () => ({ status: 200, body: await listResult(loader, service) })),
    },
    {
      method: "GET",
      path: "/templates/:id",
      description: "Schema of one template: fields, rules and a JSON example.",
      handler: (req: HubRequest) => guard(async () => ({ status: 200, body: await service.getSchema(req.params.id ?? "") })),
    },
    {
      method: "POST",
      path: "/render",
      description: "Renders a template without saving. Body: { template_id, data, data_file?, target_path?, channel? }.",
      handler: (req: HubRequest) =>
        guard(async () => {
          const body = asRecord(req.body);
          const result = await service.preview({
            templateId: body.template_id,
            data: body.data,
            dataFile: body.data_file,
            targetPath: body.target_path,
            channel: body.channel,
          });
          return { status: 200, body: previewResult(result) };
        }),
    },
    {
      method: "POST",
      path: "/notes",
      description: "Creates a note from a template. Body: { template_id, data, data_file?, target_path? }.",
      handler: (req: HubRequest) =>
        guard(async () => {
          const body = asRecord(req.body);
          const result = await service.createNote({
            templateId: body.template_id,
            data: body.data,
            dataFile: body.data_file,
            targetPath: body.target_path,
          });
          return { status: 201, body: noteResult(result) };
        }),
    },
  ];
}
