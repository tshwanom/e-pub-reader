import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { z } from "zod";

export const runtime = "nodejs";

const settingsSchema = z.object({
  storageProvider: z.enum(["local", "r2", "hybrid"]),
  signedUrlTtlSeconds: z.coerce.number().int().positive().default(900),
  narrationPrefix: z.string().min(1).default("narration"),
  localBaseDir: z.string().default("storage"),
  r2Region: z.string().default("auto"),
  r2Endpoint: z.string().optional().or(z.literal("")),
  r2AccessKeyId: z.string().optional().or(z.literal("")),
  r2SecretAccessKey: z.string().optional().or(z.literal("")),
  r2BucketName: z.string().optional().or(z.literal("")),
  r2ForcePathStyle: z.boolean().default(false),
  r2PublicDomain: z.string().optional().or(z.literal("")),
});

function isAdminSession(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await prisma.siteSettings.findFirst();
    
    let storageProvider = "local";
    let rawSettings: any = {};

    if (settings) {
      storageProvider = settings.storageProvider || "local";
      if (settings.storageSettings) {
        const decrypted = decrypt(settings.storageSettings);
        if (decrypted) {
          rawSettings = JSON.parse(decrypted);
        }
      }
    }

    const localSettings = rawSettings.local || {};
    const r2Settings = rawSettings.r2 || {};

    return NextResponse.json({
      storageProvider,
      signedUrlTtlSeconds: rawSettings.signedUrlTtlSeconds ?? 900,
      narrationPrefix: rawSettings.narrationPrefix ?? "narration",
      localBaseDir: localSettings.localBaseDir ?? "storage",
      r2Region: r2Settings.region ?? "auto",
      r2Endpoint: r2Settings.endpoint ?? "",
      r2AccessKeyId: r2Settings.accessKeyId ?? "",
      r2SecretAccessKey: "",
      hasR2SecretAccessKey: !!r2Settings.secretAccessKey,
      r2BucketName: r2Settings.bucketName ?? "",
      r2ForcePathStyle: r2Settings.forcePathStyle ?? false,
      r2PublicDomain: r2Settings.publicDomain ?? "",
    });
  } catch (error) {
    console.error("GET admin settings error:", error);
    return NextResponse.json({ error: "Failed to retrieve settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = settingsSchema.parse(await req.json());

    // Load existing settings to preserve masked keys
    const existingRecord = await prisma.siteSettings.findFirst();
    let existingSettings: any = {};

    if (existingRecord?.storageSettings) {
      const decrypted = decrypt(existingRecord.storageSettings);
      if (decrypted) {
        existingSettings = JSON.parse(decrypted);
      }
    }

    // Resolve R2 credentials (preserve existing if submitted values are masked or empty)
    let accessKeyId = body.r2AccessKeyId || "";
    let secretAccessKey = body.r2SecretAccessKey || "";

    const existingR2 = existingSettings.r2 || {};

    if (accessKeyId === "••••••••••••••••••••" || !accessKeyId) {
      accessKeyId = existingR2.accessKeyId || "";
    }
    if (secretAccessKey === "••••••••••••••••••••" || !secretAccessKey) {
      secretAccessKey = existingR2.secretAccessKey || "";
    }

    // Validate that R2 credentials exist if provider is R2 or hybrid
    if ((body.storageProvider === "r2" || body.storageProvider === "hybrid") && 
        (!accessKeyId || !secretAccessKey || !body.r2BucketName)) {
      return NextResponse.json({ 
        error: "R2 bucket name, access key ID, and secret access key are required for R2/Hybrid mode." 
      }, { status: 400 });
    }

    // Format structure to save
    const settingsPayload = {
      signedUrlTtlSeconds: body.signedUrlTtlSeconds,
      narrationPrefix: body.narrationPrefix,
      local: {
        localBaseDir: body.localBaseDir || "storage",
      },
      r2: {
        region: body.r2Region || "auto",
        endpoint: body.r2Endpoint || undefined,
        accessKeyId,
        secretAccessKey,
        bucketName: body.r2BucketName || "",
        forcePathStyle: body.r2ForcePathStyle,
        publicDomain: body.r2PublicDomain || undefined,
      },
      hybrid: {
        narrationPrefix: body.narrationPrefix,
        signedUrlTtlSeconds: body.signedUrlTtlSeconds,
        localConfig: {
          provider: "local",
          localBaseDir: body.localBaseDir || "storage",
        },
        r2Config: {
          provider: "r2",
          region: body.r2Region || "auto",
          endpoint: body.r2Endpoint || undefined,
          accessKeyId,
          secretAccessKey,
          bucketName: body.r2BucketName || "",
          forcePathStyle: body.r2ForcePathStyle,
          publicDomain: body.r2PublicDomain || undefined,
        }
      }
    };

    const encryptedSettings = encrypt(JSON.stringify(settingsPayload));

    if (existingRecord) {
      await prisma.siteSettings.update({
        where: { id: existingRecord.id },
        data: {
          storageProvider: body.storageProvider,
          storageSettings: encryptedSettings,
        },
      });
    } else {
      await prisma.siteSettings.create({
        data: {
          storageProvider: body.storageProvider,
          storageSettings: encryptedSettings,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST admin settings error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
