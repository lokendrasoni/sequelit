import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "@/stores/tabStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, RefreshCw, Settings, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiSettings {
  ai_enabled: boolean;
  air_gapped: boolean;
  provider: string;
  model: string;
  base_url: string;
}

interface Props {
  tab: Tab;
}

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-1">
      <pre className="bg-muted rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
        {content}
      </pre>
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        title="Copy"
      >
        {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      </button>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const parts = msg.content.split(/(```[\s\S]*?```)/g);

  return (
    <div className={cn("flex gap-2 text-xs", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={12} className="text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 space-y-1",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/60 text-foreground"
        )}
      >
        {parts.map((part, i) => {
          if (part.startsWith("```") && part.endsWith("```")) {
            const lines = part.slice(3, -3).split("\n");
            const code = lines.slice(1).join("\n").trim() || lines[0];
            return <CodeBlock key={i} content={code} />;
          }
          return part ? (
            <p key={i} className="whitespace-pre-wrap leading-relaxed">{part}</p>
          ) : null;
        })}
      </div>
    </div>
  );
}

const SYSTEM_PROMPT = `You are an expert SQL assistant integrated into Sequelit, a desktop SQL client.
Help the user write, debug, and optimize SQL queries.
Format SQL in \`\`\`sql code blocks.
Be concise and practical.`;

export function AiAssistant({ tab }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSettings = useCallback(async () => {
    try {
      const s = await invoke<AiSettings>("get_ai_settings");
      setSettings(s);
    } catch (e) {
      setSettingsError(String(e));
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const reply = await invoke<string>("ai_chat_completion", {
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        connectionId: tab.connectionId,
        systemPrompt: SYSTEM_PROMPT,
      });
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(String(e));
      setMessages(newMessages.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (settingsError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-sm text-muted-foreground">
        <p className="text-destructive">{settingsError}</p>
        <Button size="sm" onClick={loadSettings}>Retry</Button>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings.air_gapped) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-sm text-muted-foreground p-8 text-center">
        <Bot size={32} className="text-muted-foreground/30" />
        <p className="font-medium">Air-gapped mode enabled</p>
        <p className="text-xs">AI features are disabled. Disable air-gapped mode in Preferences to use the AI assistant.</p>
      </div>
    );
  }

  if (!settings.ai_enabled) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-sm text-muted-foreground p-8 text-center">
        <Bot size={32} className="text-muted-foreground/30" />
        <p className="font-medium">AI assistant is disabled</p>
        <p className="text-xs">Enable AI in Preferences and configure your API key to get started.</p>
        <div className="flex items-center gap-1 text-xs mt-1">
          <Settings size={11} />
          <span>Open Preferences to configure</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <Bot size={14} className="text-primary" />
        <span className="text-sm font-medium">AI SQL Assistant</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {settings.provider} / {settings.model || "default"}
        </span>
        <button
          onClick={() => setMessages([])}
          className="text-muted-foreground hover:text-foreground ml-2"
          title="Clear conversation"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground pt-8 space-y-2">
            <Bot size={28} className="mx-auto text-muted-foreground/30" />
            <p>Ask me anything about SQL, query optimization, or your database schema.</p>
            <div className="space-y-1 text-left max-w-xs mx-auto">
              {[
                "Write a query to find duplicate rows in a table",
                "Explain what this query does: SELECT ...",
                "How do I optimize a slow JOIN query?",
                "Generate an index for this query",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="w-full text-left px-2 py-1.5 rounded border border-border/50 hover:border-border hover:bg-accent/40 text-xs transition-colors truncate"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
        {loading && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={12} className="text-primary" />
            </div>
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive bg-destructive/5 rounded p-2 border border-destructive/20">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border p-2 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about SQL or your database… (Enter to send, Shift+Enter for newline)"
          className="min-h-[60px] max-h-[120px] text-xs resize-none"
          disabled={loading}
        />
        <Button
          size="sm"
          onClick={send}
          disabled={!input.trim() || loading}
          className="shrink-0 h-8 w-8 p-0"
        >
          <Send size={13} />
        </Button>
      </div>
    </div>
  );
}
