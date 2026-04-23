import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { useThemeStore } from "@/stores/themeStore";

const themeCompartment = new Compartment();

const lightTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", height: "100%" },
  ".cm-content": { fontFamily: "ui-monospace, monospace", fontSize: "13px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#94a3b8" },
  ".cm-activeLineGutter": { backgroundColor: "#f1f5f9" },
  ".cm-activeLine": { backgroundColor: "#f1f5f920" },
}, { dark: false });

const darkTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", height: "100%" },
  ".cm-content": { fontFamily: "ui-monospace, monospace", fontSize: "13px", color: "#e2e8f0" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#475569" },
  ".cm-activeLineGutter": { backgroundColor: "#1e293b" },
  ".cm-activeLine": { backgroundColor: "#1e293b40" },
  ".cm-cursor": { borderLeftColor: "#818cf8" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#312e81" },
}, { dark: true });

interface Props {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  dbType?: string;
}

export function SqlEditor({ value, onChange, onExecute, dbType = "postgres" }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onExecuteRef = useRef(onExecute);
  useEffect(() => { onExecuteRef.current = onExecute; });
  const { resolvedTheme } = useThemeStore();
  const isDark = resolvedTheme() === "dark";

  const sqlDialect = dbType === "mysql" ? MySQL : dbType === "sqlite" ? SQLite : PostgreSQL;

  useEffect(() => {
    if (!editorRef.current) return;

    const executeCmd = keymap.of([
      {
        key: "Mod-Enter",
        run: () => { onExecuteRef.current(); return true; },
      },
      {
        key: "F5",
        run: () => { onExecuteRef.current(); return true; },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        executeCmd,
        sql({ dialect: sqlDialect }),
        autocompletion(),
        themeCompartment.of(isDark ? [oneDark, darkTheme] : [lightTheme, syntaxHighlighting(defaultHighlightStyle)]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbType]);

  // Sync theme changes without recreating editor
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: themeCompartment.reconfigure(
          isDark ? [oneDark, darkTheme] : [lightTheme, syntaxHighlighting(defaultHighlightStyle)]
        ),
      });
    }
  }, [isDark]);

  // Sync external value changes (e.g. loading a saved query)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={editorRef} className="h-full overflow-auto" />;
}
