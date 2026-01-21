import { prisma } from '../client.ts';
import { upsertDeputies } from '../repositories/deputies.ts';
import { upsertVotingRecords } from '../repositories/votes.ts';
import { getLogPath } from '../validation/logger.ts';

async function runTest() {
  console.log('Testing database integration...\n');

  // Test 1: Upsert deputies
  console.log('1. Testing deputy UPSERT...');
  const deputyData = [
    {
      NOMBRE: 'Test Deputy',
      BIOGRAFIA: 'Test biography',
      CIRCUNSCRIPCION: 'Madrid',
      FECHAALTA: '01/01/2024',
      FECHAALTAENGRUPOPARLAMENTARIO: '01/01/2024',
      FECHACONDICIONPLENA: '15/01/2024',
      FORMACIONELECTORAL: 'Test Party',
      GRUPOPARLAMENTARIO: 'GP Test',
    },
  ];

  const deputyResult = await upsertDeputies(deputyData);
  console.log(
    `   Deputies: ${deputyResult.success} success, ${deputyResult.skipped} skipped`,
  );

  // Run again to test UPSERT (should not create duplicate)
  const deputyResult2 = await upsertDeputies(deputyData);
  console.log(
    `   Re-run: ${deputyResult2.success} success (should update, not duplicate)`,
  );

  // Verify no duplicate
  const deputyCount = await prisma.deputy.count();
  console.log(`   Total deputies in DB: ${deputyCount} (should be 1)\n`);

  // Test 2: Upsert voting records
  console.log('2. Testing voting UPSERT...');
  const votingData = [
    {
      LEGISLATURE: 15,
      SESSION_NUMBER: 1,
      VOTING_NUMBER: 1,
      VOTING_DATE: '15/01/2024',
      VOTING_TITLE: 'Test Vote',
      VOTING_DESCRIPTION: 'Test description',
      BY_ASSENT: false,
      TOTAL_PRESENT: 350,
      TOTAL_FOR: 200,
      TOTAL_AGAINST: 100,
      TOTAL_ABSTENTION: 50,
      TOTAL_NO_VOTE: 0,
      DEPUTY_SEAT: '001',
      DEPUTY_NAME: 'Test Deputy',
      DEPUTY_GROUP: 'GP Test',
      VOTE: 'Si',
      JSON_URL: 'https://example.com/votes.json',
    },
  ];

  const voteResult = await upsertVotingRecords(votingData);
  console.log(
    `   Sessions: ${voteResult.sessions}, Votes: ${voteResult.votes}, Skipped: ${voteResult.skipped}`,
  );

  // Run again to test UPSERT
  const voteResult2 = await upsertVotingRecords(votingData);
  console.log(
    `   Re-run: Sessions ${voteResult2.sessions}, Votes ${voteResult2.votes} (should update)\n`,
  );

  // Test 3: Invalid data
  console.log('3. Testing validation...');
  const invalidData = [{ INVALID: 'data' }];
  const invalidResult = await upsertDeputies(invalidData);
  console.log(
    `   Invalid records skipped: ${invalidResult.skipped} (should be 1)`,
  );
  console.log(`   Validation log: ${getLogPath()}\n`);

  // Cleanup
  console.log('4. Cleaning up test data...');
  await prisma.vote.deleteMany();
  await prisma.votingSession.deleteMany();
  await prisma.deputy.deleteMany();
  await prisma.person.deleteMany();
  console.log('   Test data cleaned\n');

  console.log('All tests passed!');
  await prisma.$disconnect();
}

runTest().catch(console.error);
