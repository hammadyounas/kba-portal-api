export type StoredObject = {
  key: string;
  sizeBytes: number;
};

export type StoredObjectMeta = {
  key: string;
  sizeBytes: number;
  exists: boolean;
};

export interface ObjectStorage {
  putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  getMeta(key: string): Promise<StoredObjectMeta>;
}
