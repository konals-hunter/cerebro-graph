import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
declare const name = "dsh-doc-graph";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject, name };