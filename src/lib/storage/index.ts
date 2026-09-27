import "server-only";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Private bucket. Keys never reach the client; access is only through 5-minute signed URLs
// issued by /api/files/[id] after a permission + Meeting Mode check.
export const SIGNED_URL_TTL_SECONDS = 300;

const bucket = () => process.env.S3_BUCKET ?? "mhf-private";

let client: S3Client | undefined;
function s3() {
  client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: true, // MinIO; harmless on R2
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket() })); // new buckets are private
  }
  bucketReady = true;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await ensureBucket();
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function signedGetUrl(key: string, opts: { download?: string; contentType: string }) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseCacheControl: "private, no-store",
      ResponseContentDisposition: opts.download ? `attachment; filename="${opts.download.replace(/"/g, "")}"` : "inline",
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
