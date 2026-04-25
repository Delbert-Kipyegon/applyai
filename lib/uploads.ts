import { ensureIndexes, getDb } from "./mongodb";
import type { StoredCvAsset } from "./cloudinary-storage";
import type { MalwareScanResult } from "./malware-scan";

type UploadLog = {
  deviceHash: string;
  ipHash: string;
  fileName: string;
  fileType: string;
  extension?: string;
  fileSize: number;
  status: "accepted" | "rejected";
  reason?: string;
  scan?: MalwareScanResult;
  storage?: StoredCvAsset;
};

export async function logUpload(log: UploadLog) {
  try {
    await ensureIndexes();
    const db = await getDb();
    await db.collection("uploads").insertOne({
      ...log,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Upload audit log failed", error);
  }
}
