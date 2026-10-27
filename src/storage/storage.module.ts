import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { LocalStorageService } from './local-storage.service';
import { MinioStorageService } from './minio-storage.service';
import { StorageService } from './storage.service';
import { ObjectStorage } from './storage.types';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

@Global()
@Module({
  providers: [
    LocalStorageService,
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfigService, LocalStorageService],
      useFactory: (
        config: AppConfigService,
        local: LocalStorageService,
      ): ObjectStorage => {
        const mode = (config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
        const minioReady = Boolean(
          config.get<string>('MINIO_ENDPOINT') &&
            config.get<string>('MINIO_BUCKET') &&
            config.get<string>('MINIO_ACCESS_KEY') &&
            config.get<string>('MINIO_SECRET_KEY'),
        );
        if (mode === 'minio' && minioReady) {
          return new MinioStorageService(config);
        }
        return local;
      },
    },
    {
      provide: StorageService,
      inject: [OBJECT_STORAGE],
      useFactory: (driver: ObjectStorage) => new StorageService(driver),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
