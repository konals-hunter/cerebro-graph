import path, { sep } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region src/types.ts
/** §4.4 stable namespaced id: project + relPath + optional anchor. */
function nodeId(project, relPath, anchor) {
	return `${project}::${relPath}${anchor ? `::${anchor}` : ""}`;
}
const isObj = (v) => typeof v === "object" && v !== null;
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isBool = (v) => typeof v === "boolean";
const isArr = (v) => Array.isArray(v);
const isRole = (v) => isStr(v) && [
	"current",
	"direct",
	"transitive",
	"section",
	"other"
].includes(v);
const isNodeType = (v) => v === "doc" || v === "section";
const isLinkKind = (v) => v === "contains" || v === "references";
const isDocStatus = (v) => v === "ok" || v === "changed" || v === "err";
const isIndexPhase = (v) => isStr(v) && [
	"starting",
	"indexing",
	"ready",
	"error"
].includes(v);
function isIndexState(v) {
	if (!isObj(v)) return false;
	if (!isIndexPhase(v.phase)) return false;
	if (!isNum(v.revision)) return false;
	if ("startedAt" in v && v.startedAt !== void 0 && !isNum(v.startedAt)) return false;
	if ("finishedAt" in v && v.finishedAt !== void 0 && !isNum(v.finishedAt)) return false;
	if ("lastError" in v && v.lastError !== void 0 && !isStr(v.lastError)) return false;
	return true;
}
function isSummary(v) {
	if (!isObj(v)) return false;
	if (!isNum(v.docs) || !isNum(v.nodes) || !isNum(v.edges) || !isNum(v.entities) || !isNum(v.failed)) return false;
	if (!isArr(v.formats)) return false;
	return v.formats.every((f) => isObj(f) && isStr(f.fmt) && isNum(f.pct));
}
function isDocRecord(v) {
	if (!isObj(v)) return false;
	return isStr(v.id) && isStr(v.project) && isStr(v.name) && isStr(v.path) && isStr(v.fmt) && isDocStatus(v.status) && isNum(v.inbound) && isNum(v.sizeBytes) && isNum(v.updatedAt) && isNum(v.indexedAt);
}
function isGraphNode(v) {
	if (!isObj(v)) return false;
	return isStr(v.id) && isStr(v.project) && isStr(v.name) && isNodeType(v.type) && isRole(v.role) && isStr(v.relPath) && isNum(v.val) && isNum(v.inboundTotal) && isNum(v.outboundTotal) && ("anchor" in v ? v.anchor === void 0 || isStr(v.anchor) : true);
}
function isGraphLink(v) {
	if (!isObj(v)) return false;
	return isStr(v.source) && isStr(v.target) && isLinkKind(v.kind);
}
function isContextResult(v) {
	if (!isObj(v)) return false;
	return isStr(v.id) && isStr(v.project) && isStr(v.title) && isStr(v.location) && isStr(v.docPath) && isNum(v.inbound) && isArr(v.chips) && v.chips.every(isStr) && ("score" in v ? v.score === void 0 || isNum(v.score) : true) && ("statusTag" in v ? v.statusTag === void 0 || isObj(v.statusTag) && isStr(v.statusTag.label) && [
		"active",
		"stale",
		"hot",
		"superseded"
	].includes(v.statusTag.kind) : true) && ("snippet" in v ? v.snippet === void 0 || isStr(v.snippet) : true);
}
function isDriftFinding(v) {
	if (!isObj(v)) return false;
	return isStr(v.code) && [
		"err",
		"warn",
		"ok"
	].includes(v.severity) && isStr(v.title) && isStr(v.detail) && isBool(v.actionable) && isArr(v.docs) && v.docs.every((d) => isObj(d) && isStr(d.id) && isStr(d.name)) && ("actionLabel" in v ? v.actionLabel === void 0 || isStr(v.actionLabel) : true);
}
function isIndexPayload(v) {
	if (!isObj(v)) return false;
	return v.schemaVersion === 1 && (v.kind === "docgraph_index" || v.kind === "docgraph_status") && isStr(v.project) && isStr(v.rootPath) && isIndexState(v.state) && isSummary(v.summary) && isArr(v.docs) && v.docs.every(isDocRecord);
}
function isGraphPayload(v) {
	if (!isObj(v)) return false;
	return v.schemaVersion === 1 && v.kind === "docgraph_graph" && isStr(v.project) && isStr(v.seedNodeId) && [
		"incoming",
		"outgoing",
		"impact",
		"trace"
	].includes(v.operation) && isArr(v.nodes) && v.nodes.every(isGraphNode) && isArr(v.links) && v.links.every(isGraphLink) && isObj(v.dropped) && isNum(v.dropped.nodes) && isNum(v.dropped.links) && ("depth" in v ? v.depth === void 0 || isNum(v.depth) : true);
}
function isDriftPayload(v) {
	if (!isObj(v)) return false;
	return v.schemaVersion === 1 && v.kind === "docgraph_drift" && isStr(v.project) && isArr(v.findings) && v.findings.every(isDriftFinding);
}
function isContextPayload(v) {
	if (!isObj(v)) return false;
	return v.schemaVersion === 1 && v.kind === "docgraph_context" && isStr(v.project) && isArr(v.results) && v.results.every(isContextResult) && isBool(v.truncated);
}
function isFilesPayload(v) {
	if (!isObj(v)) return false;
	return v.schemaVersion === 1 && v.kind === "docgraph_files" && isStr(v.project) && isArr(v.files) && v.files.every(isDocRecord) && isBool(v.truncated);
}
function isDocGraphPayload(v) {
	return isIndexPayload(v) || isGraphPayload(v) || isDriftPayload(v) || isContextPayload(v) || isFilesPayload(v);
}
//#endregion
//#region src/core.ts
/**
* §3/§5/§6 core bridge. This file owns: project-root resolution, relative
* path validation, the newline-delimited JSON-RPC 2.0 stdio client for the
* long-lived `docgraph serve` process, and (in the next task) the core
* manager plus core-to-UI mapping.
*/
/** Tool-facing error surfaced as a tool error text. */
var ToolError = class extends Error {};
/** §5.1 projectRoot := sandboxPolicy.workspaceRoot || session.header.cwd. */
function getProjectRoot(ctx, exec) {
	const getter = ctx.get;
	return (getter?.("sandboxPolicy"))?.resolve?.({ ...exec?.agent ? { session: exec.agent.session } : {} })?.workspaceRoot ?? exec?.agent?.session?.header?.cwd ?? process.cwd();
}
function canonical(p) {
	try {
		return realpathSync.native(p);
	} catch {
		return path.resolve(p);
	}
}
/** §5.2 shared path validation. */
function resolveRelPath(projectRoot, input) {
	if (typeof input !== "string" || input.trim() === "") throw new ToolError("path must not be empty");
	const rel = input.replaceAll("\\", "/");
	if (rel.startsWith("/") || /^[A-Za-z]:\//.test(rel)) throw new ToolError("path must be relative");
	if (rel.split("/").includes("..")) throw new ToolError("path must not contain ..");
	const root = canonical(projectRoot);
	const target = canonical(path.join(projectRoot, rel));
	if (target !== root && !target.startsWith(root + path.sep)) throw new ToolError("path escapes project root");
	return path.relative(root, target).split(path.sep).join("/") || ".";
}
function encodeJsonRpc(id, method, params) {
	const msg = {
		jsonrpc: "2.0",
		id,
		method
	};
	if (params !== void 0) msg.params = params;
	return JSON.stringify(msg) + "\n";
}
function parseJsonRpcLine(line) {
	try {
		const parsed = JSON.parse(line);
		if (typeof parsed !== "object" || parsed === null) return null;
		const obj = parsed;
		if (obj.jsonrpc !== "2.0") return null;
		if (typeof obj.id === "number" && typeof obj.method === "string") return obj;
		if (typeof obj.id === "number" && ("result" in obj || "error" in obj)) return obj;
		return null;
	} catch {
		return null;
	}
}
/**
* Newline-delimited JSON-RPC 2.0 client over a child process stdio. One
* request per line; responses are matched by id. stderr is isolated from
* tool results via the onStderr callback.
*/
var JsonRpcClient = class {
	opts;
	child = null;
	nextId = 1;
	buffer = "";
	pending = /* @__PURE__ */ new Map();
	constructor(opts, inject) {
		this.opts = opts;
		if (inject?.child) this.child = inject.child;
	}
	get running() {
		return this.child !== null && this.child.exitCode === null && this.child.killed === false;
	}
	start() {
		if (this.running) return Promise.resolve();
		if (this.child) this.child = null;
		return new Promise((resolve, reject) => {
			let child;
			try {
				child = spawn(this.opts.bin, this.opts.args, { stdio: [
					"pipe",
					"pipe",
					"pipe"
				] });
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
				return;
			}
			this.child = child;
			child.stdout.setEncoding?.("utf8");
			child.stderr.setEncoding?.("utf8");
			child.stdout.on("data", (chunk) => this.onStdout(chunk));
			child.stderr.on("data", (chunk) => this.opts.onStderr?.(chunk));
			child.once("error", (err) => {
				this.failAll(err instanceof Error ? err : new Error(String(err)));
				reject(err instanceof Error ? err : new Error(String(err)));
			});
			child.once("spawn", () => resolve());
			child.once("exit", (code) => {
				this.failAll(/* @__PURE__ */ new Error(`docgraph core exited (code ${code})`));
				this.child = null;
				this.opts.onExit?.(code);
			});
		});
	}
	request(method, params, timeoutMs = 15e3, signal) {
		if (!this.running || !this.child) return Promise.reject(/* @__PURE__ */ new Error("docgraph core not running"));
		if (signal?.aborted) return Promise.reject(/* @__PURE__ */ new Error("docgraph core request cancelled"));
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error(`docgraph core request timeout after ${timeoutMs}ms`));
			}, timeoutMs);
			const onAbort = () => {
				this.notify("notifications/cancelled", { requestId: id });
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error("docgraph core request cancelled"));
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(id, {
				resolve: (v) => {
					clearTimeout(timer);
					signal?.removeEventListener("abort", onAbort);
					resolve(v);
				},
				reject: (e) => {
					clearTimeout(timer);
					signal?.removeEventListener("abort", onAbort);
					reject(e);
				},
				timer
			});
			this.child.stdin.write(encodeJsonRpc(id, method, params));
		});
	}
	notify(method, params) {
		if (!this.running || !this.child) return;
		this.child.stdin.write(JSON.stringify({
			jsonrpc: "2.0",
			method,
			params
		}) + "\n");
	}
	onStdout(chunk) {
		this.buffer += chunk;
		let idx;
		while ((idx = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, idx).trim();
			this.buffer = this.buffer.slice(idx + 1);
			if (!line) continue;
			const msg = parseJsonRpcLine(line);
			if (!msg || !("id" in msg)) continue;
			const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
			const pending = this.pending.get(id);
			if (!pending) continue;
			this.pending.delete(id);
			if ("error" in msg && msg.error) pending.reject(new Error(msg.error.message));
			else pending.resolve("result" in msg ? msg.result : void 0);
		}
	}
	failAll(err) {
		for (const [, pending] of this.pending) pending.reject(err);
		this.pending.clear();
		this.buffer = "";
	}
	async stop(timeoutMs = 5e3) {
		const child = this.child;
		this.child = null;
		if (!child || child.exitCode !== null) return;
		child.kill("SIGTERM");
		await new Promise((resolve) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, timeoutMs);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function asNum(v, fallback = 0) {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function asStr(v, fallback = "") {
	return typeof v === "string" ? v : fallback;
}
function asBool(v, fallback = false) {
	return typeof v === "boolean" ? v : fallback;
}
function fmtOf(raw) {
	return asStr(raw.fmt ?? raw.format ?? "", "md");
}
function statusOf(raw) {
	const v = raw.status;
	return v === "changed" || v === "err" ? v : "ok";
}
function nameOf(raw, p) {
	const n = asStr(raw.name ?? raw.title, "");
	if (n) return n;
	return (p.split("/").pop() ?? p).replace(/\.[^.]+$/, "");
}
function mapRawDoc(raw, project) {
	const p = asStr(raw.path ?? raw.file_path ?? raw.rel_path ?? raw.relPath, "").replaceAll("\\", "/");
	return {
		id: nodeId(project, p),
		project,
		name: nameOf(raw, p),
		path: p,
		fmt: fmtOf(raw),
		status: statusOf(raw),
		inbound: asNum(raw.inbound),
		sizeBytes: asNum(raw.sizeBytes ?? raw.size ?? raw.size_bytes),
		updatedAt: asNum(raw.updatedAt ?? raw.updated_at ?? raw.mtime),
		indexedAt: asNum(raw.indexedAt ?? raw.indexed_at)
	};
}
function mapRawSummary(raw) {
	const s = raw.summary ?? raw;
	const formatsRaw = Array.isArray(s.formats) ? s.formats : [];
	return {
		docs: asNum(s.docs),
		nodes: asNum(s.nodes),
		edges: asNum(s.edges),
		entities: asNum(s.entities),
		failed: asNum(s.failed),
		formats: formatsRaw.map((f) => ({
			fmt: asStr(f.fmt, "?"),
			pct: asNum(f.pct)
		}))
	};
}
function inferPhase(v) {
	if (typeof v === "string") {
		if (v.includes("Indexing in progress") || v === "indexing") return "indexing";
		if (v === "ready" || v === "ok") return "ready";
		if (v === "starting") return "starting";
		return "error";
	}
	if (v === "starting" || v === "indexing" || v === "ready" || v === "error") return v;
	return "ready";
}
/** Normalize a raw core status response into an IndexPayload. */
function mapStatusResult(raw, project, rootPath, kind, revision) {
	const obj = raw ?? {};
	const phase = inferPhase(obj.phase ?? obj.state ?? obj.status ?? (raw === void 0 ? "starting" : "ready"));
	const state = {
		phase,
		revision
	};
	if (phase === "ready") state.finishedAt = asNum(obj.finishedAt ?? obj.finished_at, Date.now());
	if (phase === "indexing") state.startedAt = asNum(obj.startedAt ?? obj.started_at, Date.now());
	if (phase === "error") state.lastError = asStr(obj.lastError ?? obj.error ?? obj.message, "unknown error");
	const docs = Array.isArray(obj.docs) ? obj.docs.map((d) => mapRawDoc(d, project)) : [];
	return assertPayload({
		schemaVersion: 1,
		kind,
		project,
		rootPath,
		state,
		summary: mapRawSummary(obj),
		docs
	});
}
function roleOf(raw, seedNodeId) {
	const v = raw.role;
	if (v === "current" || v === "direct" || v === "transitive" || v === "section" || v === "other") return v;
	if (asStr(raw.kind ?? raw.type, "") === "heading") return "section";
	return "direct";
}
/** §6.1 node mapping: document→doc, heading→section, others dropped. */
function mapGraphResult(raw, project, seedNodeId, operation, depth) {
	const obj = raw ?? {};
	const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
	const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
	const rawIdToNodeId = /* @__PURE__ */ new Map();
	const nodes = [];
	let droppedNodes = 0;
	for (const rn of rawNodes) {
		const kind = asStr(rn.kind ?? rn.type, "document");
		let filePath = asStr(rn.file_path ?? rn.path ?? rn.relPath ?? rn.rel_path, "");
		filePath = filePath.replaceAll("\\", "/");
		let mapped = null;
		if (kind === "document" || kind === "doc") {
			const id = nodeId(project, filePath);
			rawIdToNodeId.set(asStr(rn.id, id), id);
			mapped = {
				id,
				project,
				name: nameOf(rn, filePath),
				type: "doc",
				role: id === seedNodeId ? "current" : roleOf(rn, seedNodeId),
				relPath: filePath,
				val: asNum(rn.val ?? rn.weight, 1),
				inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
				outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total)
			};
		} else if (kind === "heading" || kind === "section") {
			const anchor = asStr(rn.anchor ?? rn.heading, "");
			const id = nodeId(project, filePath, anchor);
			rawIdToNodeId.set(asStr(rn.id, id), id);
			mapped = {
				id,
				project,
				name: anchor || nameOf(rn, filePath),
				type: "section",
				role: "section",
				relPath: filePath,
				anchor,
				val: asNum(rn.val ?? rn.weight, 1),
				inboundTotal: asNum(rn.inboundTotal ?? rn.inbound_total),
				outboundTotal: asNum(rn.outboundTotal ?? rn.outbound_total)
			};
		}
		if (mapped) nodes.push(mapped);
		else droppedNodes += 1;
	}
	const links = [];
	let droppedLinks = 0;
	for (const re of rawEdges) {
		const kind = asStr(re.kind ?? re.type, "");
		const mappedKind = kind === "contains" ? "contains" : [
			"references",
			"wikilinks_to",
			"embeds",
			"related_to"
		].includes(kind) ? "references" : null;
		if (mappedKind === null) {
			droppedLinks += 1;
			continue;
		}
		const source = rawIdToNodeId.get(asStr(re.source, ""));
		const target = rawIdToNodeId.get(asStr(re.target, ""));
		if (!source || !target) {
			droppedLinks += 1;
			continue;
		}
		links.push({
			source,
			target,
			kind: mappedKind
		});
	}
	const mappedSeed = rawIdToNodeId.get(seedNodeId) ?? seedNodeId;
	for (const n of nodes) if (n.id === mappedSeed) n.role = "current";
	const payload = {
		schemaVersion: 1,
		kind: "docgraph_graph",
		project,
		seedNodeId: mappedSeed,
		operation,
		nodes,
		links,
		dropped: {
			nodes: droppedNodes,
			links: droppedLinks
		}
	};
	if (depth !== void 0) payload.depth = depth;
	return assertPayload(payload);
}
function mapRawContextResult(raw, project) {
	let rawPath = asStr(raw.docPath ?? raw.doc_path ?? raw.path ?? raw.id, "");
	rawPath = rawPath.replaceAll("\\", "/");
	const hash = rawPath.indexOf("#");
	const p = hash === -1 ? rawPath : rawPath.slice(0, hash);
	const location = asStr(raw.location, rawPath);
	const result = {
		id: nodeId(project, p),
		project,
		title: asStr(raw.title ?? raw.name, nameOf(raw, p)),
		location,
		docPath: p,
		inbound: asNum(raw.inbound),
		chips: Array.isArray(raw.chips) ? raw.chips.map((c) => asStr(c)) : []
	};
	if (raw.score !== void 0) result.score = asNum(raw.score);
	const tag = raw.statusTag ?? raw.status_tag;
	if (tag && typeof tag === "object") {
		const kindRaw = asStr(tag.kind, "active");
		const kind = [
			"active",
			"stale",
			"hot",
			"superseded"
		].includes(kindRaw) ? kindRaw : "active";
		result.statusTag = {
			label: asStr(tag.label, kind),
			kind
		};
	}
	if (raw.snippet !== void 0) result.snippet = asStr(raw.snippet);
	return result;
}
/** Normalize search/node/similar/tags/context responses into ContextPayload. */
function mapContextResult(raw, project) {
	const obj = raw ?? {};
	const results = Array.isArray(obj.results) ? obj.results.map((r) => mapRawContextResult(r, project)) : [];
	return assertPayload({
		schemaVersion: 1,
		kind: "docgraph_context",
		project,
		results,
		truncated: asBool(obj.truncated, results.length === 0)
	});
}
/** Normalize docgraph_files responses into FilesPayload. */
function mapFilesResult(raw, project) {
	const obj = raw ?? {};
	const files = Array.isArray(obj.files) ? obj.files.map((d) => mapRawDoc(d, project)) : [];
	return assertPayload({
		schemaVersion: 1,
		kind: "docgraph_files",
		project,
		files,
		truncated: asBool(obj.truncated, files.length === 0)
	});
}
function mapRawFinding(raw) {
	const severityRaw = asStr(raw.severity, "ok");
	const severity = severityRaw === "err" || severityRaw === "error" ? "err" : severityRaw === "warn" || severityRaw === "warning" ? "warn" : "ok";
	const docs = Array.isArray(raw.docs) ? raw.docs.map((d) => ({
		id: asStr(d.id),
		name: asStr(d.name)
	})) : [];
	const finding = {
		code: asStr(raw.code, "D-UNKNOWN"),
		severity,
		title: asStr(raw.title, ""),
		detail: asStr(raw.detail, ""),
		actionable: asBool(raw.actionable),
		docs
	};
	if (raw.actionLabel !== void 0 || raw.action_label !== void 0) finding.actionLabel = asStr(raw.actionLabel ?? raw.action_label);
	return finding;
}
/** Normalize docgraph_context format=drift_audit responses into DriftPayload. */
function mapDriftResult(raw, project) {
	const obj = raw ?? {};
	return assertPayload({
		schemaVersion: 1,
		kind: "docgraph_drift",
		project,
		findings: Array.isArray(obj.findings) ? obj.findings.map((f) => mapRawFinding(f)) : []
	});
}
/** Long-lived `docgraph serve` process owner (single-project mode). */
var DocGraphCoreManager = class {
	ctx;
	projectRoot;
	client = null;
	indexingOp = Promise.resolve();
	revision = 0;
	lastStateKey = "";
	constructor(ctx, projectRoot) {
		this.ctx = ctx;
		this.projectRoot = projectRoot;
	}
	/** §3.1 binary resolution order. */
	resolveBin() {
		const env = process.env.DSH_DOCGRAPH_BIN;
		if (env && env.trim()) return env;
		return "docgraph";
	}
	logStderr(chunk) {
		try {
			this.ctx.logger?.info("[docgraph-core] " + chunk.trimEnd());
		} catch {}
	}
	nextRevision(key) {
		if (key !== this.lastStateKey) {
			this.lastStateKey = key;
			this.revision += 1;
		}
		return this.revision;
	}
	emptyIndex(kind, state) {
		const phase = state.phase ?? "starting";
		const full = {
			phase,
			revision: this.nextRevision(phase + (state.lastError ?? ""))
		};
		if (state.startedAt !== void 0) full.startedAt = state.startedAt;
		if (state.finishedAt !== void 0) full.finishedAt = state.finishedAt;
		if (state.lastError !== void 0) full.lastError = state.lastError;
		return {
			schemaVersion: 1,
			kind,
			project: this.projectName(),
			rootPath: this.projectRoot,
			state: full,
			summary: {
				docs: 0,
				nodes: 0,
				edges: 0,
				entities: 0,
				failed: 0,
				formats: []
			},
			docs: []
		};
	}
	projectName() {
		return this.projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? this.projectRoot;
	}
	async callCoreTool(name, args, timeoutMs, signal) {
		const raw = await this.client.request("tools/call", {
			name,
			arguments: args
		}, timeoutMs, signal);
		if (typeof raw === "string") try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
		if (raw && typeof raw === "object" && raw.structuredContent !== void 0) return raw.structuredContent;
		const text = (Array.isArray(raw?.content) ? raw.content : []).filter((c) => typeof c === "object" && c !== null && c.type === "text").map((c) => c.text ?? "").join("\n");
		if (text.trim() === "") return void 0;
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}
	async handshake() {
		try {
			await this.client.request("initialize", {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: {
					name: "dsh-doc-graph",
					version: "0.1.0"
				}
			}, 15e3);
			this.client.notify("notifications/initialized", {});
		} catch {}
	}
	isExitError(err) {
		return err instanceof Error && /core exited/.test(err.message);
	}
	async startClient() {
		const client = new JsonRpcClient({
			bin: this.resolveBin(),
			args: [
				"serve",
				"--path",
				this.projectRoot
			],
			onStderr: (chunk) => this.logStderr(chunk),
			onExit: () => {
				if (this.client === client) this.client = null;
			}
		});
		try {
			await client.start();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/ENOENT/.test(msg) || /spawn/.test(msg)) throw new ToolError("docgraph core binary not found");
			throw err;
		}
		this.client = client;
		await this.handshake();
	}
	/** Start serve (if needed) and wait until docgraph_status is queryable. */
	async ensureServing(timeoutMs = 6e4) {
		if (this.client?.running) return;
		await this.startClient();
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) try {
			await this.callCoreTool("docgraph_status", {}, 15e3);
			return;
		} catch (err) {
			if (this.isExitError(err)) throw err;
			await sleep(500);
		}
	}
	/** Query one core tool with a single auto-restart on process exit. */
	async query(name, args, timeoutMs = 15e3, signal) {
		await this.ensureServing();
		try {
			return await this.callCoreTool(name, args, timeoutMs, signal);
		} catch (err) {
			if (this.isExitError(err)) {
				this.client = null;
				await this.startClient();
				return this.callCoreTool(name, args, timeoutMs, signal);
			}
			throw err;
		}
	}
	/** docgraph_status payload with §4.3 phase inference. */
	async status(timeoutMs = 15e3) {
		if (!this.client?.running) return this.emptyIndex("docgraph_status", { phase: "starting" });
		try {
			const raw = await this.callCoreTool("docgraph_status", {}, timeoutMs);
			return mapStatusResult(raw, this.projectName(), this.projectRoot, "docgraph_status", this.nextRevision(JSON.stringify(raw)));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return this.emptyIndex("docgraph_status", {
				phase: "error",
				lastError: msg
			});
		}
	}
	async runCliIndex() {
		const { spawn } = await import("node:child_process");
		await new Promise((resolve, reject) => {
			const child = spawn(this.resolveBin(), [
				"index",
				"--force",
				this.projectRoot
			], { stdio: [
				"ignore",
				"ignore",
				"pipe"
			] });
			let stderr = "";
			child.stderr.setEncoding?.("utf8");
			child.stderr.on("data", (chunk) => {
				stderr = (stderr + chunk).slice(-4e3);
			});
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new ToolError("docgraph index --force timed out after 120s"));
			}, 12e4);
			child.once("error", (err) => {
				clearTimeout(timer);
				reject(err);
			});
			child.once("exit", (code) => {
				clearTimeout(timer);
				if (code === 0) resolve();
				else reject(new ToolError(`docgraph index --force failed with code ${code}${stderr ? ": " + stderr.trim() : ""}`));
			});
		});
	}
	async stopClient(timeoutMs = 5e3) {
		const client = this.client;
		this.client = null;
		if (client) await client.stop(timeoutMs);
	}
	/** §3.2 docgraph_index. force=false ensures serve and returns status; force=true runs the full reindex sequence. */
	async index(force) {
		if (!force) {
			await this.ensureServing();
			return this.status();
		}
		const run = this.indexingOp.then(() => this.forceIndex());
		this.indexingOp = run.catch(() => void 0);
		return run;
	}
	async forceIndex() {
		try {
			await this.status(15e3);
		} catch {}
		await this.stopClient(5e3);
		await this.runCliIndex();
		await this.ensureServing();
		const deadline = Date.now() + 6e4;
		let last = this.emptyIndex("docgraph_index", { phase: "starting" });
		while (Date.now() < deadline) {
			last = await this.status(15e3);
			if (last.state.phase === "ready" || last.state.phase === "error") return {
				...last,
				kind: "docgraph_index"
			};
			await sleep(500);
		}
		return {
			...last,
			kind: "docgraph_index"
		};
	}
	async stop() {
		await this.stopClient(5e3);
	}
};
/** Validate a produced payload with the §4 type guard; used by tool.ts. */
function assertPayload(payload) {
	if (!isDocGraphPayload(payload)) throw new ToolError("core response validation failed: payload");
	return payload;
}
//#endregion
//#region src/tool.ts
/**
* §7 Node-side tools. All nine docgraph_* tools share one core manager per
* project root (so IndexState.revision is monotonic per process), validate
* every path through resolveRelPath, and project `{ kind, payload }` into
* presentationMeta so the client toolview cards and replay stay stable.
*/
const managers$1 = /* @__PURE__ */ new Map();
function toCorePath(projectRoot, input) {
	return resolveRelPath(projectRoot, input).split("/").join(sep);
}
function managerFor$1(ctx, projectRoot) {
	let manager = managers$1.get(projectRoot);
	if (!manager) {
		manager = new DocGraphCoreManager(ctx, projectRoot);
		managers$1.set(projectRoot, manager);
	}
	return manager;
}
function projectNameOf$1(root) {
	return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
}
function optString(args, key, fallback = "") {
	const v = args[key];
	if (v === void 0) return fallback;
	return typeof v === "string" ? v : String(v);
}
function reqString(args, key, tool) {
	const v = optString(args, key, "");
	if (v.trim() === "") throw new Error(`${tool}: \`${key}\` is required`);
	return v;
}
function intInRange(args, key, fallback, min, max, tool) {
	const v = args[key];
	if (v === void 0) return fallback;
	const n = typeof v === "number" ? Math.trunc(v) : Number(v);
	if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${tool}: \`${key}\` must be ${min}..${max}`);
	return n;
}
function boolArg(args, key, fallback) {
	const v = args[key];
	return typeof v === "boolean" ? v : fallback;
}
const FILTER_PARAMS = {
	status: {
		type: "string",
		description: "治理过滤：文档状态"
	},
	sensitivity: {
		type: "string",
		description: "治理过滤：敏感级别"
	},
	canonical_source: {
		type: "string",
		description: "治理过滤：canonical 来源"
	},
	allowed_audience: {
		type: "string",
		description: "治理过滤：允许受众"
	},
	as_of_date: {
		type: "string",
		description: "治理过滤：YYYY-MM-DD"
	},
	claim_id: {
		type: "string",
		description: "研究过滤：claim id"
	},
	source_type: {
		type: "string",
		description: "研究过滤：来源类型"
	},
	confidence: {
		type: "string",
		description: "研究过滤：置信度"
	},
	analyst_status: {
		type: "string",
		description: "研究过滤：分析状态"
	}
};
const ENTITY_PARAMS = {
	entity_type: {
		type: "string",
		description: "实体过滤：实体类型（仅 search）"
	},
	entity_id: {
		type: "string",
		description: "实体过滤：实体 id（仅 search）"
	}
};
const PROJECT_PARAM = { project: {
	type: "string",
	description: "MVP 单 project，透传但为 no-op"
} };
function pickFilters(args) {
	const out = {};
	for (const key of Object.keys(FILTER_PARAMS)) {
		const v = args[key];
		if (typeof v === "string" && v !== "") out[key] = v;
	}
	return out;
}
function renderText(name, value) {
	switch (value.kind) {
		case "docgraph_index": return `索引完成：${value.summary.docs} 文档 / ${value.summary.nodes} 节点 / ${value.summary.edges} 边（${value.state.phase}）`;
		case "docgraph_status": return `图谱状态：${value.state.phase}`;
		case "docgraph_graph": return `图谱：${value.nodes.length} 节点 / ${value.links.length} 边（${value.operation}${value.depth ? ` depth=${value.depth}` : ""}）`;
		case "docgraph_drift": return `漂移审计：${value.findings.length} 项发现`;
		case "docgraph_context": return `图谱查询：${value.results.length} 条结果`;
		case "docgraph_files": return `文档列表：${value.files.length} 个文件`;
	}
}
function docGraphTool(spec) {
	return defineTool({
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: renderText(spec.name, value)
			}],
			presentationMeta: (_args, value) => ({
				kind: value.kind,
				payload: value
			})
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			return spec.execute(args, exec);
		}
	});
}
const DESCRIPTIONS = {
	docgraph_index: "Ensure the doc graph index for the project root, or force a full reindex (stops/restarts the core serve process). Returns index status.",
	docgraph_status: "Return the current doc graph index status (four-phase state, summary counts, doc records).",
	docgraph_context: "Query the graph context for a task; format=\"drift_audit\" returns a drift audit payload.",
	docgraph_search: "Search indexed documents/sections/entities in the doc graph.",
	docgraph_node: "Look up one node by project-relative path.",
	docgraph_files: "List indexed document files.",
	docgraph_graph: "Expand the graph around a document: incoming/outgoing/impact/trace.",
	docgraph_similar: "Find documents similar to the given document.",
	docgraph_tags: "List documents or sections by tag."
};
function docgraphTools(ctx) {
	const root = (exec) => getProjectRoot(ctx, exec);
	const project = (exec) => projectNameOf$1(root(exec));
	return [
		docGraphTool({
			name: "docgraph_index",
			description: DESCRIPTIONS.docgraph_index,
			parameters: {
				path: {
					type: "string",
					description: "MVP 仅接受 \".\" 或省略"
				},
				force: {
					type: "boolean",
					description: "true=停 serve→一次性 CLI 全量索引→重启 serve（慢，谨慎用）"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const pathArg = optString(args, "path", ".");
				if (pathArg !== "." && pathArg !== "") throw new Error("docgraph_index: MVP 仅支持索引项目根目录");
				return {
					...await managerFor$1(ctx, root(exec)).index(boolArg(args, "force", false)),
					kind: "docgraph_index"
				};
			}
		}),
		docGraphTool({
			name: "docgraph_status",
			description: DESCRIPTIONS.docgraph_status,
			parameters: {
				path: {
					type: "string",
					description: "MVP 仅接受 \".\" 或省略"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const pathArg = optString(args, "path", ".");
				if (pathArg !== "." && pathArg !== "") throw new Error("docgraph_status: MVP 仅支持索引项目根目录");
				return managerFor$1(ctx, root(exec)).status();
			}
		}),
		docGraphTool({
			name: "docgraph_context",
			description: DESCRIPTIONS.docgraph_context,
			parameters: {
				task: {
					type: "string",
					required: true,
					description: "自然语言任务描述"
				},
				format: {
					type: "string",
					description: "默认 'summary'；'drift_audit' 返回漂移审计"
				},
				maxNodes: {
					type: "integer",
					description: "1..200，默认 10"
				},
				includeContent: {
					type: "boolean",
					description: "默认 true"
				},
				maxContentBytes: {
					type: "integer",
					description: "≤6000，默认 2000"
				},
				impactDepth: {
					type: "integer",
					description: "1..3，默认 1"
				},
				referenceLimit: {
					type: "integer",
					description: "1..20，默认 5"
				},
				...FILTER_PARAMS,
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const task = reqString(args, "task", "docgraph_context");
				const format = optString(args, "format", "summary");
				const coreArgs = {
					task,
					format,
					maxNodes: intInRange(args, "maxNodes", 10, 1, 200, "docgraph_context"),
					includeContent: boolArg(args, "includeContent", true),
					maxContentBytes: intInRange(args, "maxContentBytes", 2e3, 1, 6e3, "docgraph_context"),
					impactDepth: intInRange(args, "impactDepth", 1, 1, 3, "docgraph_context"),
					referenceLimit: intInRange(args, "referenceLimit", 5, 1, 20, "docgraph_context"),
					...pickFilters(args)
				};
				const raw = await managerFor$1(ctx, root(exec)).query("docgraph_context", coreArgs, 15e3, exec.signal);
				return format === "drift_audit" ? mapDriftResult(raw, project(exec)) : mapContextResult(raw, project(exec));
			}
		}),
		docGraphTool({
			name: "docgraph_search",
			description: DESCRIPTIONS.docgraph_search,
			parameters: {
				q: {
					type: "string",
					required: true,
					description: "搜索查询"
				},
				limit: {
					type: "integer",
					description: "1..200，默认 10"
				},
				include_code: {
					type: "boolean",
					description: "默认 false"
				},
				kind: {
					type: "string",
					description: "默认 'doc'"
				},
				...ENTITY_PARAMS,
				...FILTER_PARAMS,
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const coreArgs = {
					q: reqString(args, "q", "docgraph_search"),
					limit: intInRange(args, "limit", 10, 1, 200, "docgraph_search"),
					include_code: boolArg(args, "include_code", false),
					kind: optString(args, "kind", "doc"),
					entity_type: optString(args, "entity_type", ""),
					entity_id: optString(args, "entity_id", ""),
					...pickFilters(args)
				};
				return mapContextResult(await managerFor$1(ctx, root(exec)).query("docgraph_search", coreArgs, 15e3, exec.signal), project(exec));
			}
		}),
		docGraphTool({
			name: "docgraph_node",
			description: DESCRIPTIONS.docgraph_node,
			parameters: {
				path: {
					type: "string",
					required: true,
					description: "项目内相对路径（/ 分隔）"
				},
				section: {
					type: "string",
					description: "章节锚点"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const projectRoot = root(exec);
				const rel = toCorePath(projectRoot, reqString(args, "path", "docgraph_node"));
				return mapContextResult(await managerFor$1(ctx, projectRoot).query("docgraph_node", {
					path: rel,
					section: optString(args, "section", "") || void 0
				}, 15e3, exec.signal), project(exec));
			}
		}),
		docGraphTool({
			name: "docgraph_files",
			description: DESCRIPTIONS.docgraph_files,
			parameters: {
				path: {
					type: "string",
					description: "目录过滤（项目内相对路径）"
				},
				limit: {
					type: "integer",
					description: "0..200，默认 50"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const projectRoot = root(exec);
				const pathArg = optString(args, "path", "");
				const coreArgs = { limit: intInRange(args, "limit", 50, 0, 200, "docgraph_files") };
				if (pathArg !== "") coreArgs.path = toCorePath(projectRoot, pathArg);
				return mapFilesResult(await managerFor$1(ctx, projectRoot).query("docgraph_files", coreArgs, 15e3, exec.signal), project(exec));
			}
		}),
		docGraphTool({
			name: "docgraph_graph",
			description: DESCRIPTIONS.docgraph_graph,
			parameters: {
				operation: {
					type: "string",
					required: true,
					description: "'incoming' | 'outgoing' | 'impact' | 'trace'"
				},
				document: {
					type: "string",
					description: "incoming/outgoing/impact 必填；trace 禁用"
				},
				from: {
					type: "string",
					description: "trace 必填；其他操作禁用"
				},
				to: {
					type: "string",
					description: "trace 必填；其他操作禁用"
				},
				depth: {
					type: "integer",
					description: "impact 1..5，默认 2"
				},
				limit: {
					type: "integer",
					description: "0..200，默认 10"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const operation = reqString(args, "operation", "docgraph_graph");
				if (![
					"incoming",
					"outgoing",
					"impact",
					"trace"
				].includes(operation)) throw new Error("docgraph_graph: invalid operation");
				let coreArgs;
				let depth;
				let seedFallback;
				const projectRoot = root(exec);
				if (operation === "trace") {
					if (args.document !== void 0) throw new Error("docgraph_graph: document not valid for trace");
					const from = toCorePath(projectRoot, reqString(args, "from", "docgraph_graph"));
					coreArgs = {
						operation,
						from,
						to: toCorePath(projectRoot, reqString(args, "to", "docgraph_graph"))
					};
					seedFallback = from.split(sep).join("/");
				} else {
					if (args.from !== void 0 || args.to !== void 0) throw new Error("docgraph_graph: from/to only valid for trace");
					const document = toCorePath(projectRoot, reqString(args, "document", "docgraph_graph"));
					coreArgs = {
						operation,
						document,
						limit: intInRange(args, "limit", 10, 0, 200, "docgraph_graph")
					};
					if (operation === "impact") {
						depth = intInRange(args, "depth", 2, 1, 5, "docgraph_graph");
						coreArgs.depth = depth;
					}
					seedFallback = document.split(sep).join("/");
				}
				const projectName = project(exec);
				const raw = await managerFor$1(ctx, projectRoot).query("docgraph_graph", coreArgs, 15e3, exec.signal);
				return mapGraphResult(raw, projectName, (typeof raw?.seedNodeId === "string" ? raw.seedNodeId : typeof raw?.seed === "string" ? raw.seed : "") || nodeId(projectName, seedFallback), operation, depth);
			}
		}),
		docGraphTool({
			name: "docgraph_similar",
			description: DESCRIPTIONS.docgraph_similar,
			parameters: {
				document: {
					type: "string",
					required: true,
					description: "项目内相对路径"
				},
				limit: {
					type: "integer",
					description: "默认 10"
				},
				engine: {
					type: "string",
					description: "默认 'auto'"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const projectRoot = root(exec);
				const coreArgs = {
					document: toCorePath(projectRoot, reqString(args, "document", "docgraph_similar")),
					limit: intInRange(args, "limit", 10, 1, 200, "docgraph_similar"),
					engine: optString(args, "engine", "auto")
				};
				return mapContextResult(await managerFor$1(ctx, projectRoot).query("docgraph_similar", coreArgs, 15e3, exec.signal), project(exec));
			}
		}),
		docGraphTool({
			name: "docgraph_tags",
			description: DESCRIPTIONS.docgraph_tags,
			parameters: {
				tag: {
					type: "string",
					description: "按 tag 过滤"
				},
				...PROJECT_PARAM
			},
			async execute(args, exec) {
				const coreArgs = {};
				if (optString(args, "tag", "") !== "") coreArgs.tag = optString(args, "tag", "");
				return mapContextResult(await managerFor$1(ctx, root(exec)).query("docgraph_tags", coreArgs, 15e3, exec.signal), project(exec));
			}
		})
	];
}
//#endregion
//#region src/skill.ts
/**
* Bundled `doc-graph` skill provider. Mirrors the official dsh-skill-badge
* provider shape — one bundled candidate whose body ships in `assets/`.
*/
const PROVIDER_NAME = "dsh-doc-graph";
const SKILL_BODY_URL = new URL("../assets/doc-graph-skill.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url))
};
const CANDIDATE = {
	name: "doc-graph",
	description: "Document knowledge-graph plugin usage: index docs, query impact/references, run drift audits. Load before the first docgraph_* call in a session.",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: BUNDLED_SKILL_RANK,
	locator: SKILL_BODY_URL
};
/** The bundled provider registered on `ctx.skills`. */
const docGraphSkillProvider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve([CANDIDATE]),
	async get(_candidate) {
		return {
			name: CANDIDATE.name,
			description: CANDIDATE.description,
			invocation: CANDIDATE.invocation,
			provider: CANDIDATE.provider,
			source: CANDIDATE.source,
			resourceBase: RESOURCE_BASE,
			content: await readFile(SKILL_BODY_URL, "utf8")
		};
	}
};
//#endregion
//#region src/routes.ts
const managers = /* @__PURE__ */ new Map();
function managerFor(ctx, cwd) {
	let manager = managers.get(cwd);
	if (!manager) {
		manager = new DocGraphCoreManager(ctx, cwd);
		managers.set(cwd, manager);
	}
	return manager;
}
function projectNameOf(cwd) {
	return cwd.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? cwd;
}
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
function cwdOf(req) {
	const cwd = new URL(req.url ?? "/", "http://localhost").searchParams.get("cwd");
	if (!cwd || cwd.trim() === "") return null;
	return cwd.trim();
}
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > 65536) return null;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}
function docGraphRoutes(ctx) {
	return [
		{
			kind: "exact",
			path: "/api/dsh-doc-graph/status",
			handler: async (req, res) => {
				if (req.method !== "GET") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const cwd = cwdOf(req);
				if (cwd === null) {
					writeJson(res, 400, { error: "cwd query parameter is required" });
					return;
				}
				try {
					const manager = managerFor(ctx, cwd);
					await manager.ensureServing(3e4);
					writeJson(res, 200, { payload: await manager.status(15e3) });
				} catch (error) {
					writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-doc-graph/index",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const cwd = cwdOf(req);
				if (cwd === null) {
					writeJson(res, 400, { error: "cwd query parameter is required" });
					return;
				}
				const force = (await readJsonBody(req))?.force === true;
				try {
					writeJson(res, 200, { payload: await managerFor(ctx, cwd).index(force) });
				} catch (error) {
					writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-doc-graph/graph",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					writeJson(res, 405, { error: "method not allowed" });
					return;
				}
				const cwd = cwdOf(req);
				if (cwd === null) {
					writeJson(res, 400, { error: "cwd query parameter is required" });
					return;
				}
				const body = await readJsonBody(req);
				const operation = typeof body?.operation === "string" ? body.operation : "impact";
				if (![
					"incoming",
					"outgoing",
					"impact",
					"trace"
				].includes(operation)) {
					writeJson(res, 400, { error: "invalid operation" });
					return;
				}
				try {
					const manager = managerFor(ctx, cwd);
					await manager.ensureServing(3e4);
					const coreArgs = { operation };
					let seedFallback = "";
					if (operation === "trace") {
						const from = typeof body?.from === "string" ? body.from : "";
						const to = typeof body?.to === "string" ? body.to : "";
						if (!from || !to) {
							writeJson(res, 400, { error: "from and to are required for trace" });
							return;
						}
						coreArgs.from = from;
						coreArgs.to = to;
						seedFallback = from;
					} else {
						const document = typeof body?.document === "string" ? body.document : "";
						if (!document) {
							writeJson(res, 400, { error: "document is required" });
							return;
						}
						coreArgs.document = document;
						coreArgs.limit = typeof body?.limit === "number" ? Math.trunc(body.limit) : 10;
						if (operation === "impact") {
							const depth = typeof body?.depth === "number" ? Math.trunc(body.depth) : 2;
							coreArgs.depth = Math.max(1, Math.min(5, depth));
						}
						seedFallback = document;
					}
					const raw = await manager.query("docgraph_graph", coreArgs, 3e4);
					const rawSeed = typeof raw?.seedNodeId === "string" ? raw.seedNodeId : typeof raw?.seed === "string" ? raw.seed : "";
					const projectName = projectNameOf(cwd);
					writeJson(res, 200, { payload: mapGraphResult(raw, projectName, rawSeed || nodeId(projectName, seedFallback.split(/[\\/]/).join("/")), operation, typeof coreArgs.depth === "number" ? coreArgs.depth : void 0) });
				} catch (error) {
					writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
				}
			}
		}
	];
}
//#endregion
//#region src/index.ts
const name = "dsh-doc-graph";
const inject = [
	"tools",
	"skills",
	"webServer"
];
function apply(ctx) {
	for (const tool of docgraphTools(ctx)) ctx.tools.register(tool);
	ctx.skills.registerProvider(() => docGraphSkillProvider);
	ctx.effect(() => {
		const disposers = docGraphRoutes(ctx).map((route) => ctx.webServer.register(route));
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, "dsh-doc-graph: routes");
}
//#endregion
export { apply, inject, name };
