import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";

export type StoredCvAsset = {
  provider: "cloudinary";
  publicId: string;
  assetId: string;
  resourceType: string;
  format?: string;
  bytes: number;
  secureUrl?: string;
  folder: string;
};

export function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

export async function storeCvInCloudinary(file: File, bytes: Uint8Array): Promise<StoredCvAsset | undefined> {
  if (!isCloudinaryConfigured()) return undefined;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const folder = process.env.CLOUDINARY_CV_FOLDER || "boltiply/cvs";
  const result = await uploadBuffer(Buffer.from(bytes), {
    folder,
    resource_type: "raw",
    type: "authenticated",
    use_filename: true,
    unique_filename: true,
    filename_override: sanitizeFilename(file.name),
    context: {
      original_filename: file.name,
      content_type: file.type || "application/octet-stream",
    },
  });

  return {
    provider: "cloudinary",
    publicId: result.public_id,
    assetId: result.asset_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    secureUrl: result.secure_url,
    folder,
  };
}

function uploadBuffer(
  buffer: Buffer,
  options: UploadApiOptions,
) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        reject(error || new Error("Cloudinary upload failed."));
        return;
      }

      resolve(result);
    });

    stream.end(buffer);
  });
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "cv-upload";
}
