import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useThemeStore } from "@/stores/themeStore";
import { Settings, Bot, Shield, Palette, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type PrefSection = "appearance" | "ai" | "security";

interface AiSettings {
  ai_enabled: boolean;
  air_gapped: boolean;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PreferencesDialog({ open, onClose }: Props) {
  const [section, setSection] = useState<PrefSection>("appearance");
  const { theme, setTheme } = useThemeStore();

  const [ai, setAi] = useState<AiSettings>({
    ai_enabled: false,
    air_gapped: false,
    provider: "anthropic",
    model: "",
    base_url: "",
    api_key: "",
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSaved, setAiSaved] = useState(false);

  useEffect(() => {
    if (open && section === "ai") loadAi();
  }, [open, section]);

  const loadAi = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const s = await invoke<AiSettings>("get_ai_settings");
      setAi({ ...s, api_key: "" });
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const saveAi = async () => {
    setAiSaving(true);
    setAiError("");
    try {
      await invoke("save_ai_settings", {
        provider: ai.provider,
        apiKey: ai.api_key || null,
        model: ai.model || null,
        baseUrl: ai.base_url || null,
        aiEnabled: ai.ai_enabled,
        airGapped: ai.air_gapped,
      });
      setAiSaved(true);
      setTimeout(() => setAiSaved(false), 2000);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiSaving(false);
    }
  };

  const PROVIDER_DEFAULTS: Record<string, { model: string; base_url: string }> = {
    anthropic: { model: "claude-sonnet-4-5", base_url: "" },
    openai: { model: "gpt-4o", base_url: "" },
    custom: { model: "", base_url: "http://localhost:11434" },
  };

  const navItems: { id: PrefSection; label: string; Icon: React.ElementType }[] = [
    { id: "appearance", label: "Appearance", Icon: Palette },
    { id: "ai", label: "AI Assistant", Icon: Bot },
    { id: "security", label: "Security", Icon: Shield },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex h-[480px]">
          {/* Nav */}
          <div className="w-44 border-r border-border bg-muted/30 flex flex-col shrink-0">
            <DialogHeader className="px-4 py-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Settings size={14} />
                Preferences
              </DialogTitle>
            </DialogHeader>
            <nav className="flex-1 p-2 space-y-0.5">
              {navItems.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors",
                    section === id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon size={12} className="shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {section === "appearance" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Appearance</h3>
                <div className="space-y-1.5">
                  <Label className="text-xs">Theme</Label>
                  <Select value={theme} onValueChange={(v) => setTheme(v as "dark" | "light" | "system")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {section === "ai" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">AI Assistant</h3>

                {aiLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw size={12} className="animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ai.ai_enabled}
                          onChange={(e) => setAi({ ...ai, ai_enabled: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <span className="text-xs font-medium">Enable AI Assistant</span>
                          <p className="text-xs text-muted-foreground">Requires an API key from your chosen provider</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ai.air_gapped}
                          onChange={(e) => setAi({ ...ai, air_gapped: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <span className="text-xs font-medium">Air-gapped mode</span>
                          <p className="text-xs text-muted-foreground">Disable all outbound calls (overrides AI enabled)</p>
                        </div>
                      </label>
                    </div>

                    {ai.ai_enabled && !ai.air_gapped && (
                      <div className="space-y-3 border-t border-border pt-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Provider</Label>
                          <Select
                            value={ai.provider}
                            onValueChange={(v) => {
                              const d = PROVIDER_DEFAULTS[v] ?? { model: "", base_url: "" };
                              setAi({ ...ai, provider: v, model: ai.model || d.model, base_url: d.base_url });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                              <SelectItem value="openai">OpenAI</SelectItem>
                              <SelectItem value="custom">Custom / Ollama</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">API Key</Label>
                          <Input
                            type="password"
                            value={ai.api_key}
                            onChange={(e) => setAi({ ...ai, api_key: e.target.value })}
                            placeholder="Leave blank to keep existing key"
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Model</Label>
                          <Input
                            value={ai.model}
                            onChange={(e) => setAi({ ...ai, model: e.target.value })}
                            placeholder={PROVIDER_DEFAULTS[ai.provider]?.model || "model name"}
                            className="h-8 text-xs"
                          />
                        </div>

                        {ai.provider === "custom" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Base URL</Label>
                            <Input
                              value={ai.base_url}
                              onChange={(e) => setAi({ ...ai, base_url: e.target.value })}
                              placeholder="http://localhost:11434"
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {aiError && (
                      <p className="text-xs text-destructive">{aiError}</p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" onClick={saveAi} disabled={aiSaving} className="text-xs h-7">
                        {aiSaving ? "Saving…" : aiSaved ? "Saved!" : "Save AI Settings"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {section === "security" && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Security</h3>
                <div className="rounded border border-border bg-muted/20 p-3 text-xs text-muted-foreground space-y-2">
                  <p><strong className="text-foreground">Credential encryption:</strong> All database passwords are encrypted at rest using AES-256-GCM before storage in the local SQLite database.</p>
                  <p><strong className="text-foreground">Encryption key:</strong> Stored in your app data directory. Never leaves your machine.</p>
                  <p><strong className="text-foreground">No telemetry:</strong> Sequelit never phones home. The only outbound connections are to your configured database servers and (optionally) your chosen AI provider.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
