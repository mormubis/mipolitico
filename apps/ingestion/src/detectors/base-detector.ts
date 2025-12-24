import { Observable } from 'rxjs';

export interface ChangeResult<T> {
  entity: T;
  changeType: 'added' | 'modified' | 'deleted';
  fingerprint: string;
  previousFingerprint?: string;
  changedFields?: string[];
}

export interface DetectionConfig {
  ignoreFields?: string[];
  sensitiveFields?: string[];
  enableSemanticComparison?: boolean;
  fingerprintAlgorithm?: 'sha256' | 'md5';
}

export abstract class BaseDetector<T> {
  protected config: DetectionConfig;

  constructor(config: DetectionConfig = {}) {
    this.config = config;
  }

  abstract detect(current: T[], previous: T[]): Observable<ChangeResult<T>[]>;
  abstract generateFingerprint(entity: T): Observable<string>;
  abstract compareEntities(current: T, previous: T): Observable<string[]>;
}