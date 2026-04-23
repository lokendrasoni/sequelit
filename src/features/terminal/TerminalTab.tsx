import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Tab } from "@/stores/tabStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useThemeStore } from "@/stores/themeStore";

interface QueryResult {
  columns: { name: string; type_name: string }[];
  rows: unknown[][];
  rows_affected: number;
  execution_time_ms: number;
  error?: string;
}

const PROMPT = "\r\n\x1b[1;34msequelit>\x1b[0m ";
const ERROR_COLOR = "\x1b[31m";
const SUCCESS_COLOR = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function formatTable(result: QueryResult): string {
  if (result.error) return `${ERROR_COLOR}Error: ${result.error}${RESET}`;
  if (result.columns.length === 0) {
    return `${SUCCESS_COLOR}OK — ${result.rows_affected} row(s) affected (${result.execution_time_ms}ms)${RESET}`;
  }

  const colWidths = result.columns.map((c) => c.name.length);
  for (const row of result.rows) {
    row.forEach((cell, i) => {
      const len = cell === null ? 4 : String(cell).length;
      colWidths[i] = Math.max(colWidths[i], Math.min(len, 40));
    });
  }

  const sep = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const header = "|" + result.columns.map((c, i) => ` ${c.name.padEnd(colWidths[i])} `).join("|") + "|";

  const rows = result.rows.map((row) =>
    "|" + row.map((cell, i) => {
      const s = cell === null ? "NULL" : String(cell);
      return ` ${s.slice(0, colWidths[i]).padEnd(colWidths[i])} `;
    }).join("|") + "|"
  );

  const lines = [sep, header, sep, ...rows, sep];
  lines.push(`${DIM}${result.rows.length} row(s) (${result.execution_time_ms}ms)${RESET}`);
  return lines.join("\r\n");
}

interface Props {
  tab: Tab;
}

export function TerminalTab({ tab }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lineRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const { resolvedTheme } = useThemeStore();
  const isDark = resolvedTheme() === "dark";

  const connection = useConnectionStore((s) =>
    s.connections.find((c) => c.id === tab.connectionId)
  );

  const executeSQL = useCallback(async (sql: string, term: XTerm) => {
    if (!sql.trim()) return;
    historyRef.current.unshift(sql);
    historyIdxRef.current = -1;
    term.write("\r\n");
    try {
      const result = await invoke<QueryResult>("run_query", {
        connectionId: tab.connectionId,
        sql: sql.trim(),
      });
      const output = formatTable(result);
      term.write(output.split("\n").join("\r\n"));
    } catch (e) {
      term.write(`${ERROR_COLOR}${String(e)}${RESET}`);
    }
    term.write(PROMPT);
  }, [tab.connectionId]);

  useEffect(() => {
    if (!termRef.current) return;

    const term = new XTerm({
      fontFamily: "'ui-monospace', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      theme: isDark ? {
        background: "#0f1117",
        foreground: "#e2e8f0",
        cursor: "#818cf8",
        selectionBackground: "#312e81",
        black: "#1e293b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#818cf8",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e2e8f0",
      } : {
        background: "#ffffff",
        foreground: "#1e293b",
        cursor: "#6366f1",
        selectionBackground: "#ddd6fe",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome banner
    const connName = connection?.name ?? "unknown";
    term.write(`\x1b[1mSequelit SQL Shell\x1b[0m — ${connName}\r\n`);
    term.write(`${DIM}Type SQL and press Enter to execute. Use ↑↓ for history.${RESET}`);
    term.write(PROMPT);

    term.onKey(({ key, domEvent }) => {
      const ev = domEvent;
      const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

      if (ev.keyCode === 13) {
        // Enter
        const sql = lineRef.current;
        lineRef.current = "";
        executeSQL(sql, term);
      } else if (ev.keyCode === 8) {
        // Backspace
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (ev.keyCode === 38) {
        // Arrow up — history
        const idx = historyIdxRef.current + 1;
        if (idx < historyRef.current.length) {
          historyIdxRef.current = idx;
          const h = historyRef.current[idx];
          // Clear current line
          term.write("\r\x1b[K");
          term.write("\x1b[1;34msequelit>\x1b[0m " + h);
          lineRef.current = h;
        }
      } else if (ev.keyCode === 40) {
        // Arrow down — history
        const idx = historyIdxRef.current - 1;
        if (idx < 0) {
          historyIdxRef.current = -1;
          term.write("\r\x1b[K");
          term.write("\x1b[1;34msequelit>\x1b[0m ");
          lineRef.current = "";
        } else {
          historyIdxRef.current = idx;
          const h = historyRef.current[idx];
          term.write("\r\x1b[K");
          term.write("\x1b[1;34msequelit>\x1b[0m " + h);
          lineRef.current = h;
        }
      } else if (ev.ctrlKey && (ev.key === "c" || ev.key === "C")) {
        lineRef.current = "";
        term.write("^C");
        term.write(PROMPT);
      } else if (ev.ctrlKey && (ev.key === "l" || ev.key === "L")) {
        term.clear();
        term.write(PROMPT);
      } else if (printable) {
        lineRef.current += key;
        term.write(key);
      }
    });

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(termRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.connectionId]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black">
      <div
        ref={termRef}
        className="flex-1 p-1"
        style={{ background: isDark ? "#0f1117" : "#ffffff" }}
      />
    </div>
  );
}
