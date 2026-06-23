"use client";

import { useEffect, useState } from "react";
import { 
  Settings, 
  Save, 
  Server, 
  Cloud, 
  Database, 
  ShieldCheck, 
  AlertCircle, 
  Loader2 
} from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasR2SecretAccessKey, setHasR2SecretAccessKey] = useState(false);

  const [form, setForm] = useState({
    storageProvider: "local",
    signedUrlTtlSeconds: 900,
    narrationPrefix: "narration",
    localBaseDir: "storage",
    r2Region: "auto",
    r2Endpoint: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2BucketName: "",
    r2ForcePathStyle: false,
    r2PublicDomain: "",
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/admin/settings");
        if (!response.ok) {
          throw new Error("Failed to load settings");
        }
        const data = await response.json();
        setHasR2SecretAccessKey(data.hasR2SecretAccessKey ?? false);
        setForm({
          storageProvider: data.storageProvider ?? "local",
          signedUrlTtlSeconds: data.signedUrlTtlSeconds ?? 900,
          narrationPrefix: data.narrationPrefix ?? "narration",
          localBaseDir: data.localBaseDir ?? "storage",
          r2Region: data.r2Region ?? "auto",
          r2Endpoint: data.r2Endpoint ?? "",
          r2AccessKeyId: data.r2AccessKeyId ?? "",
          r2SecretAccessKey: data.r2SecretAccessKey ?? "",
          r2BucketName: data.r2BucketName ?? "",
          r2ForcePathStyle: data.r2ForcePathStyle ?? false,
          r2PublicDomain: data.r2PublicDomain ?? "",
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  const handleChange = (
    field: string,
    value: string | number | boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSuccess(false);
    setError(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/admin/settings/test-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2Region: form.r2Region,
          r2Endpoint: form.r2Endpoint,
          r2AccessKeyId: form.r2AccessKeyId,
          r2SecretAccessKey: form.r2SecretAccessKey,
          r2BucketName: form.r2BucketName,
          r2ForcePathStyle: form.r2ForcePathStyle,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Connection test failed.");
      }

      setTestResult({
        success: true,
        message: data.message || "Successfully connected to Cloudflare R2!",
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setSuccess(true);
      if (form.r2SecretAccessKey) {
        setHasR2SecretAccessKey(true);
        setForm((prev) => ({
          ...prev,
          r2SecretAccessKey: "",
        }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-landing-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="surface-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
              System Settings
            </p>
            <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">
              Storage Configuration
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
              Configure Cloudflare R2 and local storage. Run in hybrid mode to store files both locally and in the cloud, while automatically encrypting keys at rest.
            </p>
          </div>
          <span className="rounded-2xl bg-landing-accent/10 p-3 text-landing-accent">
            <Settings className="h-6 w-6" />
          </span>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>Settings saved successfully! Active keys are encrypted at rest.</div>
          </div>
        )}

        <section className="surface-card p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-landing-text">Storage Strategy</h2>
            <p className="mt-1 text-sm text-landing-text-muted">
              Select where the catalog narration audio and metadata manifests are stored.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                id: "local",
                label: "Local disk",
                description: "Save directly on the hosting server's persistent disk",
                icon: Server,
              },
              {
                id: "r2",
                label: "Cloudflare R2",
                description: "Deliver directly from Cloudflare's S3-compatible cloud storage",
                icon: Cloud,
              },
              {
                id: "hybrid",
                label: "Hybrid (R2 + Local)",
                description: "Write to both systems simultaneously; read from cloud with local fallback",
                icon: Database,
              },
            ].map((option) => {
              const Icon = option.icon;
              const active = form.storageProvider === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleChange("storageProvider", option.id)}
                  className={[
                    "flex flex-col text-left p-5 rounded-2xl transition-all duration-200 ring-1",
                    active
                      ? "bg-landing-accent/5 ring-landing-accent/35 border-transparent shadow-sm"
                      : "bg-white ring-landing-border hover:bg-landing-accent/5 hover:ring-landing-accent/20",
                  ].join(" ")}
                >
                  <span className={["rounded-xl p-2 w-fit mb-3", active ? "bg-landing-accent/15 text-landing-accent" : "bg-landing-accent/5 text-landing-accent-secondary"].join(" ")}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="block font-semibold text-landing-text text-sm">{option.label}</span>
                  <span className="block text-xs leading-5 text-landing-text-muted mt-1">{option.description}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 border-t border-landing-border/50 pt-6">
            <div>
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Object path prefix</span>
                <input
                  type="text"
                  value={form.narrationPrefix}
                  onChange={(e) => handleChange("narrationPrefix", e.target.value)}
                  required
                  placeholder="narration"
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>
              <span className="mt-2 block text-xs text-landing-text-muted leading-relaxed">
                Namespace directory for files (e.g. <code>narration/book-123/...</code>).
              </span>
            </div>

            <div>
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Signed URL expiration (seconds)</span>
                <input
                  type="number"
                  value={form.signedUrlTtlSeconds}
                  onChange={(e) => handleChange("signedUrlTtlSeconds", parseInt(e.target.value) || 0)}
                  required
                  min="60"
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>
              <span className="mt-2 block text-xs text-landing-text-muted leading-relaxed">
                Time-to-live for secure cloud asset URLs (recommended: 900s).
              </span>
            </div>
          </div>
        </section>

        {(form.storageProvider === "local" || form.storageProvider === "hybrid") && (
          <section className="surface-card p-6 sm:p-8 space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-lg font-semibold text-landing-text flex items-center gap-2">
                <Server className="h-5 w-5 text-landing-accent" />
                Local Directory Settings
              </h2>
              <p className="mt-1 text-sm text-landing-text-muted">
                Define the absolute or relative folder path on the web server where audio files are stored.
              </p>
            </div>

            <div>
              <label className="block text-sm text-landing-text-muted">
                <span className="mb-2 block font-medium text-landing-text">Storage base directory</span>
                <input
                  type="text"
                  value={form.localBaseDir}
                  onChange={(e) => handleChange("localBaseDir", e.target.value)}
                  required
                  placeholder="storage"
                  className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                />
              </label>
              <span className="mt-2 block text-xs text-landing-text-muted leading-relaxed">
                Defaults to a <code>storage</code> folder inside the project root directory. Ensure this folder is persistent on deployments.
              </span>
            </div>
          </section>
        )}

        {(form.storageProvider === "r2" || form.storageProvider === "hybrid") && (
          <section className="surface-card p-6 sm:p-8 space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-lg font-semibold text-landing-text flex items-center gap-2">
                <Cloud className="h-5 w-5 text-landing-accent" />
                Cloudflare R2 Settings
              </h2>
              <p className="mt-1 text-sm text-landing-text-muted">
                Configure connection credentials for your Cloudflare R2 bucket. All access keys are encrypted before database insertion.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Bucket name</span>
                  <input
                    type="text"
                    value={form.r2BucketName}
                    onChange={(e) => handleChange("r2BucketName", e.target.value)}
                    required={form.storageProvider === "r2" || form.storageProvider === "hybrid"}
                    placeholder="e.g. my-epub-library"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Region (optional)</span>
                  <input
                    type="text"
                    value={form.r2Region}
                    onChange={(e) => handleChange("r2Region", e.target.value)}
                    placeholder="auto"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Custom endpoint URL (optional)</span>
                  <input
                    type="url"
                    value={form.r2Endpoint}
                    onChange={(e) => handleChange("r2Endpoint", e.target.value)}
                    placeholder="https://<account-id>.r2.cloudflarestorage.com"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
                <span className="mt-2 block text-xs text-landing-text-muted leading-relaxed">
                  Provide this if you want to bypass auto-derivation or use a custom storage proxy URL.
                </span>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Public custom domain (optional)</span>
                  <input
                    type="text"
                    value={form.r2PublicDomain}
                    onChange={(e) => handleChange("r2PublicDomain", e.target.value)}
                    placeholder="e.g. data.1manrevolution.com"
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
                <span className="mt-2 block text-xs text-landing-text-muted leading-relaxed">
                  Provide this if you want the public audio file URLs to use a custom domain bound to your R2 bucket instead of presigned R2 URLs.
                </span>
              </div>

              <div>
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Access key ID</span>
                  <input
                    type="text"
                    value={form.r2AccessKeyId}
                    onChange={(e) => handleChange("r2AccessKeyId", e.target.value)}
                    required={form.storageProvider === "r2" || form.storageProvider === "hybrid"}
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm text-landing-text-muted">
                  <span className="mb-2 block font-medium text-landing-text">R2 Secret access key</span>
                  <input
                    type="password"
                    value={form.r2SecretAccessKey}
                    onChange={(e) => handleChange("r2SecretAccessKey", e.target.value)}
                    required={(form.storageProvider === "r2" || form.storageProvider === "hybrid") && !hasR2SecretAccessKey && !form.r2SecretAccessKey}
                    placeholder={hasR2SecretAccessKey ? "••••••••••••••••••••" : "Enter secret key"}
                    className="w-full rounded-2xl border border-landing-border bg-white px-4 py-3 text-sm text-landing-text shadow-sm focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/25"
                  />
                </label>
              </div>

              <div className="sm:col-span-2 flex items-center gap-3 bg-landing-accent/5 rounded-2xl p-4 ring-1 ring-landing-accent/10">
                <input
                  type="checkbox"
                  id="r2ForcePathStyle"
                  checked={form.r2ForcePathStyle}
                  onChange={(e) => handleChange("r2ForcePathStyle", e.target.checked)}
                  className="h-4 w-4 rounded border-landing-border text-landing-accent focus:ring-landing-accent"
                />
                <label htmlFor="r2ForcePathStyle" className="text-sm font-medium text-landing-text cursor-pointer">
                  Force path style URLs
                  <span className="block mt-1 text-xs font-normal text-landing-text-muted">
                    Bypass virtual-hosted bucket naming convention (recommended for standard R2 configurations: off).
                  </span>
                </label>
              </div>

              <div className="sm:col-span-2 border-t border-landing-border/50 pt-6 flex flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-landing-text-muted">
                    Test connection credentials and bucket accessibility.
                  </span>
                  <button
                    type="button"
                    disabled={testingConnection}
                    onClick={handleTestConnection}
                    className="brand-button bg-white text-landing-text-secondary border border-landing-border hover:bg-landing-accent/5 hover:text-landing-accent hover:border-landing-accent/30 gap-2 px-4 py-2 text-xs flex items-center justify-center"
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Testing connection...
                      </>
                    ) : (
                      <>
                        <Settings className="h-3.5 w-3.5" />
                        Test Connection
                      </>
                    )}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={[
                      "flex items-start gap-3 rounded-2xl p-4 text-xs ring-1 animate-fadeIn",
                      testResult.success
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-rose-200",
                    ].join(" ")}
                  >
                    {testResult.success ? (
                      <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    )}
                    <div>{testResult.message}</div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="brand-button gap-2 px-6 py-3 disabled:cursor-not-allowed disabled:bg-landing-accent/50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving settings...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Storage Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
