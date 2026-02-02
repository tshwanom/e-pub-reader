import { UploadThingDemo } from "@/components/UploadThingDemo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">ePub Reader Platform</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Your independent digital library is being built...
        </p>
        <div className="flex gap-4 justify-center">
          <div className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
            📚 Read
          </div>
          <div className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md">
            🎧 Listen
          </div>
          <div className="px-4 py-2 bg-accent text-accent-foreground rounded-md">
            🖨️ Print
          </div>
        </div>
      </div>

      <div className="w-full max-w-md border rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">File Upload Demo</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Test UploadThing integration (requires API keys)
        </p>
        <UploadThingDemo />
      </div>
    </main>
  );
}
