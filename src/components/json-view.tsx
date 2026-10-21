import { ChevronRight } from "lucide-react";

// Server-safe JSON tree: native <details> handles collapsing, no client JS.
export function JsonView({ value }: { value: unknown }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed">
      <Node value={value} depth={0} />
    </div>
  );
}

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const label = name !== undefined && (
    <span className="text-foreground">
      {name}
      <span className="text-muted-foreground">: </span>
    </span>
  );

  if (value === null || typeof value !== "object") {
    return (
      <div className="break-all whitespace-pre-wrap">
        {label}
        <Scalar value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = Object.entries(value);
  const [open, close] = isArray ? ["[", "]"] : ["{", "}"];

  if (entries.length === 0) {
    return (
      <div>
        {label}
        <span className="text-muted-foreground">{open + close}</span>
      </div>
    );
  }

  return (
    <details open={depth < 2} className="[&[open]>summary>svg]:rotate-90">
      <summary className="-ml-1 flex w-fit cursor-pointer list-none items-center gap-0.5 rounded hover:bg-muted [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform" />
        {label}
        <span className="text-muted-foreground">
          {open}
          {entries.length}
          {close}
        </span>
      </summary>
      <div className="ml-[0.3rem] border-l border-border pl-3">
        {entries.map(([key, child]) => (
          <Node key={key} name={isArray ? key : JSON.stringify(key)} value={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function Scalar({ value }: { value: unknown }) {
  switch (typeof value) {
    case "string":
      return <span className="text-emerald-700 dark:text-emerald-400">{JSON.stringify(value)}</span>;
    case "number":
    case "bigint":
      return <span className="text-sky-700 dark:text-sky-400">{String(value)}</span>;
    case "boolean":
      return <span className="text-violet-700 dark:text-violet-400">{String(value)}</span>;
    case "undefined":
      return <span className="text-muted-foreground italic">(none)</span>;
    default:
      return <span className="text-muted-foreground italic">{String(value)}</span>;
  }
}
