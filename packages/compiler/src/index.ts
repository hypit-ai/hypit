export { CompilerError } from "./error.js";
export { compileSourceClosure, defaultSourceCompilationLimits, SourceClosureError } from "./source.js";
export type { CompileSourceClosureRequest, SourceCompilationLimits } from "./source.js";
export {
  ModulePackageRegistry,
} from "./modules.js";
export type {
  ModulePackageRegistryLike,
  RegisteredModulePackage,
} from "./modules.js";
export { Compiler } from "./compiler.js";
export { BuildCompiler, resolveTargetSelection } from "./build.js";
export type {
  CompilerOptions,
  CompileAuthorSourceOptions,
  CompiledAuthorSource,
  ProjectedCompiledAuthorSource,
  PreparedAuthorStructureEdit,
} from "./compiler.js";
export type {
  BuildAuthorCompiler,
  BuildCompilerOptions,
  CompiledBuild,
  PrepareBuildOptions,
  PreparedBuild,
  ProjectedPreparedBuild,
  ResolvedTarget,
  ResolvedTargetSelection,
  TargetSelection,
} from "./build.js";
