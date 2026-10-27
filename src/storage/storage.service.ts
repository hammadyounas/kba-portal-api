import { Injectable } from '@nestjs/common';
import {
  ObjectStorage,
  StoredObject,
  StoredObjectMeta,
} from './storage.types';

@Injectable()
export class StorageService implements ObjectStorage {
  constructor(private readonly driver: ObjectStorage) {}

  putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    return this.driver.putObject(key, body, contentType);
  }

  getObject(key: string): Promise<Buffer> {
    return this.driver.getObject(key);
  }

  deleteObject(key: string): Promise<void> {
    return this.driver.deleteObject(key);
  }

  getMeta(key: string): Promise<StoredObjectMeta> {
    return this.driver.getMeta(key);
  }
}
