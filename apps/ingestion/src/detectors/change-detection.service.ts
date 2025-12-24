/**
 * Change Detection Service
 * Implements sophisticated delta detection for Spanish Congressional data
 */

import type {
  EntityType,
  ChangeSet,
  FingerprintedEntity,
} from '../models/congressional-data.types';

export interface ChangeDetectionConfig {
  storeHistoricalData: boolean;
  maxHistoryDays: number;
  enableSemanticComparison: boolean;
  ignoreFields: string[];
  sensitiveFields: string[];
}

export interface ChangeMetadata {
  sourceId: string;
  entityType: EntityType;
  detectionTime: Date;
  previousSnapshot?: Date;
  currentSnapshot: Date;
  changeCount: number;
  significantChanges: number;
}

export class ChangeDetectionService {
  private readonly config: ChangeDetectionConfig;
  private readonly snapshots: Map<string, Map<string, FingerprintedEntity>>;

  constructor(config: Partial<ChangeDetectionConfig> = {}) {
    this.config = {
      storeHistoricalData: true,
      maxHistoryDays: 90,
      enableSemanticComparison: false,
      ignoreFields: ['updatedAt', 'createdAt', 'dataHash'],
      sensitiveFields: ['BIOGRAFIA', 'DESCRIPCION'],
      ...config,
    };

    this.snapshots = new Map();
  }

  /**
   * Detect changes between current data and previous snapshot
   */
  async detectChanges<T = any>(
    sourceId: string,
    entityType: EntityType,
    currentData: T[]
  ): Promise<ChangeSet<T>> {
    console.log(`[ChangeDetection] Analyzing changes for ${sourceId} (${currentData.length} records)`);

    const snapshotKey = `${sourceId}:${entityType}`;
    const previousSnapshot = this.snapshots.get(snapshotKey) || new Map();
    
    // Generate fingerprints for current data
    const currentFingerprints = await this.generateFingerprints(currentData);
    const currentSnapshot = new Map(
      currentFingerprints.map(fp => [fp.entity.externalId || this.generateEntityId(fp.entity), fp])
    );

    // Detect changes
    const changeSet = await this.computeChangeSet(previousSnapshot, currentSnapshot);
    
    // Store current snapshot for next comparison
    this.snapshots.set(snapshotKey, currentSnapshot);
    
    // Store historical data if enabled
    if (this.config.storeHistoricalData) {
      await this.storeChangeHistory(sourceId, entityType, changeSet);
    }

    console.log(`[ChangeDetection] Changes detected for ${sourceId}:`, {
      added: changeSet.added.length,
      modified: changeSet.modified.length,
      deleted: changeSet.deleted.length,
    });

    return changeSet;
  }

  /**
   * Generate content fingerprints for entities
   */
  private async generateFingerprints<T>(entities: T[]): Promise<FingerprintedEntity<T>[]> {
    const crypto = await import('crypto');
    const now = new Date();

    return entities.map(entity => {
      // Create a clean copy excluding ignored fields
      const cleanEntity = this.cleanEntityForFingerprinting(entity);
      
      // Generate SHA256 hash of the clean entity
      const fingerprint = crypto
        .createHash('sha256')
        .update(JSON.stringify(cleanEntity))
        .digest('hex');

      return {
        entity,
        fingerprint,
        lastSeen: now,
      };
    });
  }

  /**
   * Remove ignored fields from entity before fingerprinting
   */
  private cleanEntityForFingerprinting<T>(entity: T): Partial<T> {
    if (!entity || typeof entity !== 'object') {
      return entity;
    }

    const cleaned = { ...entity };
    
    // Remove ignored fields
    for (const field of this.config.ignoreFields) {
      delete (cleaned as any)[field];
    }

    return cleaned;
  }

  /**
   * Compute change set between two snapshots
   */
  private async computeChangeSet<T>(
    previous: Map<string, FingerprintedEntity<T>>,
    current: Map<string, FingerprintedEntity<T>>
  ): Promise<ChangeSet<T>> {
    const added: T[] = [];
    const modified: Array<{
      current: T;
      previous: T;
      changedFields: string[];
    }> = [];
    const deleted: string[] = [];

    // Find added and modified entities
    for (const [entityId, currentEntity] of current.entries()) {
      const previousEntity = previous.get(entityId);

      if (!previousEntity) {
        // New entity
        added.push(currentEntity.entity);
      } else if (previousEntity.fingerprint !== currentEntity.fingerprint) {
        // Modified entity
        const changedFields = await this.detectChangedFields(
          previousEntity.entity,
          currentEntity.entity
        );

        modified.push({
          current: currentEntity.entity,
          previous: previousEntity.entity,
          changedFields,
        });
      }
    }

    // Find deleted entities
    for (const [entityId] of previous.entries()) {
      if (!current.has(entityId)) {
        deleted.push(entityId);
      }
    }

    return { added, modified, deleted };
  }

  /**
   * Detect which fields changed between two entities
   */
  private async detectChangedFields<T>(previous: T, current: T): Promise<string[]> {
    if (!previous || !current || typeof previous !== 'object' || typeof current !== 'object') {
      return [];
    }

    const changedFields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(previous as any),
      ...Object.keys(current as any),
    ]);

    for (const key of allKeys) {
      if (this.config.ignoreFields.includes(key)) {
        continue;
      }

      const prevValue = (previous as any)[key];
      const currValue = (current as any)[key];

      if (this.hasValueChanged(prevValue, currValue)) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  /**
   * Check if a value has changed, with special handling for different types
   */
  private hasValueChanged(prevValue: any, currValue: any): boolean {
    // Handle null/undefined
    if (prevValue == null && currValue == null) {
      return false;
    }
    if (prevValue == null || currValue == null) {
      return true;
    }

    // Handle dates
    if (prevValue instanceof Date && currValue instanceof Date) {
      return prevValue.getTime() !== currValue.getTime();
    }

    // Handle arrays
    if (Array.isArray(prevValue) && Array.isArray(currValue)) {
      if (prevValue.length !== currValue.length) {
        return true;
      }
      return prevValue.some((item, index) => this.hasValueChanged(item, currValue[index]));
    }

    // Handle objects
    if (typeof prevValue === 'object' && typeof currValue === 'object') {
      const prevKeys = Object.keys(prevValue);
      const currKeys = Object.keys(currValue);
      
      if (prevKeys.length !== currKeys.length) {
        return true;
      }
      
      return prevKeys.some(key => this.hasValueChanged(prevValue[key], currValue[key]));
    }

    // Handle strings (with trimming and normalization)
    if (typeof prevValue === 'string' && typeof currValue === 'string') {
      return prevValue.trim() !== currValue.trim();
    }

    // Default comparison
    return prevValue !== currValue;
  }

  /**
   * Generate a unique ID for an entity
   */
  private generateEntityId<T>(entity: T): string {
    // Try common ID fields first
    const idFields = ['id', 'externalId', 'NUMEXPEDIENTE', 'NOMBRE'];
    
    for (const field of idFields) {
      const value = (entity as any)[field];
      if (value) {
        return String(value);
      }
    }

    // Fallback to hash of the entire entity
    const crypto = require('crypto');
    return crypto.createHash('md5').update(JSON.stringify(entity)).digest('hex');
  }

  /**
   * Store change history for audit purposes
   */
  private async storeChangeHistory<T>(
    sourceId: string,
    entityType: EntityType,
    changeSet: ChangeSet<T>
  ): Promise<void> {
    const metadata: ChangeMetadata = {
      sourceId,
      entityType,
      detectionTime: new Date(),
      currentSnapshot: new Date(),
      changeCount: changeSet.added.length + changeSet.modified.length + changeSet.deleted.length,
      significantChanges: this.countSignificantChanges(changeSet),
    };

    // TODO: Implement actual storage
    console.log(`[ChangeDetection] Storing change history:`, metadata);
  }

  /**
   * Count changes that are considered significant
   */
  private countSignificantChanges<T>(changeSet: ChangeSet<T>): number {
    let significant = 0;

    // All deletions are significant
    significant += changeSet.deleted.length;

    // Modified entities with changes in sensitive fields are significant
    significant += changeSet.modified.filter(change => 
      change.changedFields.some(field => this.config.sensitiveFields.includes(field))
    ).length;

    return significant;
  }

  /**
   * Get change statistics for a source
   */
  async getChangeStatistics(sourceId: string, entityType: EntityType, days: number = 30): Promise<{
    totalChanges: number;
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    averageChangesPerDay: number;
    mostChangedFields: Array<{ field: string; count: number }>;
  }> {
    // TODO: Implement actual statistics from stored history
    // This is a placeholder implementation
    
    return {
      totalChanges: 0,
      addedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      averageChangesPerDay: 0,
      mostChangedFields: [],
    };
  }

  /**
   * Clean up old snapshots and history
   */
  async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxHistoryDays);

    console.log(`[ChangeDetection] Cleaning up data older than ${cutoffDate.toISOString()}`);
    
    // TODO: Implement cleanup of stored historical data
  }

  /**
   * Export current snapshots for backup or analysis
   */
  async exportSnapshots(): Promise<Record<string, any>> {
    const exports: Record<string, any> = {};
    
    for (const [key, snapshot] of this.snapshots.entries()) {
      exports[key] = Object.fromEntries(snapshot);
    }
    
    return exports;
  }

  /**
   * Import snapshots from backup
   */
  async importSnapshots(data: Record<string, any>): Promise<void> {
    for (const [key, snapshotData] of Object.entries(data)) {
      const snapshot = new Map(Object.entries(snapshotData));
      this.snapshots.set(key, snapshot);
    }
    
    console.log(`[ChangeDetection] Imported ${Object.keys(data).length} snapshots`);
  }
}