import { Injectable } from '@nestjs/common';
import { config as loadEnv } from 'dotenv';

loadEnv();

@Injectable()
export class AppConfigService {
  get<T extends string = string>(key: string): T | undefined {
    return process.env[key] as T | undefined;
  }

  getOrThrow(key: string): string {
    const value = process.env[key];
    if (value === undefined || value === '') {
      throw new Error(`Configuration key "${key}" does not exist`);
    }
    return value;
  }
}
