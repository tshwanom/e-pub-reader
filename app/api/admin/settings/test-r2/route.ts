import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

function isAdminSession(session: any) {
  return session?.user?.role === "ADMIN";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      r2Region,
      r2Endpoint,
      r2AccessKeyId,
      r2SecretAccessKey,
      r2BucketName,
      r2ForcePathStyle,
    } = await req.json();

    // Load existing settings to resolve masked values if necessary
    const existingRecord = await prisma.siteSettings.findFirst();
    let existingSettings: any = {};

    if (existingRecord?.storageSettings) {
      const decrypted = decrypt(existingRecord.storageSettings);
      if (decrypted) {
        existingSettings = JSON.parse(decrypted);
      }
    }

    const existingR2 = existingSettings.r2 || {};

    let accessKeyId = r2AccessKeyId || "";
    let secretAccessKey = r2SecretAccessKey || "";
    let bucketName = r2BucketName || "";

    if (accessKeyId === "••••••••••••••••••••" || !accessKeyId) {
      accessKeyId = existingR2.accessKeyId || "";
    }
    if (secretAccessKey === "••••••••••••••••••••" || !secretAccessKey) {
      secretAccessKey = existingR2.secretAccessKey || "";
    }
    if (!bucketName) {
      bucketName = existingR2.bucketName || "";
    }

    if (!accessKeyId || !secretAccessKey || !bucketName) {
      return NextResponse.json({
        success: false,
        error: "R2 bucket name, access key ID, and secret access key are required to test the connection."
      }, { status: 400 });
    }

    const clientConfig = {
      region: r2Region || "auto",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      ...(r2Endpoint ? { endpoint: r2Endpoint } : {}),
      forcePathStyle: !!r2ForcePathStyle,
    };

    const client = new S3Client(clientConfig);

    await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        MaxKeys: 1,
      })
    );

    return NextResponse.json({ success: true, message: "Successfully connected to Cloudflare R2!" });
  } catch (error: any) {
    console.error("R2 connection test error:", error);

    let friendlyMessage = error.message || "An unknown error occurred while connecting to R2.";
    
    if (error.name === "NoSuchBucket") {
      friendlyMessage = "The bucket does not exist. Please check the bucket name.";
    } else if (error.name === "InvalidAccessKeyId" || error.message?.includes("AccessKeyId")) {
      friendlyMessage = "Invalid Access Key ID. Please verify your credentials.";
    } else if (error.name === "SignatureDoesNotMatch" || error.message?.includes("Signature")) {
      friendlyMessage = "Signature mismatch. Please verify your Secret Access Key.";
    } else if (error.name === "AccessDenied" || error.message?.includes("Access Denied") || error.$metadata?.httpStatusCode === 403) {
      friendlyMessage = "Access denied. Ensure the API credentials have read/write/list permissions for this bucket.";
    } else if (error.code === "ENOTFOUND" || error.message?.includes("ENOTFOUND")) {
      friendlyMessage = "Endpoint or bucket host could not be resolved. Please verify the Endpoint URL.";
    }

    return NextResponse.json({
      success: false,
      error: friendlyMessage,
    }, { status: 400 });
  }
}
