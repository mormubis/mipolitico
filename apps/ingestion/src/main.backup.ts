/**
 * Data Ingestion Service - Main Entry Point
 * Spanish Congressional Data Management System
 */

import { DataSourceService } from './connectors/data-source.service';
import { ChangeDetectionService } from './detectors/change-detection.service';
import { IngestionPipelineService } from './services/ingestion-pipeline.service';

async function main() {
  console.log('🏛️  Starting Spanish Congressional Data Ingestion Service...');
  console.log('📅', new Date().toISOString());

  try {
    // Initialize services
    const changeDetectionService = new ChangeDetectionService({
      storeHistoricalData: true,
      maxHistoryDays: 90,
      enableSemanticComparison: false,
    });

    const dataSourceService = new DataSourceService({
      timeout: 30000,
      retries: 3,
      userAgent: 'CongressDataBot/1.0',
    });

    const pipelineService = new IngestionPipelineService(
      {
        enableChangeDetection: true,
        enableValidation: true,
        maxConcurrentJobs: 3,
        retryFailedJobs: true,
        notifyOnChanges: true,
      },
      changeDetectionService,
      dataSourceService,
    );

    // Check if we have command line arguments for specific operations
    const args = process.argv.slice(2);

    if (args.includes('--test-sources')) {
      await testDataSources(dataSourceService);
      return;
    }

    if (args.includes('--source') && args.length >= 2) {
      const sourceId = args[args.indexOf('--source') + 1];
      await runSingleSource(pipelineService, dataSourceService, sourceId);
      return;
    }

    if (args.includes('--cleanup')) {
      await cleanupOldData(changeDetectionService);
      return;
    }

    // Default: Run full ingestion pipeline
    await runFullIngestion(pipelineService);
  } catch (error) {
    console.error('❌ Fatal error in data ingestion service:', error);
    process.exit(1);
  }
}

/**
 * Run full ingestion for all enabled sources
 */
async function runFullIngestion(pipelineService: IngestionPipelineService) {
  console.log('📊 Running full data ingestion...');

  const results = await pipelineService.ingestAllSources();

  // Summary report
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalRecords = results.reduce(
    (sum, r) => sum + r.ingestionResult.recordsProcessed,
    0,
  );
  const totalChanges = results.reduce(
    (sum, r) =>
      sum +
      r.ingestionResult.recordsAdded +
      r.ingestionResult.recordsModified +
      r.ingestionResult.recordsDeleted,
    0,
  );

  console.log('\n📋 Ingestion Summary:');
  console.log(`✅ Successful sources: ${successful}`);
  console.log(`❌ Failed sources: ${failed}`);
  console.log(`📄 Total records processed: ${totalRecords.toLocaleString()}`);
  console.log(`🔄 Total changes detected: ${totalChanges.toLocaleString()}`);

  // Log details for each source
  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`;
    const stats = `${result.ingestionResult.recordsProcessed} processed, ${result.ingestionResult.recordsAdded} added, ${result.ingestionResult.recordsModified} modified`;

    console.log(`${status} ${result.sourceId}: ${stats} (${duration})`);

    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (
      result.ingestionResult.errors &&
      result.ingestionResult.errors.length > 0
    ) {
      console.log(
        `   Warnings: ${result.ingestionResult.errors.slice(0, 3).join(', ')}`,
      );
      if (result.ingestionResult.errors.length > 3) {
        console.log(
          `   ... and ${result.ingestionResult.errors.length - 3} more`,
        );
      }
    }
  }

  console.log('\n🏛️  Data ingestion completed');
}

/**
 * Run ingestion for a single source
 */
async function runSingleSource(
  pipelineService: IngestionPipelineService,
  dataSourceService: DataSourceService,
  sourceId: string,
) {
  console.log(`📊 Running ingestion for source: ${sourceId}`);

  const sources = await dataSourceService.getEnabledSources();
  const sourceConfig = sources.find((s) => s.id === sourceId);

  if (!sourceConfig) {
    console.error(`❌ Source not found: ${sourceId}`);
    console.log('Available sources:', sources.map((s) => s.id).join(', '));
    process.exit(1);
  }

  const result = await pipelineService.ingestSource(sourceConfig);

  console.log('\n📋 Ingestion Result:');
  console.log(`Source: ${result.sourceId}`);
  console.log(`Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log(`Records processed: ${result.ingestionResult.recordsProcessed}`);
  console.log(
    `Changes: +${result.ingestionResult.recordsAdded} ~${result.ingestionResult.recordsModified} -${result.ingestionResult.recordsDeleted}`,
  );

  if (result.changeSet && result.changeSet.modified.length > 0) {
    console.log('\n🔍 Modified Records:');
    result.changeSet.modified.slice(0, 5).forEach((change, idx) => {
      console.log(
        `  ${idx + 1}. Changed fields: ${change.changedFields.join(', ')}`,
      );
    });

    if (result.changeSet.modified.length > 5) {
      console.log(`  ... and ${result.changeSet.modified.length - 5} more`);
    }
  }

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Test connections to all data sources
 */
async function testDataSources(dataSourceService: DataSourceService) {
  console.log('🔍 Testing data source connections...');

  const sources = await dataSourceService.getEnabledSources();

  console.log(`\nTesting ${sources.length} data sources:\n`);

  for (const source of sources) {
    process.stdout.write(`${source.name} (${source.type})... `);

    const result = await dataSourceService.testConnection(source);

    if (result.success) {
      console.log(`✅ OK (${result.responseTime}ms)`);
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }
  }
}

/**
 * Clean up old data and snapshots
 */
async function cleanupOldData(changeDetectionService: ChangeDetectionService) {
  console.log('🧹 Cleaning up old data...');

  await changeDetectionService.cleanupOldData();

  console.log('✅ Cleanup completed');
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown() {
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    // TODO: Cancel running jobs, save state, close connections

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Set up graceful shutdown handlers
setupGracefulShutdown();

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { main };
